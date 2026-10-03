// Lote semanal de una app: sincronizar el manifiesto → planificar con el modelo de texto →
// generar fondos con el modelo de imagen → renderizar las piezas → cola de revisión.
import type { App, Post, PostType, Prisma } from '@prisma/client'
import { z } from 'zod'
import { brandFrom, type Brand } from '@/templates/brand'
import { coverSlide, ctaSlide, SIZES, textSlide, type SlideData } from '@/templates/html'
import { buildReel, renderHtml } from '@/render/renderer'
import { db } from './db'
import { getFile, getRawBytes, latestReleases } from './github'
import { DEFAULT_IMAGE_STYLE, FeedSchema, parseManifest, type Feed, type Manifest } from './manifest'
import { bufferDataUri, dataUri, mediaPath, saveMedia } from './media'
import { notify } from './notify'
import type { ImageChoice } from './models'
import { completeJson, generateImage } from './openrouter'
import { localParts, weekSlots, zonedTime, type Slot } from './schedule'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

// ---------------------------------------------------------------------------
// 1. Sincronizar
// ---------------------------------------------------------------------------

export async function syncApp(appId: string) {
  const app = await db.app.findUniqueOrThrow({ where: { id: appId } })
  const file = await getFile(app.repo, app.manifestPath, app.branch)
  if (!file) {
    await db.app.update({ where: { id: appId }, data: { manifestError: `No existe ${app.manifestPath} en ${app.repo}@${app.branch}. Creálo con el asistente.`, syncedAt: new Date() } })
    return { ok: false as const, error: 'sin manifiesto' }
  }
  const r = parseManifest(file.text)
  if (!r.ok) {
    await db.app.update({ where: { id: appId }, data: { manifestError: r.error, syncedAt: new Date() } })
    return r
  }
  if (r.hash !== app.manifestHash) await cacheBrandFiles(app, r.manifest)
  await db.app.update({ where: { id: appId }, data: { manifest: r.manifest as Prisma.InputJsonValue, manifestHash: r.hash, manifestError: null, name: r.manifest.name, syncedAt: new Date() } })
  return r
}

/** Copia logo y capturas del repo (o URL) a la carpeta de media de la app. */
async function cacheBrandFiles(app: App, m: Manifest) {
  const fetchAsset = async (src: string) => (/^https?:/.test(src) ? Buffer.from(await (await fetch(src)).arrayBuffer()) : await getRawBytes(app.repo, src, app.branch))
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
      slides: z.array(z.object({ eyebrow: z.string().optional(), title: z.string(), body: z.string().optional(), items: z.array(z.string()).optional(), imagePrompt: z.string().optional() })).min(1),
    }),
  ),
})
export type PlannedPost = z.infer<typeof PlanSchema>['posts'][number]

const SLIDE_RULES: Record<PostType, string> = {
  IMAGE: '1 slide: title (max 70 chars) + body (max 140 chars).',
  CAROUSEL: '4-7 slides: slide 1 is a hook cover (title max 60 chars); middle slides teach one idea each (title + up to 4 short items OR a body); last slide is a call to action.',
  REEL: '3-5 scenes for a 15-second vertical video: very short titles (max 45 chars), optional body (max 80 chars); last scene is the call to action.',
  STORY: '1 slide: a short title (max 50 chars) and body (max 90 chars), conversational, inviting a reply or a link tap.',
}

