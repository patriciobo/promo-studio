import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('../db', () => ({ db: {} }))

import { parseManifest } from '../manifest'
import { weekSlots } from '../schedule'
import { imagesPerMonth } from '../models'
import { buildPlanPrompt, postFromPlan, videoPromptFor } from '../pipeline'
import { buildRadarPrompt, classify, describeMarket, keepKnownTrends, marketOf, perRun, RadarSchema, slugKey, trendSlotsFor, type Observation } from '../trends'
import { pickDuration, reelPlan, VIDEO_MODELS, videoModelOf } from '../video-models'

const YAML = `
name: Mi Tenis
url: https://mitenis.app
tagline: Entrenamiento físico para tenistas amateur
audience: { countries: [UY, AR], age: [22, 55] }
languages: [es]
brand: { colors: ["#1c6a4e", "#f6f6f3", "#17191b"] }
features: [Plan semanal automático]
cadence: { feed: 3, reels: 1, stories: 0 }
`
const m = (parseManifest(YAML) as unknown as { manifest: never }).manifest as ReturnType<typeof parseManifest> extends { manifest: infer M } ? M : never

const day = (n: number) => new Date(Date.UTC(2026, 10, n, 12))

describe('reels con modelo de video', () => {
  it('la cadencia vuelve a programar reels: el último post de feed', () => {
    const s = weekSlots(new Date('2026-10-05T00:00:00Z'), { feed: 3, reels: 1, stories: 0 }, '10:00', 'UTC')
    expect(s.map((x) => x.type)).toEqual(['CAROUSEL', 'IMAGE', 'REEL'])
    // Un promo.yaml guardado antes de que existiera cadence.reels sigue sin reels.
    expect(weekSlots(new Date('2026-10-05T00:00:00Z'), { feed: 3, stories: 0 }, '10:00', 'UTC').some((x) => x.type === 'REEL')).toBe(false)
  })
  it('elige la duración permitida más cercana y estima el costo', () => {
    expect(pickDuration({ durations: [4, 6, 8] }, 5)).toBe(4)
    expect(pickDuration({ durations: [4, 6, 8] }, 7)).toBe(6)
    const veo = videoModelOf(null)
    expect(veo.id).toBe('google/veo-3.1-lite')
    const p = reelPlan(veo, 3)
    expect(p.seconds).toBe(4)
    expect(p.costUsd).toBeCloseTo(0.6)
    expect(reelPlan(veo, 10).seconds).toBe(4) // tope de escenas
    expect(videoModelOf('otro/modelo').id).toBe('otro/modelo')
    for (const v of VIDEO_MODELS) expect(v.durations.length && v.pricePerSec > 0 && v.examples.startsWith('https://')).toBeTruthy()
  })
  it('el plan pide videoPrompt por escena y no una escena de cierre', () => {
    const slots = weekSlots(new Date('2026-10-05T00:00:00Z'), { feed: 1, reels: 1, stories: 0 }, '10:00', 'UTC')
    const p = buildPlanPrompt(m, slots, { feed: [], texts: [], releases: [], recent: [], bestPillars: [] })
    expect(p.system).toMatch(/videoPrompt/)
    expect(p.system).toMatch(/not an ad and never a slideshow/)
    expect(JSON.parse(p.user).week[0].slideRules).toMatch(/Do NOT write a call-to-action scene/)
  })
  it('el prompt de video pide movimiento real y nada de texto', () => {
    const v = videoPromptFor(m, 'A woman laughs while checking her phone', { kind: 'photo', style: 'warm' })
    expect(v).toMatch(/9:16/)
    expect(v).toMatch(/not a slideshow or a slow zoom/)
    expect(v).toMatch(/No on-screen text/)
    expect(videoPromptFor(m, 'x', { kind: 'illustration', style: 'flat' })).toMatch(/Animated in this illustration style: flat/)
  })
  it('el reel guarda hasta 4 escenas y la tendencia elegida', () => {
    const slot = { type: 'REEL' as const, day: 0, at: new Date() }
    const post = postFromPlan({ id: 'a' }, null, slot, { slot: 0, pillar: 'x', hook: 'h', caption: 'c', hashtags: [], altText: '', imagePrompt: '', trendId: 't1', slides: Array.from({ length: 6 }, (_, i) => ({ title: `${i}` })) })
    expect((post.slides as unknown[]).length).toBe(4)
    expect(post.trendId).toBe('t1')
  })
  it('los primeros cuadros cuentan en el estimado de imágenes', () => {
    expect(imagesPerMonth({ feed: 1, reels: 1, stories: 0 })).toBe(13) // 3 cuadros × 4,33
  })
})

