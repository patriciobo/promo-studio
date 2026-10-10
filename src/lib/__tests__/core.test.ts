import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('../db', () => ({ db: {} }))

import { flowScreenPath, parseManifest, setYamlStyle } from '../manifest'
import { inOrder } from '../images'
import { fromLocalInput, localParts, toLocalInput, weekSlots, zonedTime } from '../schedule'
import { adCandidates, engagement, median, relativeScore } from '../score'
import { containerRequests, publish, type GraphClient } from '../instagram'
import { explain, MetaError } from '../meta-errors'
import { buildSuggestPrompt, mockSuggestion, SuggestionSchema } from '../ad-suggest'
import { adMessage, adOnlyCreative, boostCreative, budgetError, campaignLink, campaignRequests, plannedSpend } from '../meta-ads'
import { buildPlanPrompt, compactReport, styleFor, dailySourceUrl, keepKnownImages, mockPlan, needsRender, postFromPlan, slideLayout } from '../pipeline'
import { encodeImageChoice, IMAGE_KINDS, IMAGE_MODELS, imagePrice, imagesPerMonth, parseImageChoice, parseImageKind, SUGGESTED } from '../models'
import { aspectFor } from '../openrouter'
import { normalizeRepo } from '../github'
import { brandFrom } from '@/templates/brand'
import { postCost, usdSmall } from '../view'
import { DESIGN_STYLES, designStyle, parseDesignStyle, sampleKey, samplesOfKind } from '../styles'
import { TEMPLATES } from '@/templates/styles'
import { buildStylePrompt, cleanSuggestions } from '../style-suggest'
import { allItems, parseSampleItems } from '../style-samples'
import { digits, parseReply } from '../whatsapp'
import { localDay, starterSlots, STARTER_TOPICS } from '../starter'

const YAML = `
name: Mi Tenis
url: https://mitenis.app
tagline: Entrenamiento físico para tenistas amateur
audience: { countries: [AR, UY], age: [22, 55] }
languages: [es]
tone: cercano, voseo
brand: { colors: ["#1c6a4e", "#f6f6f3", "#17191b"], font: Inter, logo: .promo/logo.svg }
features: [Plan semanal automático, Figuras 3D]
pillars: [ejercicio, táctica, producto]
hashtags: ["#tenis"]
avoid: [promesas médicas]
cta: Armá tu plan gratis (link en la bio)
`

describe('manifest', () => {
  it('valida y completa valores por defecto', () => {
    const r = parseManifest(YAML)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.manifest.cadence).toEqual({ feed: 3, reels: 1, stories: 2 })
      expect(r.hash).toHaveLength(16)
    }
  })
  it('explica los errores por campo', () => {
    const r = parseManifest('name: X\nurl: no-es-url\ntagline: ok ok\nbrand: { colors: ["rojo"] }\nfeatures: []')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/url/)
    if (!r.ok) expect(r.error).toMatch(/brand.colors/)
  })
  it('rechaza YAML roto', () => {
    expect(parseManifest('name: [').ok).toBe(false)
  })
  const FLOWS = `
capture:
  url: http://localhost:3000
  login: { path: /login, steps: [{ fill: "input[name=email]", value: "$PROMO_USER" }, { click: "button[type=submit]" }, { waitFor: /inicio }] }
flows:
  - id: armar-plan
    name: Armar el plan semanal
    steps:
      - { path: /plan, shows: Plan de la semana vacío }
      - { path: /plan, actions: [{ click: "text=Generar" }], shows: Plan con los ejercicios de cada día }
`
  it('acepta flujos y cómo capturarlos', () => {
    const r = parseManifest(YAML + FLOWS)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.manifest.capture?.device).toBe('mobile')
      expect(r.manifest.flows[0].steps[0].actions).toEqual([])
      expect(r.manifest.flows[0].steps[1].actions).toEqual([{ click: 'text=Generar' }])
    }
    expect(parseManifest(YAML).ok && (parseManifest(YAML) as { manifest: { flows: unknown[] } }).manifest.flows).toEqual([])
  })
  it('rechaza flujos con ids repetidos, ids no kebab o sin pasos', () => {
    const dup = FLOWS.replace('flows:', 'flows:\n  - { id: armar-plan, name: Otro flujo, steps: [{ path: /x, shows: Algo visible }] }')
    expect(parseManifest(YAML + dup).ok).toBe(false)
    expect(parseManifest(YAML + FLOWS.replace('id: armar-plan', 'id: Armar Plan')).ok).toBe(false)
    expect(parseManifest(YAML + 'flows: [{ id: x, name: Vacío, steps: [] }]').ok).toBe(false)
  })
  it('ubica las capturas de cada paso y conserva el orden elegido', () => {
    expect(flowScreenPath('armar-plan', 0)).toBe('.promo/screens/armar-plan/1.png')
    expect(inOrder(['c', 'a', 'b'], [{ id: 'a' }, { id: 'b' }, { id: 'c' }]).map((r) => r.id)).toEqual(['c', 'a', 'b'])
    expect(inOrder(['x', 'a'], [{ id: 'a' }]).map((r) => r.id)).toEqual(['a'])
  })
})

