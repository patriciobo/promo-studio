// Radar de tendencias de Instagram/TikTok (para publicar sólo en Instagram).
// Cada pasada pregunta a modelos con búsqueda web (Perplexity Sonar: web y prensa; Grok: lo que circula en X) qué formatos,
// memes y sonidos se están usando ahora en el público de cada app, y guarda una observación por tendencia.
// La etapa (emergente → pico → saturada → muerta) sale de la serie de observaciones, no de una sola respuesta:
// si el impulso cae dos pasadas seguidas o deja de aparecer, se da por pasada de moda y los posts programados
// sobre ella se rehacen antes de publicarse (pipeline.replanPost).
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { db } from './db'
import { enqueue, QUEUES } from './jobs'
import type { Manifest } from './manifest'
import { researchJson } from './openrouter'

export const STAGES = ['emerging', 'peak', 'saturated', 'dead'] as const
export type Stage = (typeof STAGES)[number]
/** Etapas en las que conviene subirse: después ya es tarde. */
export const LIVE_STAGES: Stage[] = ['emerging', 'peak']

export const STAGE_LABEL: Record<Stage, string> = { emerging: 'Emergente', peak: 'En su pico', saturated: 'Saturada', dead: 'Pasada de moda' }
export const KIND_LABEL: Record<string, string> = { format: 'Formato', meme: 'Meme', audio: 'Sonido', challenge: 'Desafío', hashtag: 'Hashtag', topic: 'Tema' }

/** Fuentes del radar. Se pueden cambiar por variable de entorno (cualquier modelo de OpenRouter). */
export const SOURCES = [
  { id: 'web', model: process.env.TREND_WEB_MODEL ?? 'perplexity/sonar-pro', web: false, focus: 'news sites, creator blogs, Instagram and TikTok trend roundups and Meta announcements' },
  { id: 'x', model: process.env.TREND_X_MODEL ?? 'x-ai/grok-4.3', web: true, focus: 'what people are posting and sharing right now on X, TikTok and Instagram Reels' },
] as const
export const ALGO_MODEL = process.env.TREND_ALGO_MODEL ?? 'perplexity/sonar-pro'

/** Sin verla en este tiempo, una tendencia se da por muerta. */
const DEAD_AFTER_DAYS = 4
/** Sin verla en este tiempo, deja de estar en su mejor momento. */
const STALE_AFTER_DAYS = 2

// ---------------------------------------------------------------------------
// Mercados: idioma y países del público de cada app
// ---------------------------------------------------------------------------

export const marketOf = (m: Pick<Manifest, 'languages' | 'audience'>) => `${m.languages[0].toLowerCase().slice(0, 5)}:${[...m.audience.countries].map((c) => c.toUpperCase()).sort().join(',')}`

const LANGUAGES: Record<string, string> = { es: 'Spanish', en: 'English', pt: 'Portuguese', it: 'Italian', fr: 'French', de: 'German' }

export function describeMarket(market: string) {
  const [lang, countries] = market.split(':')
  const language = LANGUAGES[lang.slice(0, 2)] ?? lang
  return `${language}-speaking Instagram users${countries ? ` in ${countries.split(',').join(', ')}` : ''}`
}

// ---------------------------------------------------------------------------
// Pedido al modelo con búsqueda
// ---------------------------------------------------------------------------

const clampInt = (lo: number, hi: number) => z.coerce.number().transform((n) => Math.max(lo, Math.min(hi, Math.round(n))))

const RadarItemSchema = z.object({
  key: z.string().min(2).max(80),
  name: z.string().min(2).max(120),
  platform: z.string().default('instagram'),
  kind: z.string().default('format'),
  summary: z.string().max(600).default(''),
  howTo: z.string().max(600).default(''),
  example: z.string().nullish(),
  stage: z.enum(STAGES).catch('peak'),
  momentum: clampInt(0, 100).catch(50),
  evidence: z.string().max(400).nullish(),
  brandSafe: z.boolean().default(true),
})
export const RadarSchema = z.object({ trends: z.array(RadarItemSchema).max(30).default([]) })
export type RadarItem = z.infer<typeof RadarItemSchema>