describe('radar de tendencias', () => {
  it('el mercado es idioma y países ordenados', () => {
    expect(marketOf(m)).toBe('es:AR,UY')
    expect(describeMarket('es:AR,UY')).toBe('Spanish-speaking Instagram users in AR, UY')
    expect(describeMarket('pt:')).toBe('Portuguese-speaking Instagram users')
  })
  it('acepta respuestas desprolijas del modelo', () => {
    const r = RadarSchema.parse({ trends: [{ key: 'POV Primer día', name: 'POV', stage: 'viral', momentum: '140' }] })
    expect(r.trends[0].stage).toBe('peak')
    expect(r.trends[0].momentum).toBe(100)
    expect(slugKey('POV: Primer día!')).toBe('pov-primer-dia')
  })
  it('el pedido incluye las conocidas para que repita sus claves', () => {
    const p = buildRadarPrompt('es:AR', '2026-11-04', 'X', [{ key: 'pov-x', name: 'POV x', stage: 'peak', momentum: 70 }])
    expect(p.system).toMatch(/REUSE ITS KEY/)
    expect(p.system).toMatch(/Today is 2026-11-04/)
    expect(JSON.parse(p.user).known[0].key).toBe('pov-x')
  })
  it('una pasada con dos fuentes cuenta como una observación', () => {
    const at = new Date('2026-11-04T07:30:00Z')
    const runs = perRun([
      { momentum: 80, stage: 'emerging', at },
      { momentum: 60, stage: 'peak', at: new Date(at.getTime() + 60e3) },
      { momentum: 50, stage: 'peak', at: new Date('2026-11-03T07:30:00Z') },
    ])
    expect(runs).toHaveLength(2)
    expect(runs.find((r) => r.at === at)).toMatchObject({ momentum: 70, stage: 'peak' })
  })
  it('un pico que cae fuerte o dos veces seguidas está saturado aunque el modelo diga pico', () => {
    const obs = (vals: [number, Observation['stage']][]): Observation[] => vals.map(([momentum, stage], i) => ({ momentum, stage, at: day(i + 1) }))
    expect(classify(obs([[70, 'peak'], [50, 'peak']]), day(2), day(2))).toBe('saturated')
    expect(classify(obs([[70, 'peak'], [65, 'peak'], [60, 'peak']]), day(3), day(3))).toBe('saturated')
    expect(classify(obs([[60, 'emerging'], [75, 'peak']]), day(2), day(2))).toBe('peak')
    expect(classify(obs([[30, 'saturated'], [15, 'saturated']]), day(2), day(2))).toBe('dead')
  })
  it('si deja de aparecer, pasa de moda', () => {
    const o: Observation[] = [{ momentum: 80, stage: 'peak', at: day(1) }]
    expect(classify(o, day(1), day(4))).toBe('saturated') // 3 días sin verla
    expect(classify(o, day(1), day(6))).toBe('dead') // 5 días
  })
  it('una saturada sólo revive con una suba clara', () => {
    const o = (a: number, b: number): Observation[] => [
      { momentum: a, stage: 'saturated', at: day(1) },
      { momentum: b, stage: 'peak', at: day(2) },
    ]
    expect(classify(o(40, 45), day(2), day(2), 'saturated')).toBe('saturated')
    expect(classify(o(40, 70), day(2), day(2), 'saturated')).toBe('peak')
  })
  it('el plan recibe las tendencias, cuántas usar y las notas del algoritmo', () => {
    const slots = weekSlots(new Date('2026-10-05T00:00:00Z'), { feed: 2, stories: 0 }, '10:00', 'UTC')
    const trends = [{ id: 't1', name: 'POV primer día', platform: 'tiktok', kind: 'format', stage: 'emerging', summary: 's', howTo: 'h' }]
    const p = buildPlanPrompt(m, slots, { feed: [], texts: [], releases: [], recent: [], bestPillars: [], trends, algo: ['Los envíos por DM pesan mucho'], trendSlots: trendSlotsFor(2) })
    expect(p.system).toMatch(/Base at most 1 post/)
    expect(p.system).toMatch(/Never copy anyone else's images/)
    expect(p.system).toMatch(/Los envíos por DM pesan mucho/)
    expect(p.system).toMatch(/"trendId":string\|null/)
    expect(JSON.parse(p.user).trends[0].id).toBe('t1')
    const forced = buildPlanPrompt(m, slots.slice(0, 1), { feed: [], texts: [], releases: [], recent: [], bestPillars: [], trends, forcedTrend: 't1' })
    expect(forced.system).toMatch(/MUST be based on the trend "POV primer día"/)
    const none = buildPlanPrompt(m, slots, { feed: [], texts: [], releases: [], recent: [], bestPillars: [] })
    expect(none.system).not.toMatch(/trendId/)
  })
  it('descarta tendencias inventadas por el modelo', () => {
    const plan = keepKnownTrends({ posts: [{ trendId: 't1' }, { trendId: 'nada' }, {}] }, [{ id: 't1' }])
    expect(plan.posts.map((p) => p.trendId)).toEqual(['t1', null, undefined])
    expect([trendSlotsFor(0), trendSlotsFor(3), trendSlotsFor(5)]).toEqual([0, 1, 2])
  })
})