describe('schedule', () => {
  it('convierte hora local a UTC (Buenos Aires = UTC-3)', () => {
    expect(zonedTime(2026, 10, 5, 10, 0, 'America/Argentina/Buenos_Aires').toISOString()).toBe('2026-10-05T13:00:00.000Z')
  })
  it('reparte 3 feed (último reel) y 2 stories en días distintos', () => {
    const s = weekSlots(new Date('2026-10-05T00:00:00Z'), { feed: 3, reels: 1, stories: 2 }, '10:00', 'America/Argentina/Buenos_Aires')
    expect(s.map((x) => `${x.day}:${x.type}`)).toEqual(['0:CAROUSEL', '1:STORY', '2:IMAGE', '3:STORY', '4:REEL'])
    expect(s[0].at.toISOString()).toBe('2026-10-05T13:00:00.000Z')
    expect(s[1].at.toISOString()).toBe('2026-10-06T22:00:00.000Z')
  })
})

describe('score', () => {
  it('pondera guardados y compartidos', () => {
    expect(engagement({ reach: 100, likes: 10, comments: 1, saves: 2, shares: 1 })).toBeCloseTo((6 + 3 + 2 + 10) / 100)
    expect(engagement({ reach: 0, likes: 5 })).toBe(0)
  })
  it('candidatos: los mejores por encima de la mediana', () => {
    expect(median([1, 3, 2])).toBe(2)
    expect(relativeScore(4, 2)).toBe(2)
    const posts = Array.from({ length: 20 }, (_, i) => ({ id: i, score: i / 10 }))
    expect(adCandidates(posts).map((p) => p.id)).toEqual([19, 18])
  })
})

describe('instagram', () => {
  it('arma contenedores de carrusel, reel y story', () => {
    const c = containerRequests({ igUserId: '1', kind: 'CAROUSEL', caption: 'hola', media: [{ url: 'a.jpg' }, { url: 'b.jpg' }] })
    expect(c.children).toEqual([
      { image_url: 'a.jpg', is_carousel_item: true },
      { image_url: 'b.jpg', is_carousel_item: true },
    ])
    expect(c.main.media_type).toBe('CAROUSEL')
    expect(containerRequests({ igUserId: '1', kind: 'REEL', caption: 'x', media: [{ url: 'v.mp4', video: true }] }).main).toMatchObject({ media_type: 'REELS', video_url: 'v.mp4', share_to_feed: true })
    expect(containerRequests({ igUserId: '1', kind: 'STORY', caption: 'x', media: [{ url: 's.jpg' }] }).main).toEqual({ media_type: 'STORIES', image_url: 's.jpg' })
  })
  it('publica: hijos → esperar → carrusel → esperar → publish', async () => {
    const calls: string[] = []
    let n = 0
    const g: GraphClient = {
      async get(path) {
        calls.push(`GET ${path}`)
        return { status_code: 'FINISHED', permalink: 'https://instagram.com/p/x' } as never
      },
      async post(path, params) {
        calls.push(`POST ${path} ${params?.media_type ?? params?.creation_id ?? 'item'}`)
        return { id: `c${++n}` } as never
      },
    }
    const r = await publish(g, { igUserId: 'ig', kind: 'CAROUSEL', caption: 'c', media: [{ url: '1' }, { url: '2' }] }, { tries: 1, everyMs: 0 })
    expect(r).toEqual({ mediaId: 'c4', permalink: 'https://instagram.com/p/x' })
    expect(calls.filter((c) => c.startsWith('POST'))).toEqual(['POST ig/media item', 'POST ig/media item', 'POST ig/media CAROUSEL', 'POST ig/media_publish c3'])
  })
})

describe('errores de Meta', () => {
  it('traduce token vencido, descarga fallida y límites', () => {
    expect(explain(new MetaError(190, undefined, 'Error validating access token', 'me')).title).toMatch(/Token/)
    expect(explain(new MetaError(9004, 2207052, 'Media download has failed', 'x/media')).retry).toBe(true)
    expect(explain(new MetaError(100, 1885183, 'La publicación con contenido publicitario se creó con una app que se encuentra en modo de desarrollo.', 'act_1/adcreatives')).fix).toMatch(/privacidad/)
    expect(explain(new MetaError(4, undefined, 'Application request limit reached', 'x')).retry).toBe(true)
    expect(explain(new MetaError(100, undefined, 'The instagram account is not authorized for this ad account', 'act/adcreatives')).fix).toMatch(/B.6/)
  })
})