export const slugKey = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

export function buildRadarPrompt(market: string, today: string, focus: string, known: { key: string; name: string; stage: string; momentum: number }[]) {
  const system = `You are a social media trend analyst. Today is ${today}. Use your web search to find what is trending RIGHT NOW (last 7-10 days) for ${describeMarket(market)}, looking at ${focus}. Content will be published only on Instagram, but TikTok trends usually reach Instagram Reels days later, so include them.
Report reusable trends a small brand could adapt: meme formats (a joke structure, a caption template like "nobody: / me:", POV, "tell me without telling me"), video formats and editing patterns (transitions, split screens, green screen reactions, before/after), challenges, viral sounds and recurring topics. Skip news events, tragedies, politics, celebrity gossip and anything offensive.
For each trend:
- key: a short stable slug in English (e.g. "pov-first-day-at-work"). If it is one of the "known" trends, REUSE ITS KEY exactly.
- platform: where it is strongest (instagram | tiktok | x | web). kind: format | meme | audio | challenge | hashtag | topic.
- summary (in ${market.split(':')[0]}): what it is and why it works, 1-2 sentences.
- howTo (in ${market.split(':')[0]}): how a brand adapts the FORMAT to its own topic without copying anyone's images, footage, characters or copyrighted audio, 1-2 sentences.
- example: a URL of a real example or article about it, or null. Never invent URLs.
- stage: emerging (growing, few brands yet), peak (everywhere now), saturated (brands overusing it, engagement dropping), dead (people mock it or stopped using it).
- momentum: 0-100, how much it is growing right now (100 = exploding, 50 = steady, below 30 = fading).
- evidence: short note on what you saw (dates, counts, examples).
- brandSafe: false if it is risky for a brand (vulgar, mean, controversial).
Also re-assess every "known" trend you still find evidence of, with updated stage and momentum. Return at most 15 trends, only ones with real evidence.
Answer only with JSON: {"trends":[{"key":string,"name":string,"platform":string,"kind":string,"summary":string,"howTo":string,"example":string|null,"stage":"emerging"|"peak"|"saturated"|"dead","momentum":number,"evidence":string,"brandSafe":boolean}]}`
  const user = JSON.stringify({ market: describeMarket(market), known })
  return { system, user }
}

// ---------------------------------------------------------------------------
// Etapa a partir de la serie de observaciones
// ---------------------------------------------------------------------------

export type Observation = { momentum: number; stage: Stage; at: Date }

/**
 * Etapa de una tendencia según sus observaciones (de la más vieja a la más nueva) y cuándo se la vio por última vez.
 * Manda la tendencia de los números sobre lo que dice la última respuesta: un pico que cae fuerte o dos pasadas
 * seguidas ya está saturado aunque el modelo diga otra cosa; y una que dejó de aparecer, muere.
 */
export function classify(history: Observation[], lastSeen: Date, now = new Date(), current?: Stage): Stage {
  const days = (now.getTime() - lastSeen.getTime()) / 864e5
  if (days > DEAD_AFTER_DAYS || !history.length) return 'dead'
  const h = [...history].sort((a, b) => a.at.getTime() - b.at.getTime())
  const last = h[h.length - 1]
  const prev = h[h.length - 2]
  const before = h[h.length - 3]
  const delta = prev ? last.momentum - prev.momentum : 0
  const twoDrops = !!(prev && before && last.momentum < prev.momentum && prev.momentum < before.momentum)
  const bigDrop = delta <= -15
  let stage = last.stage
  // Una vez saturada o muerta, sólo vuelve con una suba clara del impulso.
  const reviving = delta >= 15 && last.momentum >= 55
  if ((current === 'dead' || current === 'saturated') && (stage === 'emerging' || stage === 'peak') && !reviving) stage = current
  if ((stage === 'emerging' || stage === 'peak') && (bigDrop || twoDrops)) stage = 'saturated'
  if (stage === 'saturated' && last.momentum < 20 && delta < 0) stage = 'dead'
  if (days > STALE_AFTER_DAYS && (stage === 'emerging' || stage === 'peak')) stage = 'saturated'
  return stage
}