export function buildPlanPrompt(m: Manifest, slots: Slot[], ctx: { feed: Feed['items']; texts: string[]; releases: { name: string; body: string }[]; recent: { pillar: string | null; hook: string | null }[]; bestPillars: string[]; topic?: string; daily?: { date: string; report: string } }) {
  const system = `You are the social media manager of the app "${m.name}". You write Instagram content that promotes the app with real value for its audience, never clickbait.
Write ALL user-facing text in ${m.languages[0]} with this tone: ${m.tone}.
Never mention: ${m.avoid.join('; ') || 'nothing in particular'}.
Image prompts are in English and describe an illustration in this style: ${m.brand.imageStyle ?? DEFAULT_IMAGE_STYLE}. Show people using the app or the problem it solves, with simplified UI shapes but WITHOUT any readable text, letters, numbers or logos; fit the brand colors ${m.brand.colors.join(', ')} and leave calm space for overlaid text.
Every slide (or reel scene) also gets its own imagePrompt: the same characters and style, illustrating that slide's idea.
Captions: first line is a hook, 2-5 short lines of value, then the CTA "${m.cta}", then 3-5 specific hashtags (from: ${m.hashtags.join(' ') || 'choose relevant ones'}).
altText describes the image for accessibility and includes keywords people would search.
Answer only with JSON: {"posts":[{"slot":number,"pillar":string,"hook":string,"caption":string,"hashtags":string[],"altText":string,"imagePrompt":string,"sourceId":string|null,"slides":[{"eyebrow"?:string,"title":string,"body"?:string,"items"?:string[],"imagePrompt":string}]}]}`
  const user = JSON.stringify({
    app: { name: m.name, url: m.url, tagline: m.tagline, description: m.description, audience: m.audience, features: m.features, pillars: m.pillars, location: m.location },
    week: slots.map((s, i) => ({ slot: i, type: s.type, day: ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'][s.day], slideRules: SLIDE_RULES[s.type] })),
    ideasFromApp: ctx.feed.slice(0, 20).map((f) => ({ id: f.id, title: f.title, pillar: f.pillar, body: f.body?.slice(0, 300), bullets: f.bullets?.slice(0, 5) })),
    appTexts: ctx.texts.map((t) => t.slice(0, 2000)),
    recentReleases: ctx.releases,
    doNotRepeat: ctx.recent.map((r) => `${r.pillar}: ${r.hook}`),
    bestPerformingPillars: ctx.bestPillars,
    todaysEdition: ctx.daily ? { date: ctx.daily.date, report: ctx.daily.report } : undefined,
    instructions: ctx.daily
      ? `Create exactly one post per slot about TODAY's edition (${ctx.daily.date}) in todaysEdition. Use ONLY facts stated in that report: no other news, no opinions, no predictions, no invented figures; attribute claims to the sources as the report does. CAROUSEL: slide 1 is a cover with the date as eyebrow and the day's main story as title; then 3-5 slides with the most relevant regions or the trade/commodities climate (title + up to 4 short items each); last slide invites to read the full edition and subscribe. STORY: the 3 main headlines of the day, very short. Captions summarize the day in 2-4 lines and invite to read the full edition.`
      : ctx.topic
      ? `Create exactly one post about this topic chosen by the user: "${ctx.topic}". Stay on that topic, connect it to the app naturally and do not repeat hooks from doNotRepeat.`
      : 'Create exactly one post per slot. Balance the pillars (favor the best performing ones), use ideasFromApp when relevant (set sourceId), announce recent releases if any, and do not repeat hooks from doNotRepeat.',
  })
  return { system, user }
}

export async function planBatch(appId: string, weekStart: Date) {
  const app = await db.app.findUniqueOrThrow({ where: { id: appId } })
  const m = manifestOf(app)
  const existing = await db.batch.findUnique({ where: { appId_weekStart: { appId, weekStart } }, include: { _count: { select: { posts: true } } } })
  if (existing) {
    // Nunca se borran posts de un lote: un lote fallido que ya tiene posts se retoma (se renderiza lo que falta),
    // así no se pierde lo que ya revisaste o aprobaste.
    if (existing._count.posts) return existing.status === 'READY' && !existing.error ? existing : db.batch.update({ where: { id: existing.id }, data: { status: 'GENERATING', error: null } })
    // Sin posts: se vuelve a planificar si falló o quedó trabado planificando (p. ej. el worker se reinició).
    if (existing.status !== 'FAILED' && existing.status !== 'PLANNING') return existing
  }
  const batch = existing
    ? await db.batch.update({ where: { id: existing.id }, data: { status: 'PLANNING', error: null } })
    : await db.batch.create({ data: { appId, weekStart, status: 'PLANNING' } })
  try {
    return await planPosts(app, m, batch.id, weekStart)
  } catch (e) {
    await db.batch.update({ where: { id: batch.id }, data: { status: 'FAILED', error: `No se pudo planificar: ${(e as Error).message}` } })
    await notify(`⚠️ ${app.name}: falló la planificación de la semana del ${weekStart.toISOString().slice(0, 10)}: ${(e as Error).message}`)
    return db.batch.findUniqueOrThrow({ where: { id: batch.id } })
  }
}

async function planPosts(app: App, m: Manifest, batchId: string, weekStart: Date) {
  const appId = app.id
  const batch = { id: batchId }

  const slots = weekSlots(weekStart, m.cadence, app.postTime, app.timezone)
  if (!slots.length) return db.batch.update({ where: { id: batch.id }, data: { status: 'READY', notes: 'Cadencia semanal en 0' } })
  const [src, releases, recent, scored] = await Promise.all([
    sources(m),
    latestReleases(app.repo),
    db.post.findMany({ where: { appId }, orderBy: { createdAt: 'desc' }, take: 30, select: { pillar: true, hook: true } }),
    db.post.groupBy({ by: ['pillar'], where: { appId, score: { not: null } }, _avg: { score: true } }),
  ])
  const bestPillars = scored
    .filter((s) => s.pillar)
    .sort((a, b) => (b._avg.score ?? 0) - (a._avg.score ?? 0))
    .slice(0, 3)
    .map((s) => s.pillar!)
  const { system, user } = buildPlanPrompt(m, slots, { ...src, releases: releases.filter((r) => Date.now() - Date.parse(r.date) < 30 * 864e5), recent, bestPillars })
  const raw = process.env.OPENROUTER_MOCK === '1' ? mockPlan(m, slots, src.feed) : await completeJson({ appId, model: app.textModel, system, user, purpose: `plan ${weekStart.toISOString().slice(0, 10)}` })
  const plan = PlanSchema.parse(raw)
  for (const [i, slot] of slots.entries()) {
    const p = plan.posts.find((x) => x.slot === i) ?? plan.posts[i]
    if (!p) continue
    await db.post.create({ data: postFromPlan(app, batch.id, slot, p) })
  }
  return db.batch.update({ where: { id: batch.id }, data: { status: 'GENERATING' } })
}

/**
 * Modo demo (OPENROUTER_MOCK=1): arma la semana con las ideas del feed de la app y sus funciones,
 * sin llamar a ningún modelo. Sirve para probar el circuito completo sin gastar crédito.
 */
export function mockPlan(m: Manifest, slots: Slot[], feed: Feed['items']) {
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

export function postFromPlan(app: Pick<App, 'id'>, batchId: string | null, slot: Slot, p: PlannedPost): Prisma.PostUncheckedCreateInput {
  const tags = p.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).filter((h) => !p.caption.includes(h))
  const slides = slot.type === 'CAROUSEL' ? p.slides.slice(0, 10) : slot.type === 'REEL' ? p.slides.slice(0, 5) : p.slides.slice(0, 1)
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
    scheduledAt: slot.at,
  }
}

// ---------------------------------------------------------------------------
// 3. Generar y renderizar
// ---------------------------------------------------------------------------

type Slide = { eyebrow?: string; title: string; body?: string; items?: string[]; imagePrompt?: string }

const vertical = (t: PostType) => t === 'REEL' || t === 'STORY'

/** Cómo se arma cada diapositiva: portada a sangre, texto (con ilustración o captura) o cierre de color. */
export function slideLayout(type: PostType, total: number, i: number, hasShot: boolean, slide: Slide): 'cover' | 'text-illustration' | 'text-shot' | 'cta' {
  const isCta = i === total - 1 && total > 2
  if (isCta) return 'cta'
  if (i === 0 || type === 'REEL') return 'cover'
  return i === 1 && hasShot && !slide.items?.length ? 'text-shot' : 'text-illustration'
}

/**
 * Ilustración con IA para una diapositiva (`position`). Reutiliza la existente salvo que se pida regenerar,
 * así volver a renderizar no cuesta nada. `references`: ilustraciones anteriores del post, para mantener el estilo.
 */
async function background(app: App, post: Post, position: number, scene: string | undefined, opts: { force?: boolean; references?: string[]; image: ImageChoice }): Promise<string | undefined> {
  const prev = await db.asset.findFirst({ where: { postId: post.id, kind: 'BACKGROUND', position }, orderBy: { createdAt: 'desc' } })
  if (prev && !opts.force && existsSync(mediaPath(prev.path))) return dataUri(prev.path)
  const { model, quality } = opts.image
  if (!model || !scene || process.env.OPENROUTER_MOCK === '1') return undefined
  const m = manifestOf(app)
  const prompt = `${scene}. Style: ${m.brand.imageStyle ?? DEFAULT_IMAGE_STYLE}. Color palette ${m.brand.colors.join(', ')}. Absolutely no text, letters, numbers, logos or watermarks.`
  const img = await generateImage({ appId: app.id, model, quality, prompt, aspectRatio: vertical(post.type) ? '9:16' : '4:5', references: opts.references, purpose: `ilustración ${post.type} ${position + 1}` })
  const rel = await saveMedia(`apps/${app.slug}/posts/${post.id}/bg-${position}-${Date.now()}.jpg`, img.data)
  await db.asset.create({ data: { postId: post.id, kind: 'BACKGROUND', position, path: rel, prompt, model, costUsd: img.cost } })
  return bufferDataUri(img.data, img.mime)
}

/**
 * Renderiza las piezas finales del post (JPEG o MP4) y las guarda como assets publicables.
 * `image`: modelo elegido junto al botón; si no viene, el de la app (Ajustes).
 */
export async function renderPost(postId: string, opts: { regenerateImage?: boolean; image?: ImageChoice } = {}) {
  const post = await db.post.findUniqueOrThrow({ where: { id: postId }, include: { app: true } })
  const app = post.app
  const brand = await brandOf(app)
  const slides = (post.slides as Slide[] | null) ?? [{ title: post.hook ?? app.name }]
  const shots = await screenshots(app)
  const size = vertical(post.type) ? SIZES.story : SIZES.feed
  const image = opts.image ?? { model: app.imageModel, quality: app.imageQuality }
  // Una ilustración por diapositiva (salvo el cierre y la de la captura), en orden: la primera es la referencia de estilo.
  const html: string[] = []
  const refs: string[] = []
  for (const [i, s] of slides.entries()) {
    const layout = slideLayout(post.type, slides.length, i, shots.length > 0, s)
    const d: SlideData = { ...s, index: i, total: post.type === 'CAROUSEL' ? slides.length : undefined }
    if (layout === 'cta') {
      html.push(ctaSlide(brand, d, size))
      continue
    }
    if (layout === 'text-shot') {
      html.push(textSlide(brand, { ...d, screenshot: shots[0] }, size))
      continue
    }
    const scene = s.imagePrompt ?? (i === 0 ? post.imagePrompt ?? undefined : post.imagePrompt ? `${post.imagePrompt}. Scene about: ${s.title}` : undefined)
    const img = await background(app, post, i, scene, { force: opts.regenerateImage, references: refs.slice(0, 1), image })
    if (img && !refs.length) refs.push(img)
    html.push(layout === 'cover' ? coverSlide(brand, { ...d, background: img }, size) : textSlide(brand, { ...d, illustration: img }, size))
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
  if (ok) await notify(`📸 ${batch.app.name}: ${ok} publicaciones de la semana listas para revisar. Se aprueban solas en ${reviewHours} h.`)
  if (failed.length) await notify(`⚠️ ${batch.app.name}: ${error}`)
}

/** Sincronizar + planificar + generar la semana que empieza en `weekStart`. */
export async function runWeekly(appId: string, weekStart: Date, image?: ImageChoice) {
  const app = await db.app.findUniqueOrThrow({ where: { id: appId } })
  if (app.paused) return null
  const s = await syncApp(appId)
  if (!s.ok && !app.manifest) throw new Error(`${app.name}: ${'error' in s ? s.error : 'manifiesto inválido'}`)
  const batch = await planBatch(appId, weekStart)
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
export async function createOnDemand(postId: string, topic: string, image?: ImageChoice) {
  const post = await db.post.findUniqueOrThrow({ where: { id: postId }, include: { app: true } })
  const app = post.app
  try {
    const m = manifestOf(app)
    const now = new Date()
    const slot: Slot = { type: post.type, day: (now.getDay() + 6) % 7, at: now }
    const fullTopic = post.pillar ? `${topic} (pillar: ${post.pillar})` : topic
    const [src, recent] = await Promise.all([
      sources(m),
      db.post.findMany({ where: { appId: app.id, id: { not: postId } }, orderBy: { createdAt: 'desc' }, take: 30, select: { pillar: true, hook: true } }),
    ])
    const { system, user } = buildPlanPrompt(m, [slot], { feed: [], texts: src.texts, releases: [], recent, bestPillars: [], topic: fullTopic })
    const raw =
      process.env.OPENROUTER_MOCK === '1'
        ? mockPlan(m, [slot], [{ id: 'tema', title: topic, body: m.tagline, pillar: post.pillar ?? m.pillars[0] }])
        : await completeJson({ appId: app.id, model: app.textModel, system, user, purpose: `a pedido ${post.type}` })
    const p = PlanSchema.parse(raw).posts[0]
    if (!p) throw new Error('El modelo no devolvió ninguna publicación')
    const { pillar, hook, caption, altText, slides, imagePrompt } = postFromPlan(app, null, slot, p)
    await db.post.update({ where: { id: postId }, data: { pillar: post.pillar ?? pillar, hook, caption, altText, slides, imagePrompt } })
    await renderPost(postId, { image })
    await db.post.update({ where: { id: postId }, data: { status: 'PENDING_REVIEW', reviewDueAt: null, error: null } })
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
    const { system, user } = buildPlanPrompt(m, slots, { feed: [], texts: [], releases: [], recent: [], bestPillars: [], daily: { date, report } })
    const raw =
      process.env.OPENROUTER_MOCK === '1'
        ? mockPlan(m, slots, [...report.matchAll(/^#{2,3} (.+)$/gm)].slice(0, 6).map((h, i) => ({ id: `d${i}`, title: h[1], body: m.tagline, pillar: m.pillars[0] })))
        : await completeJson({ appId, model: app.textModel, system, user, purpose: `edición diaria ${date}` })
    const plan = PlanSchema.parse(raw)
    for (const [i, slot] of slots.entries()) {
      const p = plan.posts.find((x) => x.slot === i) ?? plan.posts[i]
      const post = posts.find((x) => x.type === slot.type)!
      if (!p) throw new Error(`el modelo no armó el post ${slot.type}`)
      const { pillar, hook, caption, altText, slides, imagePrompt } = postFromPlan(app, null, slot, p)
      await db.post.update({ where: { id: post.id }, data: { pillar, hook, caption, altText, slides, imagePrompt } })
      await renderPost(post.id)
      // Se aprueba solo un minuto antes de publicarse, si no lo tocaste.
      await db.post.update({ where: { id: post.id }, data: { status: 'PENDING_REVIEW', reviewDueAt: new Date(slot.at.getTime() - 60e3), error: null } })
    }
    const hora = new Intl.DateTimeFormat('es-AR', { timeZone: app.timezone, hour: '2-digit', minute: '2-digit' }).format(publishAt)
    await notify(`📰 ${app.name}: edición del ${date} lista para revisar. Se publica sola a las ${hora}.`)
    return 'lista'
  } catch (e) {
    await db.post.updateMany({ where: { appId, dailyDate: date, status: 'DRAFT' }, data: { status: 'FAILED', error: `No se pudo generar la edición: ${(e as Error).message}` } })
    await notify(`⚠️ ${app.name}: falló la edición diaria del ${date}: ${(e as Error).message}`)
    return 'falló'
  }
}
