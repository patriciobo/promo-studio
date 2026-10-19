// Lote semanal de una app: sincronizar el manifiesto → planificar con el modelo de texto →
// generar fondos con el modelo de imagen → renderizar las piezas → cola de revisión.
import type { App, AppImageKind, Post, PostType, Prisma } from '@prisma/client'
import { z } from 'zod'
import { brandFrom, type Brand } from '@/templates/brand'
import { SIZES, type SlideData } from '@/templates/html'
import { TEMPLATES } from '@/templates/styles'
import { buildReel, renderHtml } from '@/render/renderer'
import { db } from './db'
import { getFile, getRawBytes, latestReleases } from './github'
import { imagesForPlan, importFlowScreens, slideImages, type PromptImage } from './images'
import { DEFAULT_IMAGE_STYLE, DEFAULT_PHOTO_STYLE, FeedSchema, parseManifest, setYamlBrand, type Feed, type Manifest } from './manifest'
import { bufferDataUri, dataUri, mediaPath, saveMedia } from './media'
import { notify } from './notify'
import { sendForReview } from './whatsapp'
import { localDay, starterSlots, STARTER_TOPICS } from './starter'
import { kindsIn, parseKindChoice, parsePostKind, type ImageChoice, type ImageKind, type KindChoice } from './models'
import { drawLooks, forIllustration, ILLUSTRATION_ONLY, kindsFor, NATURAL_PHOTO, type Look, type Rng } from './variety'
import { designStyle, parseDesignStyle } from './styles'
import { MAX_CAROUSEL, parsePhotoMode, photoSetSlides, photoTreatment, type PhotoMode } from './photos'
import { completeJson, generateImage } from './openrouter'
import { localParts, roundTime, weekSlots, zonedTime, type Slot } from './schedule'
import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { extname } from 'node:path'

// ---------------------------------------------------------------------------
// 1. Sincronizar
// ---------------------------------------------------------------------------

export async function syncApp(appId: string) {
  const app = await db.app.findUniqueOrThrow({ where: { id: appId } })
  // Sin repositorio, el promo.yaml es el que se guardó en la pestaña promo.yaml. Con un repo recién cargado que todavía
  // no lo tiene, se sigue usando el guardado hasta que llegue al repo (el PR del asistente lo sube con el logo).
  const inRepo = app.repo ? await getFile(app.repo, app.manifestPath, app.branch) : null
  const file = inRepo ?? (app.manifestYaml ? { text: app.manifestYaml } : null)
  if (!file) {
    await db.app.update({ where: { id: appId }, data: { manifestError: app.repo ? `No existe ${app.manifestPath} en ${app.repo}@${app.branch}. Creálo con el asistente.` : 'Todavía no hay promo.yaml. Armalo en la pestaña promo.yaml a partir de una descripción del negocio.', syncedAt: new Date() } })
    return { ok: false as const, error: 'sin manifiesto' }
  }
  const r = parseManifest(file.text)
  if (!r.ok) {
    await db.app.update({ where: { id: appId }, data: { manifestError: r.error, syncedAt: new Date() } })
    return r
  }
  // Con el yaml guardado, el logo ya está en la carpeta de media: no se lo busca en el repo.
  if (r.hash !== app.manifestHash) await cacheBrandFiles(inRepo ? app : { ...app, repo: null }, r.manifest)
  // En cada sincronización: las capturas pueden cambiar sin tocar el promo.yaml.
  const flows = await importFlowScreens(app, r.manifest).catch((e) => (console.error('[flujos]', e.message), { imported: 0, archived: 0 }))
  // brand.style manda sólo cuando cambia el yaml: así lo elegido en Ajustes no se pisa en cada sincronización.
  const style = r.hash !== app.manifestHash ? parseDesignStyle(r.manifest.brand.style) : undefined
  await db.app.update({ where: { id: appId }, data: { manifest: r.manifest as Prisma.InputJsonValue, manifestHash: r.hash, manifestError: null, name: r.manifest.name, syncedAt: new Date(), ...(style ? { designStyle: style } : {}) } })
  return { ...r, flows }
}

/** Copia logo y capturas del repo (o URL) a la carpeta de media de la app. */
async function cacheBrandFiles(app: App, m: Manifest) {
  // Sin repositorio sólo se bajan las URLs: el logo subido ya está en la carpeta de media.
  const repo = app.repo
  const fetchAsset = async (src: string) => (/^https?:/.test(src) ? Buffer.from(await (await fetch(src)).arrayBuffer()) : repo ? await getRawBytes(repo, src, app.branch) : null)
  if (m.brand.logo) {
    const b = await fetchAsset(m.brand.logo).catch(() => null)
    if (b) await saveMedia(`apps/${app.slug}/logo${extname(m.brand.logo) || '.png'}`, b)
  }
  for (const [i, s] of m.screenshots.entries()) {
    const b = await fetchAsset(s).catch(() => null)
    if (b) await saveMedia(`apps/${app.slug}/shots/${i}${extname(s) || '.png'}`, b)
  }
  if (m.music) {
    const b = await fetchAsset(m.music).catch(() => null)
    if (b) await saveMedia(`apps/${app.slug}/music${extname(m.music) || '.mp3'}`, b)
  }
}

/**
 * Cuentas sin repositorio: guarda el logo en la carpeta de la app (donde lo busca brandOf) y lo apunta en brand.logo
 * del promo.yaml guardado en la base. Después sincroniza.
 */
export async function setRepoLessLogo(app: Pick<App, 'id' | 'slug' | 'manifestYaml'>, data: Buffer, ext: string) {
  for (const old of ['.png', '.jpg', '.jpeg', '.webp', '.svg']) if (old !== ext) await rm(mediaPath(`apps/${app.slug}/logo${old}`), { force: true })
  await saveMedia(`apps/${app.slug}/logo${ext}`, data)
  if (app.manifestYaml) await db.app.update({ where: { id: app.id }, data: { manifestYaml: setYamlBrand(app.manifestYaml, { logo: `logo${ext}` }) } })
  await syncApp(app.id)
}

export const manifestOf = (app: App) => {
  if (!app.manifest) throw new Error(`${app.name}: sin manifiesto válido (sincronizá primero)`)
  return app.manifest as unknown as Manifest
}

export async function brandOf(app: App): Promise<Brand> {
  const m = manifestOf(app)
  const ext = m.brand.logo ? extname(m.brand.logo) || '.png' : null
  const rel = ext ? `apps/${app.slug}/logo${ext}` : null
  return brandFrom(m, rel && existsSync(mediaPath(rel)) ? await dataUri(rel) : undefined)
}