// ---------------------------------------------------------------------------
// Pasada del radar
// ---------------------------------------------------------------------------

/** Mercados de las apps que usan tendencias. */
export async function activeMarkets() {
  const apps = await db.app.findMany({ where: { paused: false, useTrends: true }, select: { manifest: true } })
  return [...new Set(apps.flatMap((a) => (a.manifest ? [marketOf(a.manifest as unknown as Manifest)] : [])))]
}

async function saveObservations(market: string, source: string, items: RadarItem[], now: Date) {
  let saved = 0
  for (const [rank, it] of items.entries()) {
    const key = slugKey(it.key) || slugKey(it.name)
    if (!key) continue
    const example = it.example && /^https?:\/\//.test(it.example) ? it.example.slice(0, 500) : null
    const data = { platform: it.platform.toLowerCase().slice(0, 20), kind: it.kind.toLowerCase().slice(0, 20), name: it.name, summary: it.summary, howTo: it.howTo, brandSafe: it.brandSafe, lastSeen: now, momentum: it.momentum }
    const trend = await db.trend.upsert({
      where: { market_key: { market, key } },
      create: { market, key, ...data, example, stage: it.stage, firstSeen: now },
      // El ejemplo nuevo pisa al viejo sólo si trae uno.
      update: { ...data, ...(example ? { example } : {}) },
    })
    await db.trendSnapshot.create({ data: { trendId: trend.id, source, momentum: it.momentum, stage: it.stage, rank: rank + 1, evidence: it.evidence?.slice(0, 400) ?? null, at: now } })
    saved++
  }
  return saved
}

/** Recalcula la etapa de las tendencias vivas del mercado con sus últimas observaciones (las de una misma pasada se promedian). */
export async function reclassify(market: string, now = new Date()) {
  // Las muertas sólo si volvieron a aparecer en esta pasada (pueden revivir).
  const trends = await db.trend.findMany({ where: { market, OR: [{ stage: { not: 'dead' } }, { lastSeen: { gte: new Date(now.getTime() - 3600e3) } }] }, include: { snapshots: { orderBy: { at: 'desc' }, take: 12 } } })
  for (const t of trends) {
    const stage = classify(perRun(t.snapshots), t.lastSeen, now, t.stage as Stage)
    if (stage !== t.stage) await db.trend.update({ where: { id: t.id }, data: { stage } })
  }
}

/** Una observación por pasada (las fuentes de la misma pasada se promedian; la etapa, la más avanzada). */
export function perRun(snaps: { momentum: number; stage: string; at: Date }[]): Observation[] {
  const runs = new Map<string, { m: number[]; s: Stage[]; at: Date }>()
  for (const s of snaps) {
    const k = s.at.toISOString().slice(0, 13) // misma hora = misma pasada
    const r = runs.get(k) ?? { m: [], s: [], at: s.at }
    r.m.push(s.momentum)
    r.s.push((STAGES as readonly string[]).includes(s.stage) ? (s.stage as Stage) : 'peak')
    runs.set(k, r)
  }
  return [...runs.values()].map((r) => ({ momentum: Math.round(r.m.reduce((a, b) => a + b, 0) / r.m.length), stage: r.s.reduce((a, b) => (STAGES.indexOf(b) > STAGES.indexOf(a) ? b : a)), at: r.at }))
}