describe('anuncios', () => {
  const base = {
    name: 'n',
    objective: 'TRAFFIC',
    budgetType: 'LIFETIME',
    budget: 3000,
    spendCap: null,
    startAt: new Date('2026-10-10T12:00:00Z'),
    endAt: new Date('2026-10-17T12:00:00Z'),
    placements: 'instagram',
    cta: 'LEARN_MORE',
    link: 'https://x.app?utm_campaign=c',
    targeting: { countries: ['AR'], ageMin: 16, ageMax: 70, interests: [{ id: '6003', name: 'Tenis' }], advantage: true },
  }
  it('campaña y conjunto en pausa, con presupuesto total y público', () => {
    const r = campaignRequests(base, 'page')
    expect(r.campaign).toMatchObject({ status: 'PAUSED', objective: 'OUTCOME_TRAFFIC' })
    expect(r.campaign).not.toHaveProperty('spend_cap')
    const a = r.adset('c')
    expect(a).toMatchObject({ status: 'PAUSED', lifetime_budget: 3000, optimization_goal: 'LINK_CLICKS', campaign_id: 'c' })
    expect(a).not.toHaveProperty('daily_budget')
    const t = JSON.parse(a.targeting)
    expect(t).toMatchObject({ age_min: 18, age_max: 65, publisher_platforms: ['instagram'], targeting_automation: { advantage_audience: 1 } })
    expect(t.flexible_spec[0].interests).toEqual([{ id: '6003', name: 'Tenis' }])
  })
  it('segmentación detallada en grupos, género, estudios y ciudades', () => {
    const t = JSON.parse(
      campaignRequests(
        {
          ...base,
          targeting: {
            ...base.targeting,
            interests: [{ id: 'old', name: 'Viejo' }],
            groups: [
              [{ type: 'work_positions', id: 'w1', name: 'Gerente' }, { type: 'interests', id: 'i1', name: 'Tenis' }],
              [{ type: 'behaviors', id: 'b1', name: 'Viajeros' }],
            ],
            genders: [2],
            education: [3, 9],
            places: [{ key: 'c1', name: 'Rosario', type: 'city', radius: 25 }, { key: 'r1', name: 'Córdoba', type: 'region' }],
          },
        },
        'page',
      ).adset('c').targeting,
    )
    expect(t.flexible_spec).toEqual([
      { interests: [{ id: 'old', name: 'Viejo' }, { id: 'i1', name: 'Tenis' }], work_positions: [{ id: 'w1', name: 'Gerente' }] },
      { behaviors: [{ id: 'b1', name: 'Viajeros' }] },
    ])
    expect(t).toMatchObject({ genders: [2], education_statuses: [3, 9] })
    expect(t.geo_locations).toEqual({ regions: [{ key: 'r1' }], cities: [{ key: 'c1', radius: 25, distance_unit: 'kilometer' }] })
    const plain = JSON.parse(campaignRequests({ ...base, targeting: { ...base.targeting, interests: [], genders: [1, 2] } }, 'page').adset('c').targeting)
    expect(plain).not.toHaveProperty('genders')
    expect(plain).not.toHaveProperty('flexible_spec')
    expect(plain.geo_locations).toEqual({ countries: ['AR'] })
  })
  it('con Advantage+ la edad máxima va en 65 (Meta no acepta un límite menor)', () => {
    const ages = (advantage: boolean) => JSON.parse(campaignRequests({ ...base, targeting: { ...base.targeting, ageMin: 20, ageMax: 50, advantage } }, 'page').adset('c').targeting)
    expect(ages(true)).toMatchObject({ age_min: 20, age_max: 65 })
    expect(ages(false)).toMatchObject({ age_min: 20, age_max: 50 })
  })
  it('diario, tope duro, Facebook y WhatsApp', () => {
    const r = campaignRequests({ ...base, budgetType: 'DAILY', budget: 500, spendCap: 2000, placements: 'instagram_facebook', objective: 'WHATSAPP' }, 'page')
    expect(r.campaign.spend_cap).toBe(2000)
    const a = r.adset('c')
    expect(a).toMatchObject({ daily_budget: 500, destination_type: 'WHATSAPP', optimization_goal: 'CONVERSATIONS' })
    expect(JSON.parse(a.promoted_object!)).toEqual({ page_id: 'page' })
    expect(JSON.parse(a.targeting).publisher_platforms).toEqual(['instagram', 'facebook'])
    expect(JSON.parse(a.targeting).instagram_positions).not.toContain('explore')
  })
  it('gasto máximo y mínimo de Meta', () => {
    expect(plannedSpend(base)).toBe(3000)
    expect(plannedSpend({ ...base, budgetType: 'DAILY', budget: 500 })).toBe(3500)
    expect(plannedSpend({ ...base, budgetType: 'DAILY', budget: 500, spendCap: 1000 })).toBe(1000)
    expect(budgetError(base, 100, 'USD')).toBeNull()
    expect(budgetError({ ...base, budget: 600 }, 100, 'USD')).toMatch(/7\.00 USD en total para 7 días/)
    expect(budgetError({ ...base, budgetType: 'DAILY', budget: 50 }, 100, 'USD')).toMatch(/por día/)
  })
  it('promociona el post publicado o arma la pieza sólo para anuncios', () => {
    expect(boostCreative(base, { pageId: 'p', igUserId: 'ig', mediaId: 'm' })).toMatchObject({ source_instagram_media_id: 'm', instagram_user_id: 'ig' })
    expect(JSON.parse(boostCreative({ ...base, objective: 'ENGAGEMENT', link: null }, { pageId: 'p', igUserId: 'ig', mediaId: 'm' }).call_to_action ?? 'null')).toBeNull()
    const o = { pageId: 'p', igUserId: 'ig', message: 'hola', headline: 'Título', link: 'https://x.app' }
    const single = JSON.parse(adOnlyCreative(base, { ...o, images: ['h1'] }).object_story_spec)
    expect(single).toMatchObject({ page_id: 'p', instagram_user_id: 'ig', link_data: { image_hash: 'h1', name: 'Título', message: 'hola' } })
    const carousel = JSON.parse(adOnlyCreative(base, { ...o, images: ['h1', 'h2'] }).object_story_spec)
    expect(carousel.link_data.child_attachments.map((c: { image_hash: string }) => c.image_hash)).toEqual(['h1', 'h2'])
    const video = JSON.parse(adOnlyCreative(base, { ...o, images: ['thumb'], videoId: 'v' }).object_story_spec)
    expect(video.video_data).toMatchObject({ video_id: 'v', image_hash: 'thumb' })
  })
  it('texto del anuncio sin hashtags y link con UTM', () => {
    expect(adMessage('Hook\n\nCuerpo\n\n#tenis #padel')).toBe('Hook\n\nCuerpo')
    expect(campaignLink('https://x.app', 'c1')).toBe('https://x.app?utm_source=instagram&utm_medium=paid&utm_campaign=c1')
    expect(campaignLink('https://x.app?a=1', 'c1')).toContain('?a=1&utm_source')
  })
})

