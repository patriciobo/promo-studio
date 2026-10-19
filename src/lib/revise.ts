// Cambios pedidos por el cliente por WhatsApp ("cambios 2: …"): el modelo de texto corrige la publicación,
// se vuelve a renderizar (regenerando sólo las imágenes que haga falta) y se le manda de nuevo al cliente.
// Lo que no se puede resolver solo (una foto que tiene que mandar, un video, algo confuso) queda para el dueño.
import { z } from 'zod'
import type { Post, PostType } from '@prisma/client'
import { db } from './db'
import { dataUri } from './media'
import { imagesForPlan, type PromptImage } from './images'
import { notify } from './notify'
import { completeJson } from './openrouter'
import { manifestOf, renderPost, toClient } from './pipeline'
import { MAX_CAROUSEL } from './photos'
import { sendText } from './whatsapp'
import type { Manifest } from './manifest'

/** Correcciones automáticas por publicación; después de esto el pedido queda para el dueño (evita idas y vueltas sin fin). */
export const MAX_AUTO_REVISIONS = 3

const SlideSchema = z.object({ eyebrow: z.string().optional(), title: z.string(), body: z.string().optional(), items: z.array(z.string()).optional(), imagePrompt: z.string().optional(), imageId: z.string().optional().nullable() })
export const RevisionSchema = z.object({
  caption: z.string(),
  altText: z.string().default(''),
  imagePrompt: z.string().optional().nullable(),
  slides: z.array(SlideSchema).min(1),
  regenerate: z.array(z.number().int()).default([]),
  needsHuman: z.string().optional().nullable(),
  summary: z.string().default(''),
})
export type Revision = z.infer<typeof RevisionSchema>
type Slide = z.infer<typeof SlideSchema>

const MAX_SLIDES: Record<PostType, number> = { IMAGE: 1, STORY: 1, CAROUSEL: MAX_CAROUSEL, REEL: 5 }

export function buildRevisePrompt(m: Manifest, post: Pick<Post, 'type' | 'caption' | 'altText' | 'imagePrompt' | 'slides'>, note: string, images: PromptImage[]) {
  const system = `You edit an Instagram post of "${m.name}" following the change request its client sent by WhatsApp. Apply exactly what the client asks and keep everything else as it is (same type, structure, tone and hashtags unless asked).
Write ALL user-facing text in ${m.languages[0]} with this tone: ${m.tone}. Never mention: ${m.avoid.join('; ') || 'nothing in particular'}. Never invent facts, prices, dates, features or claims that are not in the app data or in the client's request.
Never describe the images in the text (no colors, walls, furniture, objects or what is "in the photo"): titles, bodies and caption talk about the business, unless the client explicitly asks otherwise.
Slides: keep the same number unless the client asks to add or remove (max ${MAX_SLIDES[post.type]} for this ${post.type}). The attached images are the current slides as the client saw them, in order.
Images: a slide with imageId shows a real image of the business. To show a different real image, set imageId to one of appImages (only those ids). If the client wants a different generated picture (another scene, other colors, other style), rewrite that slide's imagePrompt in English (no text, letters or logos in the image) and put its 0-based index in "regenerate". Do not put in "regenerate" slides that keep their picture.
If the request cannot be done with these tools (for example the client will send a new photo or video, wants to change the logo or brand colors, asks something unrelated to the post, or it is too unclear to act on), set "needsHuman" to a short explanation in Spanish for the account manager and return the post unchanged. Otherwise "needsHuman" is null.
"summary": one short sentence in ${m.languages[0]} for the client saying what was changed.
Answer only with JSON: {"caption":string,"altText":string,"imagePrompt":string,"slides":[{"eyebrow"?:string,"title":string,"body"?:string,"items"?:string[],"imagePrompt"?:string,"imageId"?:string|null}],"regenerate":number[],"needsHuman":string|null,"summary":string}`
  const user = JSON.stringify({
    clientRequest: note,
    post: { type: post.type, caption: post.caption, altText: post.altText, imagePrompt: post.imagePrompt, slides: post.slides },
    app: { name: m.name, url: m.url, tagline: m.tagline, description: m.description, audience: m.audience, features: m.features, location: m.location, cta: m.cta },
    appImages: images.length ? images.map((i) => ({ id: i.id, kind: i.kind, shows: i.description, userNote: i.note ?? undefined })) : undefined,
  })
  return { system, user }
}

/** Lo que se guarda de la corrección: diapositivas dentro del máximo del tipo, sin imágenes inventadas y sólo las regeneraciones que existen. */
export function applyRevision(type: PostType, rev: Revision, knownImages: Set<string>) {
  const slides: Slide[] = rev.slides.slice(0, MAX_SLIDES[type]).map((s) => (s.imageId && !knownImages.has(s.imageId) ? { ...s, imageId: null } : s))
  const regenerate = [...new Set(rev.regenerate)].filter((i) => i >= 0 && i < slides.length && !slides[i].imageId)
  return { caption: rev.caption.trim().slice(0, 2200), altText: rev.altText.slice(0, 1000), imagePrompt: rev.imagePrompt || undefined, slides, regenerate }
}

