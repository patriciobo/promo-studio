// Sugerencias de campaña con el modelo de texto: objetivo, presupuesto, público y segmentación detallada, con el porqué.
// Los intereses, cargos, etc. vuelven como términos y se traducen a opciones reales de Meta con el buscador (sin costo).
import type { App } from '@prisma/client'
import { z } from 'zod'
import { db } from './db'
import type { Manifest } from './manifest'
import { detailGroups, DETAIL_TYPES, EDUCATION, OBJECTIVES, CTAS, type Detail, type DetailType, type GeoPlace } from './meta-ads-options'
import { accountInfo, searchPlaces, searchTargeting } from './meta-ads'
import { completeJson, textModelPrice } from './openrouter'
import { manifestOf } from './pipeline'

const TYPES = DETAIL_TYPES.map((d) => d.id) as [DetailType, ...DetailType[]]

export const SuggestionSchema = z.object({
  name: z.string().max(120),
  objective: z.enum(['TRAFFIC', 'AWARENESS', 'ENGAGEMENT', 'WHATSAPP']),
  objectiveWhy: z.string(),
  cta: z.string(),
  budgetType: z.enum(['LIFETIME', 'DAILY']),
  budget: z.number().positive(),
  days: z.number().int().min(1).max(90),
  budgetWhy: z.string(),
  countries: z.array(z.string().length(2)).default([]),
  places: z.array(z.string()).max(10).default([]),
  ageMin: z.number().int().min(18).max(65),
  ageMax: z.number().int().min(18).max(65),
  gender: z.enum(['all', 'female', 'male']).default('all'),
  education: z.array(z.number().int()).default([]),
  groups: z.array(z.array(z.object({ type: z.enum(TYPES), term: z.string().min(2) })).min(1)).max(3).default([]),
  audienceWhy: z.string(),
  advantage: z.boolean(),
  advantageWhy: z.string(),
  placements: z.enum(['instagram', 'instagram_facebook']),
  tips: z.array(z.string()).max(5).default([]),
})
export type Suggestion = z.infer<typeof SuggestionSchema>

export interface SuggestInput {
  postIds: string[]
  newPostTopic?: string
  objective?: string
}

/** Lo que el modelo necesita saber: la app, las piezas elegidas con sus métricas y cómo rindieron las campañas anteriores. */
async function context(app: App, input: SuggestInput) {
  const m = manifestOf(app)
  const [posts, campaigns, account] = await Promise.all([
    db.post.findMany({ where: { appId: app.id, id: { in: input.postIds } }, include: { insights: { orderBy: { hoursAfter: 'desc' }, take: 1 } } }),
    db.adCampaign.findMany({ where: { appId: app.id, metrics: { not: undefined } }, orderBy: { createdAt: 'desc' }, take: 5 }),
    accountInfo(app).catch(() => null),
  ])
  return { m, posts, campaigns, account }
}

export function buildSuggestPrompt(m: Manifest, ctx: Awaited<ReturnType<typeof context>>, input: SuggestInput) {
  const system = `You are a senior Meta Ads strategist. You plan Instagram/Facebook ad campaigns for small businesses with modest budgets and you know Meta's detailed targeting well.
Suggest the best setup for the campaign described by the user so it reaches its goal at the lowest cost per result.
Rules:
- Audience refinement is the most important part: choose detailed targeting that really matches who buys or uses this app. Prefer specific interests, job titles, employers, industries, fields of study, behaviors and life events over generic ones. Use 1 group (OR) normally; add a 2nd group only to narrow (AND) when the audience would be too broad. 3-8 terms per group.
- "term" is a short search query in ${m.languages[0]} or English as Meta lists it (e.g. "Tenis", "Gerente de marketing", "Ingeniería", "Pequeñas empresas"). Never invent IDs.
- Detailed targeting types: ${DETAIL_TYPES.map((d) => `${d.id} (${d.label})`).join(', ')}.
- places: city or province names only when the business is local (has a location); otherwise use countries (ISO-2).
- education: optional ids from ${EDUCATION.map((e) => `${e.id}=${e.label}`).join(', ')}; leave empty unless it clearly matters.
- Budget in the ad account currency${ctx.account ? ` (${ctx.account.currency}, minimum ${(ctx.account.minDaily / 100).toFixed(2)} per day)` : ''}; be realistic for a small business and respect the minimum. Prefer LIFETIME budgets of 5-14 days.
- advantage = Advantage+ audience (Meta may expand beyond the targeting). Recommend true unless a strict audience is essential (B2B job titles, very local).
- objective: one of ${OBJECTIVES.map((o) => `${o.id} (${o.label})`).join(', ')}${m.contact?.whatsapp ? '' : ' (WHATSAPP not available: no WhatsApp contact)'}. cta: one of ${CTAS.map((c) => c.id).join(', ')}.
- Every *Why field and the tips: ${m.languages[0]}, 1-2 short sentences, concrete, mentioning the data you used.
Answer only JSON: {"name":string,"objective":string,"objectiveWhy":string,"cta":string,"budgetType":"LIFETIME"|"DAILY","budget":number,"days":number,"budgetWhy":string,"countries":[string],"places":[string],"ageMin":number,"ageMax":number,"gender":"all"|"female"|"male","education":[number],"groups":[[{"type":string,"term":string}]],"audienceWhy":string,"advantage":boolean,"advantageWhy":string,"placements":"instagram"|"instagram_facebook","tips":[string]}`
  const user = JSON.stringify({
    app: { name: m.name, url: m.url, tagline: m.tagline, description: m.description, category: m.category, audience: m.audience, location: m.location, features: m.features, avoid: m.avoid },
    requestedObjective: input.objective,
    adsToRun: ctx.posts.map((p) => ({
      type: p.type,
      hook: p.hook,
      caption: p.caption.slice(0, 500),
      organicPotential: p.score,
      organic: p.insights[0] ? { reach: p.insights[0].reach, saves: p.insights[0].saves, shares: p.insights[0].shares, comments: p.insights[0].comments } : undefined,
    })),
    newAdPiece: input.newPostTopic || undefined,
    pastCampaigns: ctx.campaigns.map((c) => ({ objective: c.objective, audience: c.targeting, results: c.metrics })),
  })
  return { system, user }
}