describe('planificación', () => {
  const m = (parseManifest(YAML) as unknown as { manifest: never }).manifest
  it('el prompt incluye reglas por tipo, lo que no hay que repetir y lo que hay que evitar', () => {
    const slots = weekSlots(new Date('2026-10-05T00:00:00Z'), { feed: 1, reels: 0, stories: 1 }, '10:00', 'UTC')
    const p = buildPlanPrompt(m, slots, { feed: [], texts: [], releases: [], recent: [{ pillar: 'táctica', hook: 'Cómo ganarle al frontón' }], bestPillars: ['ejercicio'] })
    expect(p.system).toMatch(/promesas médicas/)
    expect(p.user).toMatch(/Cómo ganarle al frontón/)
    expect(JSON.parse(p.user).week).toHaveLength(2)
    expect(p.system).toMatch(/flat vector illustration/)
    expect(p.system).toMatch(/own imagePrompt/)
  })
  it('con tipo foto pide fotos realistas en vez de ilustraciones', () => {
    const slots = weekSlots(new Date('2026-10-05T00:00:00Z'), { feed: 1, reels: 0, stories: 0 }, '10:00', 'UTC')
    const p = buildPlanPrompt(m, slots, { feed: [], texts: [], releases: [], recent: [], bestPillars: [], kind: 'photo' })
    expect(p.system).toMatch(/realistic photo/)
    expect(p.system).toMatch(/photorealistic lifestyle photography/)
    expect(p.system).not.toMatch(/illustration in this style/)
  })
  it('pasa las imágenes subidas al prompt y pide basarse en las elegidas', () => {
    const slots = weekSlots(new Date('2026-10-05T00:00:00Z'), { feed: 2, reels: 0, stories: 0 }, '10:00', 'UTC')
    const images = [
      { id: 'a', kind: 'SCREENSHOT' as const, description: 'Pantalla para agendar un turno', note: 'paso 1', focus: true },
      { id: 'b', kind: 'PHOTO' as const, description: 'Cancha de tenis', note: null, focus: false },
    ]
    const p = buildPlanPrompt(m, slots, { feed: [], texts: [], releases: [], recent: [], bestPillars: [], images })
    const u = JSON.parse(p.user)
    expect(u.appImages).toEqual([
      { id: 'a', kind: 'SCREENSHOT', shows: 'Pantalla para agendar un turno', userNote: 'paso 1', focus: true },
      { id: 'b', kind: 'PHOTO', shows: 'Cancha de tenis' },
    ])
    expect(u.instructions).toMatch(/focus:true/)
    expect(p.system).toMatch(/imageId/)
    const none = buildPlanPrompt(m, slots, { feed: [], texts: [], releases: [], recent: [], bestPillars: [] })
    expect(JSON.parse(none.user).appImages).toBeUndefined()
    expect(none.system).not.toMatch(/imageId/)
  })
  it('descarta imageId inventados y el modo demo reparte las imágenes elegidas', () => {
    const plan = { posts: [{ slot: 0, pillar: 'x', hook: 'h', caption: 'c', hashtags: [], altText: '', imagePrompt: 'p', slides: [{ title: '1', imageId: 'a' }, { title: '2', imageId: 'inventada' }] }] }
    const kept = keepKnownImages(plan, [{ id: 'a', kind: 'SCREENSHOT', description: null, note: null, focus: true }])
    expect(kept.posts[0].slides.map((s) => s.imageId)).toEqual(['a', null])
    const slots = weekSlots(new Date('2026-10-05T00:00:00Z'), { feed: 2, reels: 0, stories: 0 }, '10:00', 'UTC')
    const mock = mockPlan(m, slots, [], ['a', 'b'])
    expect(mock.posts.map((p) => p.slides.map((s) => (s as { imageId?: string }).imageId).find(Boolean))).toEqual(['a', 'b'])
  })
  it('agrega hashtags que faltan y recorta diapositivas según el tipo', () => {
    const slot = { type: 'IMAGE' as const, day: 0, at: new Date() }
    const d = postFromPlan({ id: 'a' }, 'b', slot, { slot: 0, pillar: 'x', hook: 'h', caption: 'Texto #tenis', hashtags: ['tenis', 'padel'], altText: 'alt', imagePrompt: 'p', slides: [{ title: '1' }, { title: '2' }] })
    expect(d.caption).toBe('Texto #tenis\n\n#padel')
    expect(d.slides).toHaveLength(1)
  })
})