async function screenshots(app: App) {
  const m = manifestOf(app)
  const out: string[] = []
  for (const [i, s] of m.screenshots.entries()) {
    const rel = `apps/${app.slug}/shots/${i}${extname(s) || '.png'}`
    if (existsSync(mediaPath(rel))) out.push(await dataUri(rel))
  }
  return out
}

/** Contexto adicional de las fuentes del manifiesto (feed de ideas y textos). */
async function sources(m: Manifest): Promise<{ feed: Feed['items']; texts: string[] }> {
  const feed: Feed['items'] = []
  const texts: string[] = []
  for (const s of m.sources) {
    try {
      const res = await fetch(s.url, { signal: AbortSignal.timeout(15000) })
      if (s.type === 'feed') {
        const parsed = FeedSchema.safeParse(await res.json())
        if (parsed.success) feed.push(...parsed.data.items)
      } else texts.push((await res.text()).slice(0, 4000))
    } catch {
      /* una fuente caída no frena el lote */
    }
  }
  return { feed, texts }
}

// ---------------------------------------------------------------------------
// 2. Planificar
// ---------------------------------------------------------------------------

const PlanSchema = z.object({
  posts: z.array(
    z.object({
      slot: z.number().int(),
      pillar: z.string(),
      hook: z.string(),
      caption: z.string(),
      hashtags: z.array(z.string()).default([]),
      altText: z.string().default(''),
      imagePrompt: z.string(),
      sourceId: z.string().optional().nullable(),
      slides: z.array(z.object({ eyebrow: z.string().optional(), title: z.string(), body: z.string().optional(), items: z.array(z.string()).optional(), imagePrompt: z.string().optional(), imageId: z.string().optional().nullable() })).min(1),
    }),
  ),
})
export type PlannedPost = z.infer<typeof PlanSchema>['posts'][number]

/** Saca los imageId que el modelo inventó (sólo valen los de la biblioteca que se le pasó). */
export function keepKnownImages<T extends { posts: PlannedPost[] }>(plan: T, images: PromptImage[]): T {
  const ids = new Set(images.map((i) => i.id))
  for (const p of plan.posts) for (const s of p.slides) if (s.imageId && !ids.has(s.imageId)) s.imageId = null
  return plan
}

/** Cómo va a quedar la foto elegida, para que el modelo mida el texto. */
const PHOTO_LAYOUT: Record<PhotoMode, string> = {
  fondo: 'The chosen image fills the whole slide and the text goes on top of it, so keep those slides short (a title plus a short body or up to 3 short items) to leave the image visible.',
  marco: 'The chosen image is shown framed inside the design next to the text, so those slides can carry a title plus a body or up to 4 short items.',
  mezcla: 'Slides with a chosen image alternate between the image filling the whole slide with the text on top (slide 1, 3, 5…: keep them short, a title plus a short body) and the image framed next to the text (slide 2, 4…: a title plus a body or up to 4 short items).',
}

/** Carrusel de fotos: una diapositiva por foto elegida, en orden. */
const photoSetRules = (n: number) => `${n} slides, exactly one per focus appImage in the given order (slide i uses the i-th focus image as imageId). Slide 1 is the hook; each slide's text talks about the business (a benefit, a feature, a reason to choose it) with its photo as backdrop, never describing the photo; the last slide also carries the call to action over its photo. No slide without a photo.`

const SLIDE_RULES: Record<PostType, string> = {
  IMAGE: '1 slide: title (max 70 chars) + body (max 140 chars).',
  CAROUSEL: '4-7 slides: slide 1 is a hook cover (title max 60 chars); middle slides teach one idea each (title + up to 4 short items OR a body); last slide is a call to action.',
  REEL: '3-5 scenes for a 15-second vertical video: very short titles (max 45 chars), optional body (max 80 chars); last scene is the call to action.',
  STORY: '1 slide: a short title (max 50 chars) and body (max 90 chars), conversational, inviting a reply or a link tap.',
}

/** Estética de las imágenes: la del estilo de diseño elegido o, en el clásico, la del promo.yaml (o la predeterminada). */
export const styleFor = (m: Manifest, kind: ImageKind, design?: string | null) =>
  designStyle(design).image?.[kind] ?? (kind === 'photo' ? (m.brand.photoStyle ?? DEFAULT_PHOTO_STYLE) : (m.brand.imageStyle ?? DEFAULT_IMAGE_STYLE))

/** ¿La estética de ese tipo es la propia del promo.yaml? Entonces manda ella: no se sortea gente ni se le suma el look de celular. */
export const ownStyle = (m: Manifest, kind: ImageKind, design?: string | null) =>
  !designStyle(design).image?.[kind] && !!(kind === 'photo' ? m.brand.photoStyle : m.brand.imageStyle)

/** Tipo de imagen de una generación: el elegido junto al botón o el de Ajustes (puede ser la mezcla). */
const kindOf = (app: Pick<App, 'imageKind'>, image?: ImageChoice): KindChoice => image?.kind ?? parseKindChoice(app.imageKind) ?? 'illustration'

/**
 * Sortea el look de `n` posts: tipo (en la mezcla, mitad y mitad), gente, escenario, encuadre y luz.
 * En el clásico sin estilo propio en el promo.yaml cambia la técnica de la ilustración entera; en los demás estilos, sólo un giro.
 */
export function looksFor(m: Manifest, design: string | null | undefined, choice: KindChoice, n: number, rng?: Rng): Look[] {
  const free = !designStyle(design).image && !m.brand.imageStyle
  const own = { illustration: ownStyle(m, 'illustration', design), photo: ownStyle(m, 'photo', design) }
  return drawLooks(kindsFor(choice, n, rng), { illustration: styleFor(m, 'illustration', design), photo: styleFor(m, 'photo', design) }, { free, own, colors: m.brand.colors }, rng)
}

/** Lo que el modelo de texto tiene que respetar en las imagePrompts de cada post. */
const visualOf = (l: Look) => (l.kind === 'text' ? { imageType: l.kind } : { imageType: l.kind, style: l.style, people: l.people, setting: l.setting, framing: l.framing, light: l.light })