/** Pasada completa: cada mercado con cada fuente, etapas, notas del algoritmo y posts que hay que rehacer. */
export async function refreshTrends(now = new Date()) {
  const markets = await activeMarkets()
  const log: string[] = []
  for (const market of markets) {
    for (const src of SOURCES) {
      try {
        // Las conocidas incluyen lo que encontró la fuente anterior en esta pasada: así repiten la misma clave.
        const known = await db.trend.findMany({ where: { market, stage: { not: 'dead' }, lastSeen: { gte: new Date(now.getTime() - 14 * 864e5) } }, orderBy: { momentum: 'desc' }, take: 25, select: { key: true, name: true, stage: true, momentum: true } })
        const { system, user } = buildRadarPrompt(market, now.toISOString().slice(0, 10), src.focus, known)
        const raw = process.env.OPENROUTER_MOCK === '1' ? mockRadar(known) : await researchJson({ model: src.model, system, user, web: src.web, purpose: `tendencias ${market} (${src.id})` })
        const n = await saveObservations(market, src.model, RadarSchema.parse(raw).trends, now)
        log.push(`${market} ${src.id}: ${n}`)
      } catch (e) {
        log.push(`${market} ${src.id}: error ${(e as Error).message}`)
      }
    }
    await reclassify(market, now)
  }
  // Las de mercados que ya nadie usa también se apagan.
  const others = await db.trend.findMany({ where: { stage: { not: 'dead' }, market: { notIn: markets } }, select: { market: true }, distinct: ['market'] })
  for (const o of others) await reclassify(o.market, now)
  if (markets.length) await refreshAlgoNotes(now).catch((e) => log.push(`algoritmo: error ${(e as Error).message}`))
  const replans = await expireTrendPosts(now)
  if (replans) log.push(`${replans} posts a rehacer`)
  return log
}

/** Modo demo: repite las conocidas bajando el impulso y suma una nueva, sin llamar a ningún modelo. */
function mockRadar(known: { key: string; name: string; stage: string; momentum: number }[]) {
  return {
    trends: [
      ...known.map((k) => ({ key: k.key, name: k.name, stage: k.stage, momentum: Math.max(0, k.momentum - 20), summary: 'demo', howTo: 'demo' })),
      { key: `pov-demo-${Date.now() % 1000}`, name: 'POV: demo', kind: 'format', stage: 'emerging', momentum: 80, summary: 'Formato POV de prueba.', howTo: 'Mostrá la situación desde los ojos de tu cliente.' },
    ],
  }
}

// ---------------------------------------------------------------------------
// Notas sobre el algoritmo de Instagram
// ---------------------------------------------------------------------------

const AlgoSchema = z.object({ notes: z.array(z.object({ text: z.string().min(10).max(400), source: z.string().nullish(), date: z.string().nullish() })).max(12).default([]) })

/** Una vez por semana: cambios recientes del algoritmo con fuente. Las de más de 4 meses se apagan. */
export async function refreshAlgoNotes(now = new Date()) {
  const last = await db.algoNote.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
  if (last && now.getTime() - last.createdAt.getTime() < 6 * 864e5) return 0
  const system = `Today is ${now.toISOString().slice(0, 10)}. Using web search, list the changes and official guidance about how Instagram ranks and recommends content (Reels, carousels, feed, Explore) announced in the last 90 days. Prefer primary sources: Adam Mosseri posts, Instagram @creators, Meta newsroom and transparency pages; use press only when it cites them. Skip rumors and generic tips.
Each note is ONE practical rule in Spanish for someone who publishes for small businesses (e.g. "Los Reels de más de 3 minutos no se recomiendan a quien no te sigue"), with its source URL and the announcement date (YYYY-MM-DD) if known. Never invent sources.
Answer only with JSON: {"notes":[{"text":string,"source":string|null,"date":string|null}]}`
  const raw = process.env.OPENROUTER_MOCK === '1' ? { notes: [] } : await researchJson({ model: ALGO_MODEL, system, user: 'Instagram ranking changes, last 90 days.', purpose: 'algoritmo de Instagram' })
  let n = 0
  for (const note of AlgoSchema.parse(raw).notes) {
    const key = createHash('sha256').update(slugKey(note.text)).digest('hex').slice(0, 24)
    const observedAt = note.date && !Number.isNaN(Date.parse(note.date)) ? new Date(note.date) : null
    const source = note.source && /^https?:\/\//.test(note.source) ? note.source.slice(0, 500) : null
    await db.algoNote.upsert({ where: { key }, create: { key, text: note.text, source, observedAt }, update: {} })
    n++
  }
  await db.algoNote.updateMany({ where: { active: true, OR: [{ observedAt: { lt: new Date(now.getTime() - 120 * 864e5) } }, { observedAt: null, createdAt: { lt: new Date(now.getTime() - 120 * 864e5) } }] }, data: { active: false } })
  return n
}