describe('costo por publicación', () => {
  it('suma su parte del texto y todas sus ilustraciones, sin contar las piezas renderizadas', () => {
    const c = postCost({ textCostUsd: 0.002, assets: [{ kind: 'BACKGROUND', costUsd: 0.05 }, { kind: 'BACKGROUND', costUsd: 0.05 }, { kind: 'SLIDE', costUsd: null }] })
    expect(c).toMatchObject({ text: 0.002, image: 0.1, images: 2 })
    expect(c.total).toBeCloseTo(0.102)
    expect(usdSmall(0.0042)).toBe('US$ 0,004')
    expect(usdSmall(0.35)).toBe('US$ 0,35')
  })
})

describe('fecha de publicación', () => {
  it('convierte el datetime-local en la zona de la app, ida y vuelta', () => {
    const tz = 'America/Argentina/Buenos_Aires'
    const at = fromLocalInput('2026-10-06T09:30', tz)!
    expect(at.toISOString()).toBe('2026-10-06T12:30:00.000Z')
    expect(toLocalInput(at, tz)).toBe('2026-10-06T09:30')
    expect(fromLocalInput('6/10 9:30', tz)).toBeNull()
  })
})

describe('lote semanal', () => {
  it('al retomar un lote sólo renderiza lo nuevo o lo que falló sin piezas; lo revisado no se toca', () => {
    expect(needsRender({ status: 'DRAFT', slideCount: 0 })).toBe(true)
    expect(needsRender({ status: 'FAILED', slideCount: 0 })).toBe(true)
    expect(needsRender({ status: 'FAILED', slideCount: 3 })).toBe(false) // falló al publicar: se reintenta desde Calendario
    for (const status of ['PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED']) expect(needsRender({ status, slideCount: 1 })).toBe(false)
  })
})

describe('edición diaria', () => {
  const daily = `${YAML}daily: { source: "https://raw.githubusercontent.com/x/y/main/reports/{fecha}.md", time: "08:00" }\n`
  it('el promo.yaml acepta la edición diaria y valida la URL con {fecha}', () => {
    const r = parseManifest(daily)
    expect(r.ok && r.manifest.daily).toMatchObject({ time: '08:00', types: ['CAROUSEL', 'STORY'] })
    expect(parseManifest(`${YAML}daily: { source: "https://x.com/hoy.md" }\n`).ok).toBe(false)
    expect(parseManifest(`${YAML}daily: { source: "no es url {fecha}" }\n`).ok).toBe(false)
  })
  it('arma la URL del día en la zona horaria de la app', () => {
    // 02:30 UTC del 3/10 todavía es 2/10 en Argentina
    const { date, minutes } = localParts(new Date('2026-10-03T02:30:00Z'), 'America/Argentina/Buenos_Aires')
    expect(date).toBe('2026-10-02')
    expect(minutes).toBe(23 * 60 + 30)
    expect(dailySourceUrl('https://a.com/reports/{fecha}.md', date)).toBe('https://a.com/reports/2026-10-02.md')
  })
  it('saca las referencias con link del reporte', () => {
    expect(compactReport('- Hecho [[57]](<https://a.com/x>)[[78]](<https://b.com/y>)\n')).toBe('- Hecho\n')
  })
  it('el prompt diario incluye el reporte y prohíbe salir de él', () => {
    const m = (parseManifest(daily) as unknown as { manifest: never }).manifest
    const slots = [{ type: 'CAROUSEL' as const, day: 4, at: new Date() }]
    const p = buildPlanPrompt(m, slots, { feed: [], texts: [], releases: [], recent: [], bestPillars: [], daily: { date: '2026-10-02', report: '## Resumen ejecutivo\nTexto del día' } })
    const u = JSON.parse(p.user)
    expect(u.todaysEdition.report).toMatch(/Texto del día/)
    expect(u.instructions).toMatch(/ONLY facts/)
  })
  it('suma las ilustraciones diarias al estimado mensual', () => {
    expect(imagesPerMonth({ feed: 0, reels: 0, stories: 0 }, { types: ['CAROUSEL', 'STORY'] })).toBe(180)
  })
})