/** Modo demo: un cambio visible en el título de la primera diapositiva, sin llamar a ningún modelo. */
const mockRevision = (post: Pick<Post, 'caption' | 'altText' | 'imagePrompt' | 'slides'>, note: string): Revision => {
  const slides = ((post.slides as Slide[] | null) ?? [{ title: 'Publicación' }]).map((s, i) => (i ? s : { ...s, title: `${s.title} (corregido)` }))
  return { caption: post.caption, altText: post.altText ?? '', imagePrompt: post.imagePrompt, slides, regenerate: [], needsHuman: /foto nueva|te mando/i.test(note) ? 'El cliente va a mandar una foto nueva.' : null, summary: 'Ajusté el título de la portada.' }
}

/** Aprobación automática: a las horas de la app o una hora antes de salir; si la fecha ya está encima o pasó, a las horas de la app. */
export function reviewDue(autoApproveHours: number, scheduledAt: Date | null, now = Date.now()) {
  const full = now + autoApproveHours * 3600e3
  const before = (scheduledAt?.getTime() ?? Infinity) - 3600e3
  return new Date(before > now + 3600e3 ? Math.min(full, before) : full)
}

/** Aplica el pedido del cliente a la publicación y se la manda de nuevo. Nunca relanza: si algo falla, queda para el dueño. */
export async function reviseFromClient(postId: string, note: string) {
  const post = await db.post.findUnique({ where: { id: postId }, include: { app: true, assets: true } })
  if (!post || post.status !== 'PENDING_REVIEW') return
  const app = post.app
  const label = `${app.name}${post.waNumber ? ` (la ${post.waNumber})` : ''}`
  const manual = async (why: string) => {
    await db.post.update({ where: { id: postId }, data: { reviewDueAt: null, error: `El cliente pidió cambios: ${note}. No se aplicaron solos: ${why}` } })
    await notify(`✏️ ${label}: el cliente pidió "${note}" y hace falta que lo hagas vos: ${why}`)
  }
  if (post.revisions >= MAX_AUTO_REVISIONS) return manual(`ya se corrigió sola ${MAX_AUTO_REVISIONS} veces.`)
  try {
    const m = manifestOf(app)
    const current = ((post.slides as Slide[] | null) ?? []).flatMap((s) => (s.imageId ? [s.imageId] : []))
    const images = await imagesForPlan(app.id, current, 0)
    const shown = await Promise.all(
      post.assets
        .filter((a) => a.kind === 'SLIDE')
        .sort((a, b) => a.position - b.position)
        .slice(0, 6)
        .map((a) => dataUri(a.path).catch(() => null)),
    )
    const { system, user } = buildRevisePrompt(m, post, note, images.prompt)
    let cost = 0
    const raw =
      process.env.OPENROUTER_MOCK === '1'
        ? mockRevision(post, note)
        : await completeJson({ appId: app.id, model: app.textModel, system, user, images: shown.filter((x): x is string => !!x), purpose: 'cambios del cliente', onCost: (c) => (cost = c) })
    const rev = RevisionSchema.parse(raw)
    if (rev.needsHuman) return manual(rev.needsHuman)
    const summary = rev.summary.trim().replace(/[.\s]+$/, '')
    const fix = applyRevision(post.type, rev, new Set(images.prompt.map((i) => i.id)))
    await db.post.update({
      where: { id: postId },
      data: { caption: fix.caption, altText: fix.altText, slides: fix.slides, imagePrompt: fix.imagePrompt, revisions: { increment: 1 }, textCostUsd: (post.textCostUsd ?? 0) + cost, error: null },
    })
    await renderPost(postId, { regenerate: fix.regenerate })
    // Vuelve a la ronda de aprobación: número nuevo para el cliente y, si no responde, se aprueba sola como cualquier otra.
    await db.post.update({ where: { id: postId }, data: { waNumber: null, reviewDueAt: reviewDue(app.autoApproveHours, post.scheduledAt) } })
    if (app.whatsapp) await sendText(app.whatsapp, `✏️ Listo el cambio que pediste${post.waNumber ? ` en la ${post.waNumber}` : ''}: ${summary || 'ya está corregida'}. Te la mando de nuevo para que la apruebes.`).catch(() => false)
    await toClient(app.id)
    await notify(`✏️ ${label}: apliqué el cambio que pidió el cliente ("${note}")${summary ? `: ${summary}` : ''}. Se la mandé de nuevo.`)
  } catch (e) {
    await manual(`no se pudo corregir sola (${(e as Error).message}).`)
  }
}