// ---------------------------------------------------------------------------
// Lo que usa el plan
// ---------------------------------------------------------------------------

export type PromptTrend = { id: string; name: string; platform: string; kind: string; stage: string; summary: string; howTo: string; yourResult?: string }

/**
 * Tendencias vivas del mercado de la app (las más fuertes primero) y cómo le fue a la app con las que ya usó.
 * `include`: una que se pidió a mano, aunque no esté entre las primeras.
 */
export async function trendsForApp(app: { id: string; useTrends: boolean }, m: Manifest, include?: string | null): Promise<{ trends: PromptTrend[]; algo: string[] }> {
  if (!app.useTrends && !include) return { trends: [], algo: [] }
  const market = marketOf(m)
  const [rows, notes, scored, avg] = await Promise.all([
    db.trend.findMany({ where: { OR: [{ market, stage: { in: LIVE_STAGES }, brandSafe: true, hidden: false }, ...(include ? [{ id: include }] : [])] }, orderBy: [{ momentum: 'desc' }], take: 10 }),
    db.algoNote.findMany({ where: { active: true }, orderBy: [{ observedAt: 'desc' }, { createdAt: 'desc' }], take: 8, select: { text: true } }),
    db.post.groupBy({ by: ['trendId'], where: { appId: app.id, trendId: { not: null }, score: { not: null } }, _avg: { score: true }, _count: true }),
    db.post.aggregate({ where: { appId: app.id, score: { not: null } }, _avg: { score: true } }),
  ])
  const base = avg._avg.score
  const result = (id: string) => {
    const s = scored.find((x) => x.trendId === id)
    if (!s?._avg.score || !base) return undefined
    return `${s._count} posts so far, ${s._avg.score >= base ? 'above' : 'below'} this account's average (${s._avg.score.toFixed(2)} vs ${base.toFixed(2)})`
  }
  return {
    trends: rows.map((t) => ({ id: t.id, name: t.name, platform: t.platform, kind: t.kind, stage: t.stage, summary: t.summary, howTo: t.howTo, yourResult: result(t.id) })),
    algo: notes.map((n) => n.text),
  }
}

/** Cuántos posts de la semana pueden subirse a una tendencia: pocos, para no perder el nicho. */
export const trendSlotsFor = (feedPosts: number) => (feedPosts >= 4 ? 2 : feedPosts >= 1 ? 1 : 0)

/** Sólo valen ids de las tendencias que se le pasaron al modelo. */
export function keepKnownTrends<T extends { posts: { trendId?: string | null }[] }>(plan: T, trends: { id: string }[]): T {
  const ids = new Set(trends.map((t) => t.id))
  for (const p of plan.posts) if (p.trendId && !ids.has(p.trendId)) p.trendId = null
  return plan
}

// ---------------------------------------------------------------------------
// Pasó de moda: rehacer lo programado
// ---------------------------------------------------------------------------

/** Margen: lo que sale en menos de esto ya no se rehace (no da el tiempo para revisarlo). */
const REPLAN_MIN_LEAD_MS = 3 * 3600e3

/** Encola rehacer los posts programados sobre una tendencia que se saturó o murió antes de salir. */
export async function expireTrendPosts(now = new Date()) {
  const posts = await db.post.findMany({
    where: { trendId: { not: null }, trend: { stage: { in: ['saturated', 'dead'] } }, status: { in: ['PENDING_REVIEW', 'APPROVED'] }, publishedAt: null, scheduledAt: { gt: new Date(now.getTime() + REPLAN_MIN_LEAD_MS) }, adOnly: false },
    select: { id: true, trend: { select: { name: true, stage: true } } },
  })
  for (const p of posts) await enqueue(QUEUES.replanPost, { postId: p.id, reason: `la tendencia "${p.trend!.name}" ${p.trend!.stage === 'dead' ? 'pasó de moda' : 'se saturó'}` }, { singletonKey: `replan-${p.id}` })
  return posts.length
}