describe('modelos de imagen', () => {
  it('el catálogo tiene 3 modelos, de los dos usos, con todos los datos', () => {
    expect(IMAGE_MODELS.map((m) => m.id)).toEqual(['recraft/recraft-v4.1-flash', 'google/gemini-3.1-flash-image', 'openai/gpt-image-2.5-sunburst'])
    expect(new Set(IMAGE_MODELS.map((m) => m.tier))).toEqual(new Set(['pruebas', 'mejor-calidad']))
    for (const m of IMAGE_MODELS) expect(m.level && m.uses && m.popularity && m.priceUsd > 0).toBeTruthy()
  })
  it('estima las imágenes por mes según la cadencia (una por diapositiva o escena)', () => {
    // carrusel 5 + imagen 1 + reel 4 + 2 stories = 12 por semana
    expect(imagesPerMonth({ feed: 3, reels: 1, stories: 2 })).toBe(52)
    expect(imagesPerMonth({ feed: 0, reels: 0, stories: 0 })).toBe(0)
  })
  it('el precio depende de la calidad en los modelos que cobran por tokens', () => {
    const gpt = IMAGE_MODELS.find((m) => m.qualities)!
    expect(imagePrice(gpt, 'low')).toBeLessThan(imagePrice(gpt, null))
    expect(imagePrice(gpt, 'high')).toBeGreaterThan(imagePrice(gpt, null))
  })
  it('codifica la elección del selector junto a los botones', () => {
    expect(parseImageChoice(encodeImageChoice({ model: 'openai/gpt-image-2.5-sunburst', quality: 'medium' }))).toEqual({ model: 'openai/gpt-image-2.5-sunburst', quality: 'medium' })
    expect(parseImageChoice(encodeImageChoice({ model: 'recraft/recraft-v4.1-flash', quality: null }))).toEqual({ model: 'recraft/recraft-v4.1-flash', quality: null })
    expect(parseImageChoice('none')).toEqual({ model: null, quality: null })
    expect(parseImageChoice('')).toBeUndefined()
    expect(parseImageChoice(encodeImageChoice({ model: 'google/gemini-3.1-flash-image', quality: null }), 'photo')).toEqual({ model: 'google/gemini-3.1-flash-image', quality: null, kind: 'photo' })
  })
  it('valida el tipo de imagen', () => {
    expect(parseImageKind('photo')).toBe('photo')
    expect(parseImageKind('illustration')).toBe('illustration')
    expect(parseImageKind('video')).toBeUndefined()
    expect(parseImageKind(null)).toBeUndefined()
  })
  it('cada modelo dice para qué tipo sirve y el sugerido existe y es ideal', () => {
    for (const m of IMAGE_MODELS) for (const k of IMAGE_KINDS) expect(['ideal', 'bien', 'flojo']).toContain(m.fit[k.id])
    for (const k of IMAGE_KINDS) expect(IMAGE_MODELS.find((m) => m.id === SUGGESTED[k.id])?.fit[k.id]).toBe('ideal')
  })
  it('pide 3:4 para el feed a los modelos que no aceptan 4:5', () => {
    expect(aspectFor('recraft/recraft-v4.1-flash', '4:5')).toBe('3:4')
    expect(aspectFor('openai/gpt-image-2.5-sunburst', '4:5')).toBe('3:4')
    expect(aspectFor('google/gemini-3.1-flash-image', '4:5')).toBe('4:5')
    expect(aspectFor('recraft/recraft-v4.1-flash', '9:16')).toBe('9:16')
  })
  it('ilustra cada diapositiva salvo el cierre y la de la captura', () => {
    const s = { title: 't' }
    expect([0, 1, 2, 3].map((i) => slideLayout('CAROUSEL', 4, i, true, s))).toEqual(['cover', 'text-shot', 'text-illustration', 'cta'])
    expect([0, 1, 2].map((i) => slideLayout('CAROUSEL', 3, i, false, s))).toEqual(['cover', 'text-illustration', 'cta'])
    expect([0, 1, 2, 3].map((i) => slideLayout('REEL', 4, i, true, s))).toEqual(['cover', 'cover', 'cover', 'cta'])
    expect(slideLayout('STORY', 1, 0, true, s)).toBe('cover')
  })
  it('una captura subida va enmarcada y una foto reemplaza la ilustración', () => {
    const s = { title: 't', imageId: 'img' }
    expect([0, 1, 2, 3].map((i) => slideLayout('CAROUSEL', 4, i, false, s, 'SCREENSHOT'))).toEqual(['text-shot', 'text-shot', 'text-shot', 'cta'])
    expect([0, 1, 2, 3].map((i) => slideLayout('CAROUSEL', 4, i, false, s, 'PHOTO'))).toEqual(['cover', 'text-illustration', 'text-illustration', 'cta'])
    expect(slideLayout('REEL', 3, 1, false, s, 'PHOTO')).toBe('cover')
    expect(slideLayout('STORY', 1, 0, false, s, 'SCREENSHOT')).toBe('text-shot')
  })
})

describe('otros', () => {
  it('normaliza repos', () => {
    expect(normalizeRepo('https://github.com/patriciobo/mi-tenis.git')).toBe('patriciobo/mi-tenis')
    expect(normalizeRepo('patriciobo/mi-tenis')).toBe('patriciobo/mi-tenis')
  })
  it('elige fondo claro y tinta oscura de la paleta', () => {
    const b = brandFrom({ name: 'X', url: 'https://x.app/', brand: { colors: ['#1c6a4e', '#17191b', '#f6f6f3'], font: 'Inter' } } as never)
    expect(b).toMatchObject({ primary: '#1c6a4e', bg: '#f6f6f3', ink: '#17191b', url: 'x.app' })
  })
})

