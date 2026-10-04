import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('../db', () => ({ db: {} }))

import { flowScreenPath, parseManifest } from '../manifest'
import { inOrder } from '../images'
import { fromLocalInput, localParts, toLocalInput, weekSlots, zonedTime } from '../schedule'
import { adCandidates, engagement, median, relativeScore } from '../score'
import { containerRequests, publish, type GraphClient } from '../instagram'
import { explain, MetaError } from '../meta-errors'
import { adRequests } from '../meta-ads'
import { buildPlanPrompt, compactReport, dailySourceUrl, keepKnownImages, mockPlan, needsRender, postFromPlan, slideLayout } from '../pipeline'
import { encodeImageChoice, IMAGE_KINDS, IMAGE_MODELS, imagePrice, imagesPerMonth, parseImageChoice, parseImageKind, SUGGESTED } from '../models'
import { aspectFor } from '../openrouter'
import { normalizeRepo } from '../github'
import { brandFrom } from '@/templates/brand'
import { postCost, usdSmall } from '../view'

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
    expect(explain(new MetaError(4, undefined, 'Application request limit reached', 'x')).retry).toBe(true)
    expect(explain(new MetaError(100, undefined, 'The instagram account is not authorized for this ad account', 'act/adcreatives')).fix).toMatch(/B.6/)
  })
})

describe('anuncios', () => {
  it('todo se crea en pausa, sólo en Instagram, con el post como creatividad', () => {
    const r = adRequests({ name: 'n', pageId: 'p', igUserId: 'ig', mediaId: 'm', link: 'https://x.app', countries: ['AR'], ageMin: 16, ageMax: 70, dailyBudgetCents: 300, start: new Date(), end: new Date(), objective: 'OUTCOME_TRAFFIC' })
    expect(r.campaign.status).toBe('PAUSED')
    expect(r.adset('c').status).toBe('PAUSED')
    expect(r.ad('a', 'c').status).toBe('PAUSED')
    expect(JSON.parse(r.adset('c').targeting)).toMatchObject({ age_min: 18, age_max: 65, publisher_platforms: ['instagram'] })
    expect(r.creative.source_instagram_media_id).toBe('m')
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
  it('el catálogo tiene 5 o 6 modelos, de los tres usos, con todos los datos', () => {
    expect(IMAGE_MODELS.length).toBeGreaterThanOrEqual(5)
    expect(IMAGE_MODELS.length).toBeLessThanOrEqual(6)
    expect(new Set(IMAGE_MODELS.map((m) => m.tier))).toEqual(new Set(['pruebas', 'costo-calidad', 'mejor-calidad']))
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