export function buildPlanPrompt(m: Manifest, slots: Slot[], ctx: { feed: Feed['items']; texts: string[]; releases: { name: string; body: string }[]; recent: { pillar: string | null; hook: string | null }[]; bestPillars: string[]; topic?: string; daily?: { date: string; report: string }; images?: PromptImage[]; kind?: KindChoice; design?: string | null; brief?: string | null; starter?: { theme: string; goal: string; pin?: boolean }[]; photoMode?: PhotoMode; photoSet?: string[]; looks?: Look[] }) {
  const images = ctx.images ?? []
  const looks: Look[] = ctx.looks ?? kindsFor(ctx.kind ?? 'illustration', slots.length).map((kind) => ({ kind, style: kind === 'text' ? '' : styleFor(m, kind, ctx.design) }))
  const kinds = new Set(looks.map((l) => l.kind))
  const drawn = looks.some((l) => l.people)
  const styled = looks.some((l) => l.kind !== 'text' && !l.people)
  const focus = images.filter((i) => i.focus)
  const system = `You are the social media manager of the app "${m.name}". You write Instagram content that promotes the app with real value for its audience, never clickbait.
Write ALL user-facing text in ${m.languages[0]} with this tone: ${m.tone}.
Never mention: ${m.avoid.join('; ') || 'nothing in particular'}.
Image prompts are in English. Each slot has a "visual" brief drawn at random so the feed never looks the same: follow its imageType and style exactly.${kinds.has('text') ? `
- imageType "text": the post has no image at all, only the brand typography. Set every imagePrompt to "" and let the words carry the post: a title that works on its own (a figure, a direct question or a clear statement) and items or a checklist on the middle slides.` : ''}${kinds.has('illustration') ? `
- imageType "illustration": describe an illustration in that style, with simplified UI shapes. Never use photographic words (photo, realistic, camera, lens, bokeh, cinematic): it must not look like a photo.` : ''}${kinds.has('photo') ? `
- imageType "photo": describe a realistic photo in that style that looks candid, unposed and a bit imperfect, like a snapshot a friend took with a phone, with screens angled or out of focus. Ordinary-looking people as they really are, never models, a photoshoot or a studio.` : ''}
${drawn ? `Show people using the app or the problem it solves: when the visual brief has people, setting, framing and light, use them (describe the people concretely: age, look, build and clothes) and change them only if they contradict the slide or the app's audience; never default to young good-looking people. ` : ''}${styled ? `When the visual brief has only a style, that style rules the subject and composition: show the slide's idea the way it describes, and add people only if the style includes them. ` : ''}No readable text, letters, numbers or logos anywhere; fit the brand colors ${m.brand.colors.join(', ')} and leave calm space for overlaid text.
Every slide (or reel scene) also gets its own imagePrompt${kinds.has('text') ? ' (except in "text" posts)' : ''}: the same people, setting and style as the rest of its post, showing that slide's idea.${images.length ? `
appImages are real images of the app uploaded by the user (SCREENSHOT = a screen of the app, PHOTO = a photo). A slide can show one instead of a generated image: set its "imageId". Use what the image shows only as context to pick the right topic (a SCREENSHOT tells which feature to talk about, a PHOTO which part of the business); never invent features that are not visible. ${PHOTO_LAYOUT[ctx.photoMode ?? 'fondo']} Use each image at most once per post${ctx.photoSet ? '' : ' and never on the last call-to-action slide'}.` : ''}
NEVER describe the images in any user-facing text (titles, bodies, items, captions): the reader already sees them. Do not mention their colors, walls, furniture, decor, objects, materials, light, composition or what is "in the photo"; talk about the business instead: what it offers, why it matters to the audience and how to get it.
Captions: first line is a hook, 2-5 short lines of value, then the CTA "${m.cta}", then 3-5 specific hashtags (from: ${m.hashtags.join(' ') || 'choose relevant ones'}).
altText describes the image for accessibility and includes keywords people would search.
Answer only with JSON: {"posts":[{"slot":number,"pillar":string,"hook":string,"caption":string,"hashtags":string[],"altText":string,"imagePrompt":string,"sourceId":string|null,"slides":[{"eyebrow"?:string,"title":string,"body"?:string,"items"?:string[],"imagePrompt":string${images.length ? ',"imageId"?:string|null' : ''}}]}]}`
  const focusRule = focus.length
    ? ` The user wants this content based on the appImages marked focus:true (also attached as images): ${slots.length > 1 ? 'spread them across the week and use each one in at least one post' : 'use them in this post (a step-by-step if they show a flow, in order)'}, and build the text around the business topic they point to (never a description of the images).`
    : images.length
      ? ' Use appImages when they fit the post.'
      : ''
  const user = JSON.stringify({
    app: { name: m.name, url: m.url, tagline: m.tagline, description: m.description, audience: m.audience, features: m.features, pillars: m.pillars, location: m.location },
    week: slots.map((s, i) => ({ slot: i, type: s.type, day: ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'][s.day], slideRules: ctx.photoSet ? photoSetRules(ctx.photoSet.length) : SLIDE_RULES[s.type], visual: visualOf(looks[i]), ...(ctx.starter?.[i] ? { theme: ctx.starter[i].theme, themeGoal: ctx.starter[i].goal, pinnedOnProfile: ctx.starter[i].pin || undefined } : {}) })),
    ideasFromApp: ctx.feed.slice(0, 20).map((f) => ({ id: f.id, title: f.title, pillar: f.pillar, body: f.body?.slice(0, 300), bullets: f.bullets?.slice(0, 5) })),
    appTexts: ctx.texts.map((t) => t.slice(0, 2000)),
    recentReleases: ctx.releases,
    doNotRepeat: ctx.recent.map((r) => `${r.pillar}: ${r.hook}`),
    bestPerformingPillars: ctx.bestPillars,
    todaysEdition: ctx.daily ? { date: ctx.daily.date, report: ctx.daily.report } : undefined,
    appImages: images.length ? images.map((i) => ({ id: i.id, kind: i.kind, shows: i.description, userNote: i.note ?? undefined, focus: i.focus || undefined })) : undefined,
    instructions: (ctx.daily
      ? `Create exactly one post per slot about TODAY's edition (${ctx.daily.date}) in todaysEdition. Use ONLY facts stated in that report: no other news, no opinions, no predictions, no invented figures; attribute claims to the sources as the report does. CAROUSEL: slide 1 is a cover with the date as eyebrow and the day's main story as title; then 3-5 slides with the most relevant regions or the trade/commodities climate (title + up to 4 short items each); last slide invites to read the full edition and subscribe. STORY: the 3 main headlines of the day, very short. Captions summarize the day in 2-4 lines and invite to read the full edition.`
      : ctx.topic
      ? `Create exactly one post about this topic chosen by the user: "${ctx.topic}". Stay on that topic, connect it to the app naturally and do not repeat hooks from doNotRepeat.`
      : ctx.starter
      ? `This is the STARTER KIT of a new Instagram account: the first posts a visitor sees on the profile, so together they must explain clearly what the business is, who it is for, what it offers and how to start. Create exactly one post per slot following its theme and themeGoal, without repeating the same idea across posts. Pinned posts (pinnedOnProfile) must work on their own for a first-time visitor. Use ONLY facts from the app data (description, features, audience, location, url, texts): never invent figures, prices, clients, testimonials, awards, years or team names. Put the main keyword people would search (what the business is + city if there is a location) in the first line of the caption and in the altText, and stay on the same niche in every post so Instagram learns who to show the account to. End each caption with a soft call to action that fits the post (follow, save, send to someone, link in bio or message), without engagement bait like "comment YES".${ctx.brief ? ` The user adds this brief for the kit: "${ctx.brief}".` : ''}`
      : ctx.brief
      ? `Create exactly one post per slot following this brief from the user for the week: "${ctx.brief}". The brief has priority over balancing pillars and over ideasFromApp (use them only when they fit it); keep each slot's type and slideRules, stay true to the app (never invent features) and do not repeat hooks from doNotRepeat.`
      : 'Create exactly one post per slot. Balance the pillars (favor the best performing ones), use ideasFromApp when relevant (set sourceId), announce recent releases if any, and do not repeat hooks from doNotRepeat.') + focusRule,
  })
  return { system, user }
}

/** `imageIds`: imágenes subidas en las que se basa la semana (quedan en el lote por si hay que retomarlo). `round`: tanda de esa semana. */
export async function planBatch(appId: string, weekStart: Date, imageIds: string[] = [], kind?: KindChoice, batchKind: BatchKind = 'WEEK', round = 1) {
  const app = await db.app.findUniqueOrThrow({ where: { id: appId } })
  const m = manifestOf(app)
  const existing = await db.batch.findUnique({ where: { appId_weekStart_kind_round: { appId, weekStart, kind: batchKind, round } }, include: { _count: { select: { posts: true } } } })
  if (existing) {
    // Nunca se borran posts de un lote: un lote fallido que ya tiene posts se retoma (se renderiza lo que falta),
    // así no se pierde lo que ya revisaste o aprobaste.
    if (existing._count.posts) return existing.status === 'READY' && !existing.error ? existing : db.batch.update({ where: { id: existing.id }, data: { status: 'GENERATING', error: null } })
    // Sin posts: se vuelve a planificar si falló o quedó trabado planificando (p. ej. el worker se reinició).
    if (existing.status !== 'FAILED' && existing.status !== 'PLANNING') return existing
  }
  const focus = imageIds.length ? imageIds : (existing?.imageIds ?? [])
  const batch = existing
    ? await db.batch.update({ where: { id: existing.id }, data: { status: 'PLANNING', error: null, imageIds: focus } })
    : await db.batch.create({ data: { appId, weekStart, status: 'PLANNING', imageIds: focus, kind: batchKind, round } })
  try {
    return await planPosts(app, m, batch.id, weekStart, focus, kind ?? kindOf(app), batch.brief, batchKind, round)
  } catch (e) {
    await db.batch.update({ where: { id: batch.id }, data: { status: 'FAILED', error: `No se pudo planificar: ${(e as Error).message}` } })
    await notify(`⚠️ ${app.name}: falló la planificación ${batchKind === 'STARTER' ? 'del kit inicial' : 'de la semana'} del ${weekStart.toISOString().slice(0, 10)}: ${(e as Error).message}`)
    return db.batch.findUniqueOrThrow({ where: { id: batch.id } })
  }
}

async function planPosts(app: App, m: Manifest, batchId: string, weekStart: Date, imageIds: string[], kind: KindChoice, brief: string | null, batchKind: BatchKind, round = 1) {
  const appId = app.id
  const batch = { id: batchId }

  const starter = batchKind === 'STARTER'
  const slots = starter ? starterSlots(weekStart, app.postTime, app.timezone) : await withoutStarterDays(app, weekSlots(weekStart, m.cadence, roundTime(app.postTime, round), app.timezone))
  if (!slots.length) return db.batch.update({ where: { id: batch.id }, data: { status: 'READY', notes: 'Cadencia semanal en 0' } })
  const [src, releases, recent, scored, images] = await Promise.all([
    sources(m),
    app.repo ? latestReleases(app.repo) : [],
    db.post.findMany({ where: { appId }, orderBy: { createdAt: 'desc' }, take: 30, select: { pillar: true, hook: true } }),
    db.post.groupBy({ by: ['pillar'], where: { appId, score: { not: null } }, _avg: { score: true } }),
    imagesForPlan(appId, imageIds),
  ])
  const bestPillars = scored
    .filter((s) => s.pillar)
    .sort((a, b) => (b._avg.score ?? 0) - (a._avg.score ?? 0))
    .slice(0, 3)
    .map((s) => s.pillar!)
  const looks = looksFor(m, app.designStyle, kind, slots.length)
  const { system, user } = buildPlanPrompt(m, slots, { ...src, releases: releases.filter((r) => Date.now() - Date.parse(r.date) < 30 * 864e5), recent, bestPillars, images: images.prompt, looks, design: app.designStyle, photoMode: parsePhotoMode(app.photoMode), brief, starter: starter ? STARTER_TOPICS.map((t) => ({ theme: t.label, goal: t.brief, pin: t.pin })) : undefined })
  let textCost = 0
  const raw = process.env.OPENROUTER_MOCK === '1' ? mockPlan(m, slots, src.feed, imageIds) : await completeJson({ appId, model: app.textModel, system, user, images: images.shown, purpose: `${starter ? 'kit inicial' : 'plan'} ${weekStart.toISOString().slice(0, 10)}`, onCost: (c) => (textCost = c) })
  const plan = keepKnownImages(PlanSchema.parse(raw), images.prompt)
  for (const [i, slot] of slots.entries()) {
    const p = plan.posts.find((x) => x.slot === i) ?? plan.posts[i]
    if (!p) continue
    // Una llamada planifica toda la semana: cada post carga su parte.
    await db.post.create({ data: { ...postFromPlan(app, batch.id, slot, p, looks[i]), textCostUsd: textCost / slots.length } })
  }
  return db.batch.update({ where: { id: batch.id }, data: { status: 'GENERATING' } })
}

export type BatchKind = 'WEEK' | 'STARTER'

/** Los días con posts del kit inicial no llevan otro post de feed de la semana (las historias sí quedan). */
async function withoutStarterDays(app: App, slots: Slot[]) {
  if (!slots.length) return slots
  const from = slots[0].at
  const to = slots[slots.length - 1].at
  const taken = await db.post.findMany({ where: { appId: app.id, batch: { kind: 'STARTER' }, status: { notIn: ['REJECTED', 'FAILED'] }, scheduledAt: { gte: new Date(from.getTime() - 864e5), lte: new Date(to.getTime() + 864e5) } }, select: { scheduledAt: true } })
  const days = new Set(taken.map((p) => localDay(p.scheduledAt!, app.timezone)))
  return slots.filter((s) => s.type === 'STORY' || !days.has(localDay(s.at, app.timezone)))
}

/**
 * Modo demo (OPENROUTER_MOCK=1): arma la semana con las ideas del feed de la app y sus funciones,
 * sin llamar a ningún modelo. Sirve para probar el circuito completo sin gastar crédito.
 */
export function mockPlan(m: Manifest, slots: Slot[], feed: Feed['items'], imageIds: string[] = []) {
  const ideas = feed.length ? feed : m.features.map((f, i) => ({ id: `f${i}`, title: f, body: m.tagline, bullets: undefined, pillar: m.pillars[i % m.pillars.length] }))
  return {
    posts: slots.map((s, i) => {
      const idea = ideas[i % ideas.length]
      const bullets = idea.bullets?.length ? idea.bullets.slice(0, 4) : m.features.slice(0, 3)
      const slides =
        s.type === 'CAROUSEL'
          ? [{ eyebrow: idea.pillar ?? m.pillars[0], title: idea.title, body: idea.body?.slice(0, 120) }, { title: 'Cómo hacerlo', items: bullets }, { title: m.tagline, items: m.features.slice(0, 3) }, { title: m.cta, body: m.url }]
          : s.type === 'REEL'
            ? [{ eyebrow: idea.pillar ?? m.pillars[0], title: idea.title }, { title: bullets[0] ?? m.tagline }, { title: m.cta }]
            : [{ eyebrow: idea.pillar ?? m.pillars[0], title: idea.title, body: (idea.body ?? m.tagline).slice(0, 120) }]
      // Las imágenes elegidas se reparten entre los posts: van en la segunda diapositiva (o la única).
      const imageId = imageIds[i % (imageIds.length || 1)]
      if (imageId) (slides[slides.length > 1 ? 1 : 0] as { imageId?: string }).imageId = imageId
      return {
        slot: i,
        pillar: idea.pillar ?? m.pillars[0],
        hook: idea.title,
        caption: `${idea.title}\n\n${(idea.body ?? m.tagline).slice(0, 300)}\n\n${m.cta}`,
        hashtags: m.hashtags.slice(0, 4),
        altText: `${idea.title}. ${m.name}`,
        imagePrompt: `${idea.title}, ${m.audience.description ?? m.tagline}`,
        sourceId: idea.id,
        slides,
      }
    }),
  }
}

export function postFromPlan(app: Pick<App, 'id'>, batchId: string | null, slot: Slot, p: PlannedPost, look?: Look): Prisma.PostUncheckedCreateInput {
  const tags = p.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).filter((h) => !p.caption.includes(h))
  const slides = slot.type === 'CAROUSEL' ? p.slides.slice(0, MAX_CAROUSEL) : slot.type === 'REEL' ? p.slides.slice(0, 5) : p.slides.slice(0, 1)
  return {
    appId: app.id,
    batchId,
    type: slot.type,
    status: 'DRAFT',
    pillar: p.pillar,
    hook: p.hook,
    caption: [p.caption.trim(), tags.join(' ')].filter(Boolean).join('\n\n').slice(0, 2200),
    altText: p.altText.slice(0, 1000),
    slides: slides as Prisma.InputJsonValue,
    imagePrompt: p.imagePrompt,
    imageKind: look?.kind,
    imageStyle: look?.style,
    scheduledAt: slot.at,
  }
}

// ---------------------------------------------------------------------------
// 3. Generar y renderizar
// ---------------------------------------------------------------------------

type Slide = { eyebrow?: string; title: string; body?: string; items?: string[]; imagePrompt?: string; imageId?: string | null }

const vertical = (t: PostType) => t === 'REEL' || t === 'STORY'

/**
 * Cómo se arma cada diapositiva: portada a sangre, texto (con ilustración o captura) o cierre de color.
 * `own`: tipo de la imagen subida que lleva la diapositiva; una captura va enmarcada junto al texto y una foto, como la ilustración.
 */
export function slideLayout(type: PostType, total: number, i: number, hasShot: boolean, slide: Slide, own?: AppImageKind): 'cover' | 'text-illustration' | 'text-shot' | 'cta' {
  const isCta = i === total - 1 && total > 2
  if (isCta) return 'cta'
  if (own === 'SCREENSHOT') return 'text-shot'
  if (i === 0 || type === 'REEL') return 'cover'
  if (own === 'PHOTO') return 'text-illustration'
  return i === 1 && hasShot && !slide.items?.length ? 'text-shot' : 'text-illustration'
}

/**
 * Ilustración con IA para una diapositiva (`position`). Reutiliza la existente salvo que se pida regenerar,
 * así volver a renderizar no cuesta nada. `references`: ilustraciones anteriores del post, para mantener el estilo.
 */
async function background(app: App, post: Post, position: number, scene: string | undefined, opts: { force?: boolean; references?: string[]; image: ImageChoice; look: { kind: ImageKind; style: string } }): Promise<string | undefined> {
  const prev = await db.asset.findFirst({ where: { postId: post.id, kind: 'BACKGROUND', position }, orderBy: { createdAt: 'desc' } })
  if (prev && !opts.force && existsSync(mediaPath(prev.path))) return dataUri(prev.path)
  const { model, quality } = opts.image
  if (!model || !scene || process.env.OPENROUTER_MOCK === '1') return undefined
  const prompt = imagePromptFor(manifestOf(app), scene, opts.look, app.designStyle)
  const kind = opts.look.kind
  const img = await generateImage({ appId: app.id, model, quality, prompt, aspectRatio: vertical(post.type) ? '9:16' : '4:5', references: opts.references, kind, purpose: `${kind === 'photo' ? 'foto' : 'ilustración'} ${post.type} ${position + 1}` })
  const rel = await saveMedia(`apps/${app.slug}/posts/${post.id}/bg-${position}-${Date.now()}.jpg`, img.data)
  await db.asset.create({ data: { postId: post.id, kind: 'BACKGROUND', position, path: rel, prompt, model, costUsd: img.cost } })
  return bufferDataUri(img.data, img.mime)
}

/**
 * Prompt de una imagen IA: la foto, natural y sin estudio (salvo que el promo.yaml traiga su estética de foto, que manda);
 * la ilustración, sin nada que la vuelva realista.
 */
export function imagePromptFor(m: Manifest, scene: string, look: { kind: ImageKind; style: string }, design?: string | null) {
  const colors = m.brand.colors.join(', ')
  return look.kind === 'photo'
    ? `Candid real-life photo. ${scene}. Style: ${look.style}.${ownStyle(m, 'photo', design) ? '' : ` ${NATURAL_PHOTO}`} Subtle touches of the brand colors ${colors} in clothes or objects, natural color grading. Absolutely no text, letters, numbers, logos or watermarks.`
    : `Illustration. ${forIllustration(scene)}. Style: ${look.style}. Color palette ${colors}. ${ILLUSTRATION_ONLY} Absolutely no text, letters, numbers, logos or watermarks.`
}

/**
 * Tipo y estética de las imágenes del post: los sorteados al planificarlo. Si al regenerar se elige otro tipo
 * (o el post es de antes de que se guardaran), se sortea uno nuevo y queda guardado.
 */
async function lookOf(app: App, post: Post, choice?: KindChoice): Promise<Pick<Look, 'kind' | 'style'>> {
  const planned = parsePostKind(post.imageKind)
  if (planned && (planned === 'text' || post.imageStyle) && (!choice || kindsIn(choice).includes(planned))) return { kind: planned, style: post.imageStyle ?? '' }
  const [look] = looksFor(manifestOf(app), app.designStyle, choice ?? kindOf(app), 1)
  await db.post.update({ where: { id: post.id }, data: { imageKind: look.kind, imageStyle: look.style } })
  return look
}

/**
 * Renderiza las piezas finales del post (JPEG o MP4) y las guarda como assets publicables.
 * `image`: modelo elegido junto al botón; si no viene, el de la app (Ajustes).
 */
export async function renderPost(postId: string, opts: { regenerateImage?: boolean; regenerate?: number[]; image?: ImageChoice } = {}) {
  const post = await db.post.findUniqueOrThrow({ where: { id: postId }, include: { app: true } })
  const app = post.app
  const brand = await brandOf(app)
  const slides = (post.slides as Slide[] | null) ?? [{ title: post.hook ?? app.name }]
  const shots = await screenshots(app)
  const own = await slideImages(app.id, slides.flatMap((s) => (s.imageId ? [s.imageId] : [])))
  const size = vertical(post.type) ? SIZES.story : SIZES.feed
  const image = opts.image ?? { model: app.imageModel, quality: app.imageQuality }
  const t = TEMPLATES[designStyle(app.designStyle).id]
  const mode = parsePhotoMode(post.photoMode) ?? parsePhotoMode(app.photoMode) ?? 'fondo'
  const look = slides.some((s) => !s.imageId) ? await lookOf(app, post, opts.image?.kind) : { kind: 'illustration' as const, style: '' }
  // Una ilustración por diapositiva (salvo el cierre y la de la captura), en orden: la primera es la referencia de estilo.
  const html: string[] = []
  const refs: string[] = []
  for (const [i, s] of slides.entries()) {
    const mine = s.imageId ? own.get(s.imageId) : undefined
    const layout = slideLayout(post.type, slides.length, i, shots.length > 0, s, mine?.kind)
    const d: SlideData = { ...s, index: i, total: post.type === 'CAROUSEL' ? slides.length : undefined }
    // Imagen elegida por el usuario (aunque sea el cierre, como en el carrusel de fotos): según el tratamiento,
    // protagonista (a sangre, o la captura grande) con el texto delante, o enmarcada en el estilo. No se genera nada.
    if (mine) {
      const own = mine.kind === 'SCREENSHOT' ? { screenshot: mine.src } : photoTreatment(mode, i) === 'hero' ? { background: mine.src } : { illustration: mine.src }
      html.push(photoTreatment(mode, i) === 'hero' ? t.hero(brand, { ...d, ...own }, size) : t.text(brand, { ...d, ...own }, size))
      continue
    }
    if (layout === 'cta') {
      html.push(t.cta(brand, d, size))
      continue
    }
    if (layout === 'text-shot') {
      html.push(t.text(brand, { ...d, screenshot: shots[0] }, size))
      continue
    }
    // Sólo texto: la pieza va sin imagen. Un post de texto al que después se le pide imagen no tiene escenas: se usa el título.
    const kind = look.kind
    const scene = s.imagePrompt || (i === 0 ? post.imagePrompt : post.imagePrompt && `${post.imagePrompt}. Scene about: ${s.title}`) || s.title
    const img = kind === 'text' ? undefined : await background(app, post, i, scene, { force: opts.regenerateImage || opts.regenerate?.includes(i), references: refs.slice(0, 1), image, look: { kind, style: look.style } })
    if (img && !refs.length) refs.push(img)
    html.push(layout === 'cover' ? t.cover(brand, { ...d, background: img }, size) : t.text(brand, { ...d, illustration: img }, size))
  }
  await db.asset.deleteMany({ where: { postId, kind: { in: ['SLIDE', 'VIDEO'] } } })
  const stamp = Date.now()
  if (post.type === 'REEL') {
    const scenes = await Promise.all(html.map((h) => renderHtml(h, size.w, size.h)))
    const musicRel = manifestOf(app).music ? `apps/${app.slug}/music${extname(manifestOf(app).music!) || '.mp3'}` : null
    const music = musicRel && existsSync(mediaPath(musicRel)) ? await readFile(mediaPath(musicRel)) : undefined
    const video = await buildReel(scenes, { music })
    const rel = await saveMedia(`apps/${app.slug}/posts/${post.id}/reel-${stamp}.mp4`, video)
    const cover = await saveMedia(`apps/${app.slug}/posts/${post.id}/cover-${stamp}.jpg`, scenes[0])
    await db.asset.createMany({
      data: [
        { postId, kind: 'VIDEO', path: rel, width: size.w, height: size.h, position: 0 },
        { postId, kind: 'SLIDE', path: cover, width: size.w, height: size.h, position: 0 },
      ],
    })
  } else {
    for (const [i, h] of html.entries()) {
      const jpg = await renderHtml(h, size.w, size.h)
      const rel = await saveMedia(`apps/${app.slug}/posts/${post.id}/${String(i + 1).padStart(2, '0')}-${stamp}.jpg`, jpg)
      await db.asset.create({ data: { postId, kind: 'SLIDE', path: rel, width: size.w, height: size.h, position: i } })
    }
  }
}

/** Posts del lote que falta renderizar: los nuevos y los que fallaron al generarse. Lo revisado no se toca. */
export const needsRender = (p: { status: string; slideCount: number }) => p.status === 'DRAFT' || (p.status === 'FAILED' && p.slideCount === 0)

/**
 * Renderiza los posts pendientes del lote, de a uno: si uno falla queda marcado con su error y los demás siguen.
 * No relanza errores, para que la cola no reintente el lote entero.
 */
export async function generateBatch(batchId: string, image?: ImageChoice) {
  const batch = await db.batch.findUniqueOrThrow({ where: { id: batchId }, include: { app: true, posts: { include: { _count: { select: { assets: { where: { kind: 'SLIDE' } } } } } } } })
  const reviewHours = batch.app.autoApproveHours
  const todo = batch.posts.filter((p) => needsRender({ status: p.status, slideCount: p._count.assets }))
  const failed: string[] = []
  for (const post of todo) {
    try {
      await renderPost(post.id, { image })
      const due = new Date(Math.min(Date.now() + reviewHours * 3600e3, (post.scheduledAt?.getTime() ?? Infinity) - 3600e3))
      await db.post.update({ where: { id: post.id }, data: { status: 'PENDING_REVIEW', reviewDueAt: due, error: null } })
    } catch (e) {
      failed.push((e as Error).message)
      await db.post.update({ where: { id: post.id }, data: { status: 'FAILED', error: `No se pudo generar: ${(e as Error).message}` } })
    }
  }
  const ok = todo.length - failed.length
  const error = failed.length ? `${failed.length} de ${todo.length} publicaciones no se pudieron generar (${failed[0]}). Tocá "Generar semana" para reintentar sólo esas.` : null
  await db.batch.update({ where: { id: batchId }, data: { status: failed.length && !ok ? 'FAILED' : 'READY', error } })
  if (ok) await notify(`📸 ${batch.app.name}: ${ok} publicaciones ${batch.kind === 'STARTER' ? 'del kit inicial' : 'de la semana'} listas para revisar. Se aprueban solas en ${reviewHours} h.`)
  if (ok) await toClient(batch.app.id)
  if (failed.length) await notify(`⚠️ ${batch.app.name}: ${error}`)
}

/** Manda al WhatsApp del cliente lo que quedó para aprobar. Si falla, avisa y sigue: la revisión en la web no depende de esto. */
export async function toClient(appId: string) {
  try {
    const r = await sendForReview(appId)
    if (r.sent) console.log(`[whatsapp] ${r.sent} publicaciones mandadas al cliente`)
    return r
  } catch (e) {
    await notify(`⚠️ No se pudieron mandar las publicaciones al WhatsApp del cliente: ${(e as Error).message}`)
    return { sent: 0, error: (e as Error).message }
  }
}

/** Sincronizar + planificar + generar la semana que empieza en `weekStart`. */
export async function runWeekly(appId: string, weekStart: Date, image?: ImageChoice, imageIds?: string[], batchKind: BatchKind = 'WEEK', round = 1) {
  const app = await db.app.findUniqueOrThrow({ where: { id: appId } })
  if (app.paused) return null
  const s = await syncApp(appId)
  if (!s.ok && !app.manifest) throw new Error(`${app.name}: ${'error' in s ? s.error : 'manifiesto inválido'}`)
  const batch = await planBatch(appId, weekStart, imageIds, image?.kind, batchKind, round)
  if (batch.status === 'GENERATING') await generateBatch(batch.id, image)
  return batch
}

// ---------------------------------------------------------------------------
// 4. Publicación a pedido
// ---------------------------------------------------------------------------

/**
 * Arma y renderiza un solo post sobre un tema elegido. Queda en revisión sin fecha ni aprobación automática:
 * se publica cuando lo pedís desde Revisión.
 */
/** `photoSet`: carrusel de fotos, una diapositiva por imagen elegida (en orden). */
export async function createOnDemand(postId: string, topic: string, image?: ImageChoice, imageIds: string[] = [], photoSet = false) {
  const post = await db.post.findUniqueOrThrow({ where: { id: postId }, include: { app: true } })
  const app = post.app
  try {
    const m = manifestOf(app)
    const now = new Date()
    const slot: Slot = { type: post.type, day: (now.getDay() + 6) % 7, at: now }
    const fullTopic = post.pillar ? `${topic} (pillar: ${post.pillar})` : topic
    const [src, recent, images] = await Promise.all([
      sources(m),
      db.post.findMany({ where: { appId: app.id, id: { not: postId } }, orderBy: { createdAt: 'desc' }, take: 30, select: { pillar: true, hook: true } }),
      imagesForPlan(app.id, imageIds, photoSet ? MAX_CAROUSEL : undefined),
    ])
    const set = photoSet ? imageIds.slice(0, MAX_CAROUSEL) : undefined
    const photoMode = parsePhotoMode(post.photoMode) ?? parsePhotoMode(app.photoMode)
    const looks = looksFor(m, app.designStyle, kindOf(app, image), 1)
    const { system, user } = buildPlanPrompt(m, [slot], { feed: [], texts: src.texts, releases: [], recent, bestPillars: [], topic: fullTopic, images: images.prompt, looks, design: app.designStyle, photoMode, photoSet: set })
    let textCost = 0
    const raw =
      process.env.OPENROUTER_MOCK === '1'
        ? mockPlan(m, [slot], [{ id: 'tema', title: topic, body: m.tagline, pillar: post.pillar ?? m.pillars[0] }], imageIds)
        : await completeJson({ appId: app.id, model: app.textModel, system, user, images: images.shown, purpose: `a pedido ${post.type}`, onCost: (c) => (textCost = c) })
    const p = keepKnownImages(PlanSchema.parse(raw), images.prompt).posts[0]
    if (!p) throw new Error('El modelo no devolvió ninguna publicación')
    if (set) p.slides = photoSetSlides(p.slides, set, p.hook)
    const { pillar, hook, caption, altText, slides, imagePrompt, imageKind, imageStyle } = postFromPlan(app, null, slot, p, looks[0])
    await db.post.update({ where: { id: postId }, data: { pillar: post.pillar ?? pillar, hook, caption, altText, slides, imagePrompt, imageKind, imageStyle, textCostUsd: textCost } })
    await renderPost(postId, { image })
    await db.post.update({ where: { id: postId }, data: { status: 'PENDING_REVIEW', reviewDueAt: null, error: null } })
    await toClient(app.id)
  } catch (e) {
    await db.post.update({ where: { id: postId }, data: { status: 'FAILED', error: `No se pudo generar: ${(e as Error).message}` } })
  }
}

// ---------------------------------------------------------------------------
// 5. Edición diaria (apps de noticias)
// ---------------------------------------------------------------------------

/** Desde cuánto antes de la hora de publicación se empieza a buscar el reporte del día. */
const DAILY_LOOKAHEAD_MIN = 4 * 60
/** Hasta cuánto después de la hora se sigue esperando el reporte antes de avisar que no llegó. */
const DAILY_GIVE_UP_MIN = 4 * 60
/** Margen mínimo para revisar si el reporte llega tarde. */
const DAILY_REVIEW_MIN = 20

export const dailySourceUrl = (template: string, date: string) => template.replaceAll('{fecha}', date)

/** Achica el reporte para el prompt: saca las referencias numeradas con link y recorta. */
export function compactReport(md: string, max = 14000) {
  return md
    .replace(/\[\[\d+\]\]\(<[^>]*>\)/g, '')
    .replace(/\(<https?:[^>]*>\)/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .slice(0, max)
}

/**
 * Corre cada pocos minutos: si a la app le toca la edición de hoy y el reporte ya está publicado,
 * arma los posts del día, los deja en revisión y los programa a la hora de `daily.time` (se aprueban solos).
 */
export async function runDaily(appId: string, now = new Date()) {
  const app = await db.app.findUniqueOrThrow({ where: { id: appId } })
  const daily = app.manifest ? manifestOf(app).daily : undefined
  if (!daily || app.paused) return 'sin edición diaria'
  const { date, minutes } = localParts(now, app.timezone)
  const [hh, mm] = daily.time.split(':').map(Number)
  const publishMin = hh * 60 + mm
  if (minutes < publishMin - DAILY_LOOKAHEAD_MIN) return 'todavía no'
  if (await db.post.count({ where: { appId, dailyDate: date } })) return 'ya hecha'

  const url = dailySourceUrl(daily.source, date)
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) }).catch(() => null)
  if (!res?.ok) {
    if (minutes < publishMin + DAILY_GIVE_UP_MIN) return 'reporte sin publicar'
    // Marca el día como fallido (así no se reintenta ni se avisa de nuevo) y avisa.
    await db.post.createMany({ data: daily.types.map((type) => ({ appId, type, dailyDate: date, status: 'FAILED' as const, hook: `Edición ${date}`, error: `No se encontró el reporte del día en ${url}` })), skipDuplicates: true })
    await notify(`⚠️ ${app.name}: no apareció el reporte del ${date} (${url}). Hoy no hay edición diaria.`)
    return 'reporte no llegó'
  }
  const report = compactReport(await res.text())

  // Reserva los posts del día (la clave única appId+dailyDate+type evita duplicados si dos workers corren a la vez).
  const [y, mo, d] = date.split('-').map(Number)
  const publishAt = new Date(Math.max(zonedTime(y, mo, d, hh, mm, app.timezone).getTime(), now.getTime() + DAILY_REVIEW_MIN * 60e3))
  const slots: Slot[] = daily.types.map((type, i) => ({ type, day: (now.getDay() + 6) % 7, at: new Date(publishAt.getTime() + i * 5 * 60e3) }))
  const claimed = await db.post.createMany({ data: slots.map((s) => ({ appId, type: s.type, dailyDate: date, status: 'DRAFT' as const, hook: `Edición ${date}`, scheduledAt: s.at })), skipDuplicates: true })
  if (claimed.count !== slots.length) return 'ya en curso'
  const posts = await db.post.findMany({ where: { appId, dailyDate: date } })

  try {
    const m = manifestOf(app)
    const looks = looksFor(m, app.designStyle, kindOf(app), slots.length)
    const { system, user } = buildPlanPrompt(m, slots, { feed: [], texts: [], releases: [], recent: [], bestPillars: [], daily: { date, report }, looks, design: app.designStyle })
    let textCost = 0
    const raw =
      process.env.OPENROUTER_MOCK === '1'
        ? mockPlan(m, slots, [...report.matchAll(/^#{2,3} (.+)$/gm)].slice(0, 6).map((h, i) => ({ id: `d${i}`, title: h[1], body: m.tagline, pillar: m.pillars[0] })))
        : await completeJson({ appId, model: app.textModel, system, user, purpose: `edición diaria ${date}`, onCost: (c) => (textCost = c) })
    const plan = PlanSchema.parse(raw)
    for (const [i, slot] of slots.entries()) {
      const p = plan.posts.find((x) => x.slot === i) ?? plan.posts[i]
      const post = posts.find((x) => x.type === slot.type)!
      if (!p) throw new Error(`el modelo no armó el post ${slot.type}`)
      const { pillar, hook, caption, altText, slides, imagePrompt, imageKind, imageStyle } = postFromPlan(app, null, slot, p, looks[i])
      await db.post.update({ where: { id: post.id }, data: { pillar, hook, caption, altText, slides, imagePrompt, imageKind, imageStyle, textCostUsd: textCost / slots.length } })
      await renderPost(post.id)
      // Se aprueba solo un minuto antes de publicarse, si no lo tocaste.
      await db.post.update({ where: { id: post.id }, data: { status: 'PENDING_REVIEW', reviewDueAt: new Date(slot.at.getTime() - 60e3), error: null } })
    }
    const hora = new Intl.DateTimeFormat('es-AR', { timeZone: app.timezone, hour: '2-digit', minute: '2-digit' }).format(publishAt)
    await notify(`📰 ${app.name}: edición del ${date} lista para revisar. Se publica sola a las ${hora}.`)
    await toClient(app.id)
    return 'lista'
  } catch (e) {
    await db.post.updateMany({ where: { appId, dailyDate: date, status: 'DRAFT' }, data: { status: 'FAILED', error: `No se pudo generar la edición: ${(e as Error).message}` } })
    await notify(`⚠️ ${app.name}: falló la edición diaria del ${date}: ${(e as Error).message}`)
    return 'falló'
  }
}