describe('login', () => {
  it('verifica usuario y contraseña con hash y bloquea tras varios intentos', async () => {
    const { checkCredentials, hashPassword, isLocked, loginConfigError, recordFail } = await import('../password')
    const env = { ADMIN_USER: 'Admin', ADMIN_PASSWORD_HASH: hashPassword('una clave bien larga') }
    expect(checkCredentials('admin', 'una clave bien larga', env)).toBe(true)
    expect(checkCredentials('admin', 'otra clave cualquiera', env)).toBe(false)
    expect(checkCredentials('otro', 'una clave bien larga', env)).toBe(false)
    expect(loginConfigError({ ADMIN_USER: 'a', ADMIN_PASSWORD: 'corta' })).toMatch(/al menos/)
    expect(checkCredentials('a', 'corta', { ADMIN_USER: 'a', ADMIN_PASSWORD: 'corta' })).toBe(false)
    for (let i = 0; i < 5; i++) recordFail('1.2.3.4', 0)
    expect(isLocked('1.2.3.4', 1000)).toBe(true)
    expect(isLocked('1.2.3.4', 16 * 60e3)).toBe(false)
  })
})

describe('sugerencias de campaña', () => {
  const m = (parseManifest(YAML) as unknown as { manifest: never }).manifest as Parameters<typeof mockSuggestion>[0]
  it('el prompt lleva la app, las piezas, el mínimo de la cuenta y los tipos de segmentación', () => {
    const ctx = { m, posts: [{ type: 'CAROUSEL', hook: 'Saque potente', caption: 'x', score: 1.4, insights: [] }], campaigns: [], account: { currency: 'ARS', minDaily: 150000, name: 'c', active: true } } as never
    const p = buildSuggestPrompt(m, ctx, { postIds: ['a'], objective: 'TRAFFIC' })
    expect(p.system).toMatch(/ARS, minimum 1500\.00 per day/)
    expect(p.system).toMatch(/work_positions \(Cargos\)/)
    expect(p.system).toMatch(/WHATSAPP not available/)
    expect(JSON.parse(p.user).adsToRun[0].hook).toBe('Saque potente')
  })
  it('la respuesta se valida con el esquema', () => {
    expect(SuggestionSchema.parse(mockSuggestion(m)).groups[0].length).toBeGreaterThan(0)
    expect(() => SuggestionSchema.parse({ ...mockSuggestion(m), groups: [[{ type: 'zodiac', term: 'Aries' }]] })).toThrow()
  })
})

describe('estilos de diseño', () => {
  const m = (parseManifest(YAML) as unknown as { manifest: never }).manifest as Parameters<typeof styleFor>[0]
  const b = brandFrom(m)

  it('cada estilo tiene sus tres plantillas y escapa el texto', () => {
    for (const s of DESIGN_STYLES) {
      const t = TEMPLATES[s.id]
      for (const html of [t.cover(b, { title: 'A <b> & "c"', eyebrow: 'x', background: 'data:image/jpeg;base64,AA' }), t.text(b, { title: 'T', items: ['uno', 'dos'], illustration: 'data:,' }), t.cta(b, { title: 'Fin', index: 4, total: 5 })]) {
        expect(html).toContain('<!doctype html>')
        expect(html).not.toContain('<b> &')
      }
    }
  })

  it('la estética de imagen sale del estilo; el clásico usa la del promo.yaml', () => {
    expect(styleFor(m, 'illustration', 'collage')).toContain('collage')
    expect(styleFor(m, 'photo', 'retro')).toContain('film')
    expect(styleFor(m, 'illustration', null)).toBe(styleFor(m, 'illustration', 'clasico'))
    expect(designStyle('inventado').id).toBe('clasico')
    expect(parseDesignStyle('inventado')).toBeUndefined()
  })

  it('brand.style se escribe en el promo.yaml sin perder comentarios ni el resto', () => {
    const yaml = setYamlStyle(`# mi app\n${YAML}`, 'retro')
    expect(yaml).toContain('# mi app')
    const r = parseManifest(yaml)
    expect(r.ok && r.manifest.brand.style).toBe('retro')
    expect(r.ok && r.manifest.brand.colors).toEqual(['#1c6a4e', '#f6f6f3', '#17191b'])
    expect(setYamlStyle(yaml, 'retro')).toBe(yaml)
  })

  it('las sugerencias sólo aceptan estilos del catálogo, sin repetir y hasta 3', () => {
    const picks = cleanSuggestions({ picks: [{ id: 'retro', reason: 'a' }, { id: 'nada' }, { id: 'retro' }, { id: 'papel' }, { id: 'bento' }, { id: 'amano' }] })
    expect(picks.map((p) => p.id)).toEqual(['retro', 'papel', 'bento'])
    expect(cleanSuggestions(null)).toEqual([])
    expect(buildStylePrompt(m).user).toContain('collage')
  })
})