/** Tokens de salida esperados para la respuesta (JSON con explicaciones). */
const OUTPUT_TOKENS = 1200

/** Costo estimado en US$ antes de llamar al modelo: ~3,5 caracteres por token de entrada. */
export async function estimateSuggestion(app: App, input: SuggestInput) {
  const ctx = await context(app, input)
  const { system, user } = buildSuggestPrompt(ctx.m, ctx, input)
  const inputTokens = Math.ceil((system.length + user.length) / 3.5)
  const price = await textModelPrice(app.textModel).catch(() => null)
  return { model: app.textModel, inputTokens, outputTokens: OUTPUT_TOKENS, usd: price ? inputTokens * price.prompt + OUTPUT_TOKENS * price.completion : null }
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Términos → opciones de Meta: la coincidencia exacta o la primera que devuelve el buscador. */
async function resolve(app: App, s: Suggestion) {
  const missing: string[] = []
  const groups: Detail[][] = []
  for (const g of s.groups) {
    const out: Detail[] = []
    for (const { type, term } of g) {
      const found = await searchTargeting(app, type, term).catch(() => [])
      const hit = found.find((o) => fold(o.name) === fold(term)) ?? found[0]
      if (hit && !out.some((d) => d.id === hit.id && d.type === type)) out.push({ type, id: hit.id, name: hit.name })
      else if (!hit) missing.push(`${DETAIL_TYPES.find((d) => d.id === type)?.label}: ${term}`)
    }
    if (out.length) groups.push(out)
  }
  const places: GeoPlace[] = []
  for (const name of s.places) {
    const hit = (await searchPlaces(app, name).catch(() => []))[0]
    if (hit) places.push({ key: hit.key, name: hit.name, type: hit.type, radius: hit.type === 'city' ? 17 : undefined })
    else missing.push(`Lugar: ${name}`)
  }
  return { groups: detailGroups({ groups, interests: [] }), places, missing }
}

export type ResolvedSuggestion = Suggestion & { resolvedGroups: Detail[][]; resolvedPlaces: GeoPlace[]; missing: string[]; cost: number }

export async function suggestCampaign(app: App, input: SuggestInput): Promise<ResolvedSuggestion> {
  const ctx = await context(app, input)
  const { system, user } = buildSuggestPrompt(ctx.m, ctx, input)
  let cost = 0
  const raw =
    process.env.OPENROUTER_MOCK === '1'
      ? mockSuggestion(ctx.m)
      : await completeJson({ appId: app.id, model: app.textModel, system, user, purpose: 'sugerir campaña', onCost: (c) => (cost = c) })
  const s = SuggestionSchema.parse(raw)
  if (s.objective === 'WHATSAPP' && !ctx.m.contact?.whatsapp) s.objective = 'TRAFFIC'
  if (!CTAS.some((c) => c.id === s.cta)) s.cta = 'LEARN_MORE'
  s.education = s.education.filter((id) => EDUCATION.some((e) => e.id === id))
  if (s.ageMax < s.ageMin) s.ageMax = 65
  const r = await resolve(app, s)
  return { ...s, resolvedGroups: r.groups, resolvedPlaces: r.places, missing: r.missing, cost }
}

/** Modo demo (OPENROUTER_MOCK=1): sugerencia fija a partir del promo.yaml, sin llamar al modelo. */
export function mockSuggestion(m: Manifest): Suggestion {
  return {
    name: `${m.name} · sugerida`,
    objective: 'TRAFFIC',
    objectiveWhy: 'Demo: visitas al sitio para medir con UTM.',
    cta: 'LEARN_MORE',
    budgetType: 'LIFETIME',
    budget: 35,
    days: 7,
    budgetWhy: 'Demo: una semana con presupuesto total.',
    countries: m.audience.countries,
    places: m.location ? [m.location.split(',')[0]] : [],
    ageMin: Math.max(18, m.audience.age[0]),
    ageMax: Math.min(65, m.audience.age[1]),
    gender: 'all',
    education: [],
    groups: [[...m.audience.interests.slice(0, 3).map((term) => ({ type: 'interests' as DetailType, term })), { type: 'work_positions', term: 'Emprendedor' }]],
    audienceWhy: 'Demo: intereses del promo.yaml.',
    advantage: true,
    advantageWhy: 'Demo: Advantage+ para que Meta optimice.',
    placements: 'instagram',
    tips: ['Demo: probá dos piezas distintas en la misma campaña.'],
  }
}