describe('muestras de estilo', () => {
  it('lee las combinaciones tildadas y descarta las inválidas y repetidas', () => {
    expect(parseSampleItems(['retro-medium', 'suave3d-low', 'retro-medium', 'retro-medium-foto', 'inventado-high', 'poster-ultra', 'poster-low-video'])).toEqual([
      { style: 'retro', quality: 'medium', kind: 'illustration' },
      { style: 'suave3d', quality: 'low', kind: 'illustration' },
      { style: 'retro', quality: 'medium', kind: 'photo' },
    ])
  })
  it('todas las genéricas son cada estilo en cada calidad, del tipo pedido', () => {
    expect(allItems()).toHaveLength(DESIGN_STYLES.length * 3)
    expect(allItems(undefined, undefined, ['illustration', 'photo'])).toHaveLength(DESIGN_STYLES.length * 6)
  })
  it('separa las muestras por tipo de imagen', () => {
    const all = { 'retro-medium': 'a', 'retro-medium-foto': 'b', 'papel-high-foto': 'c', 'otra-cosa': 'x' }
    expect(samplesOfKind(all, 'illustration')).toEqual({ 'retro-medium': 'a' })
    expect(samplesOfKind(all, 'photo')).toEqual({ 'retro-medium': 'b', 'papel-high': 'c' })
    expect(sampleKey('retro', 'low', 'photo')).toBe('retro-low-foto')
  })
})

describe('consigna de la semana', () => {
  const m = (parseManifest(YAML) as unknown as { manifest: never }).manifest
  const slots = weekSlots(new Date('2026-10-05T00:00:00Z'), { feed: 1, reels: 0, stories: 1 }, '10:00', 'UTC')
  const ctx = { feed: [], texts: [], releases: [], recent: [], bestPillars: [] }
  it('el plan sigue la consigna del usuario cuando la hay', () => {
    expect(JSON.parse(buildPlanPrompt(m, slots, { ...ctx, brief: 'Semana del Día del Padre' }).user).instructions).toContain('brief from the user for the week: "Semana del Día del Padre"')
    expect(JSON.parse(buildPlanPrompt(m, slots, ctx).user).instructions).toMatch(/Balance the pillars/)
  })
})

describe('aprobación por WhatsApp', () => {
  it('entiende aprobar todo o algunas', () => {
    expect(parseReply('Ok, gracias!')).toEqual({ kind: 'approve', nums: null, note: 'gracias!' })
    expect(parseReply('Sí')).toMatchObject({ kind: 'approve', nums: null })
    expect(parseReply('dale la 1 y la 3')).toMatchObject({ kind: 'approve', nums: [1, 3] })
    expect(parseReply('ok 2, 4')).toMatchObject({ kind: 'approve', nums: [2, 4] })
    expect(parseReply('👍')).toMatchObject({ kind: 'approve', nums: null })
  })
  it('cambios y descartes necesitan el número, y guardan el pedido', () => {
    expect(parseReply('Cambios 2: una foto más clara')).toEqual({ kind: 'changes', nums: [2], note: 'una foto más clara' })
    expect(parseReply('no 3')).toEqual({ kind: 'reject', nums: [3], note: '' })
    expect(parseReply('no me gusta')).toEqual({ kind: 'other' })
    expect(parseReply('¿Cuándo sale?')).toEqual({ kind: 'other' })
    expect(parseReply('sino mañana')).toEqual({ kind: 'other' })
  })
  it('normaliza los números', () => {
    expect(digits('+54 9 351 123-4567')).toBe('5493511234567')
    expect(digits('5493511234567@c.us')).toBe('5493511234567')
  })
})

describe('kit inicial', () => {
  const m = (parseManifest(YAML) as unknown as { manifest: never }).manifest
  const ctx = { feed: [], texts: [], releases: [], recent: [], bestPillars: [] }
  const tz = 'America/Argentina/Buenos_Aires'
  const slots = starterSlots(new Date('2026-10-14T00:00:00Z'), '10:00', tz)
  it('primer día los 3 para fijar, separados 3 horas; después uno por día', () => {
    expect(slots).toHaveLength(9)
    expect(slots.slice(0, 3).map((s) => s.at.toISOString())).toEqual(['2026-10-14T13:00:00.000Z', '2026-10-14T16:00:00.000Z', '2026-10-14T19:00:00.000Z'])
    expect(slots.slice(3).map((s) => localDay(s.at, tz))).toEqual(['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20'])
    expect(STARTER_TOPICS.slice(0, 3).every((t) => t.pin)).toBe(true)
    expect(slots.map((s) => s.type)).toEqual(STARTER_TOPICS.map((t) => t.type))
    expect(slots[0].day).toBe(2) // miércoles
  })
  it('el plan sigue el tema de cada post y no inventa datos', () => {
    const { user } = buildPlanPrompt(m, slots, { ...ctx, starter: STARTER_TOPICS.map((t) => ({ theme: t.label, goal: t.brief, pin: t.pin })) })
    const u = JSON.parse(user)
    expect(u.week[0]).toMatchObject({ theme: 'Quiénes somos y nuestra misión', pinnedOnProfile: true })
    expect(u.week[3].pinnedOnProfile).toBeUndefined()
    expect(u.instructions).toMatch(/STARTER KIT/)
    expect(u.instructions).toMatch(/never invent figures/)
  })
})
