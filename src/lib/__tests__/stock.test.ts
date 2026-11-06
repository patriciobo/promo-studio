import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('../db', () => ({ db: {} }))
vi.mock('../settings', () => ({ getSecret: async (k: string) => (k === 'PEXELS_API_KEY' ? 'pk' : k === 'PIXABAY_API_KEY' ? 'xk' : null) }))

import { parseManifest } from '../manifest'
import { weekSlots } from '../schedule'
import { KIND_CHOICES, noAiImage, parsePostKind } from '../models'
import { buildPlanPrompt, realCut, videoPromptFor } from '../pipeline'
import { bestFile, COMMONS_OK, creditsOf, flickrLarge, geocode, parseCoords, searchCommons, searchCommonsNear, searchOpenverse, searchPexels, searchPixabay, searchStock, withCredits } from '../stock'

const m = (parseManifest(`
name: Sierras Vivas
url: https://sierras.example
tagline: Lugares naturales de Córdoba
audience: { countries: [AR] }
languages: [es]
location: Córdoba, Argentina
brand: { colors: ["#2f5d3a", "#f4efe6", "#1b1b1b"] }
features: [Guías de lugares]
`) as unknown as { manifest: never }).manifest

const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response

afterEach(() => vi.unstubAllGlobals())

describe('bancos de material real', () => {
  it('Pexels: elige el MP4 más grande que no pasa 1920 px', async () => {
    const fetch = vi.fn(async (url: string) => (void url,
      reply({
        videos: [
          {
            id: 1,
            width: 3840,
            height: 2160,
            url: 'https://www.pexels.com/video/waterfall-in-the-mountains-1/',
            image: 'https://images.pexels.com/v1.jpg',
            duration: 14,
            user: { name: 'Ana', url: 'x' },
            video_files: [
              { quality: 'uhd', file_type: 'video/mp4', width: 3840, height: 2160, link: 'https://videos.pexels.com/4k.mp4' },
              { quality: 'hd', file_type: 'video/mp4', width: 1920, height: 1080, link: 'https://videos.pexels.com/hd.mp4' },
              { quality: 'sd', file_type: 'video/mp4', width: 640, height: 360, link: 'https://videos.pexels.com/sd.mp4' },
            ],
          },
        ],
      })),
    )
    vi.stubGlobal('fetch', fetch)
    const [v] = await searchPexels('waterfall cordoba argentina', 'video')
    expect(v).toMatchObject({ source: 'pexels', url: 'https://videos.pexels.com/hd.mp4', duration: 14, author: 'Ana', title: 'waterfall in the mountains', credit: null })
    expect(String(fetch.mock.calls[0][0])).toContain('videos/search?query=waterfall%20cordoba%20argentina')
  })
  it('Pixabay: videos y fotos', async () => {
    vi.stubGlobal('fetch', async (u: string) =>
      reply(
        u.includes('/videos/')
          ? { hits: [{ id: 7, pageURL: 'https://pixabay.com/v/7', tags: 'river, sierras', duration: 20, user: 'leo', videos: { large: { url: 'https://cdn.pixabay.com/l.mp4', width: 1920, height: 1080, thumbnail: 't' }, medium: { url: 'https://cdn.pixabay.com/m.mp4', width: 1280, height: 720, thumbnail: 'https://cdn.pixabay.com/t.jpg' }, small: { url: '', width: 0, height: 0 }, tiny: { url: '', width: 0, height: 0 } } }] }
          : { hits: [{ id: 8, pageURL: 'https://pixabay.com/p/8', tags: 'dique', webformatURL: 'https://cdn.pixabay.com/w.jpg', largeImageURL: 'https://cdn.pixabay.com/l.jpg', imageWidth: 4000, imageHeight: 3000, user: 'mia' }] },
      ),
    )
    expect((await searchPixabay('river', 'video'))[0]).toMatchObject({ url: 'https://cdn.pixabay.com/l.mp4', preview: 'https://cdn.pixabay.com/t.jpg', duration: 20 })
    expect((await searchPixabay('dique', 'photo'))[0]).toMatchObject({ url: 'https://cdn.pixabay.com/l.jpg', author: 'mia', kind: 'photo' })
  })
  it('Commons: sólo licencias libres y con atribución cuando la piden', async () => {
    const page = (title: string, license: string, mime = 'image/jpeg', index = 1) => ({ title, index, imageinfo: [{ url: `https://upload.wikimedia.org/${title}`, thumburl: `https://upload.wikimedia.org/thumb/${title}`, descriptionurl: `https://commons.wikimedia.org/wiki/${title}`, mime, width: 4000, height: 3000, extmetadata: { LicenseShortName: { value: license }, Artist: { value: '<a href="x">Juan Pérez</a>' }, ImageDescription: { value: 'Cerro <b>Champaquí</b>' } } }] })
    vi.stubGlobal('fetch', async () => reply({ query: { pages: { a: page('File:A.jpg', 'CC BY-SA 4.0'), b: page('File:B.jpg', 'Copyrighted', 'image/jpeg', 2), c: page('File:C.jpg', 'CC0', 'image/jpeg', 3), d: page('File:D.svg', 'CC BY 4.0', 'image/svg+xml', 4) } } }))
    const r = await searchCommons('Champaqui', 'photo')
    expect(r.map((x) => x.id)).toEqual(['File:A.jpg', 'File:C.jpg'])
    expect(r[0]).toMatchObject({ title: 'Cerro Champaquí', author: 'Juan Pérez', url: 'https://upload.wikimedia.org/thumb/File:A.jpg', credit: 'Juan Pérez / Wikimedia Commons (CC BY-SA 4.0)' })
    expect(r[1].credit).toBeNull()
    expect(['CC BY 4.0', 'CC BY-SA 3.0', 'CC0', 'Public domain'].every((l) => COMMONS_OK.test(l))).toBe(true)
    expect(['CC BY-NC 4.0', 'Fair use', 'GFDL'].some((l) => COMMONS_OK.test(l))).toBe(false)
  })
  it('entrevera los bancos y un banco caído no frena la búsqueda', async () => {
    vi.stubGlobal('fetch', async (u: string) => {
      if (u.includes('pixabay')) throw new Error('caído')
      if (u.includes('pexels')) return reply({ photos: [1, 2].map((id) => ({ id, width: 1, height: 1, url: `https://www.pexels.com/photo/${id}`, photographer: 'p', src: { large2x: `https://images.pexels.com/${id}.jpg`, medium: 'm' } })) })
      return reply({ query: { pages: { a: { title: 'File:X.jpg', index: 1, imageinfo: [{ url: 'https://upload.wikimedia.org/x', descriptionurl: 'd', mime: 'image/jpeg', width: 1, height: 1, extmetadata: { LicenseShortName: { value: 'CC0' } } }] } } } })
    })
    const r = await searchStock('x', 'photo')
    expect(r.items.map((i) => i.source)).toEqual(['pexels', 'commons', 'pexels'])
    expect(r.errors[0]).toMatch(/Pixabay: caído/)
  })
  it('Openverse: sólo Flickr con licencia comercial, crédito cuando la piden y la versión grande de Flickr', async () => {
    const fetch = vi.fn(async (url: string) => (void url,
    reply({ results: [
      { id: 'a', title: 'Champaquí', url: 'https://live.staticflickr.com/8697/17039598170_ff03494732.jpg', thumbnail: 'https://api.openverse.org/v1/images/a/thumb/', creator: 'euge', license: 'by', license_version: '2.0', foreign_landing_url: 'https://www.flickr.com/photos/x/1', width: 500, height: 500 },
      { id: 'b', url: 'https://live.staticflickr.com/1/2_ab.jpg', license: 'cc0', foreign_landing_url: 'https://flickr.com/2' },
      { id: 'c', url: 'https://live.staticflickr.com/1/3_cd.jpg', license: 'by-nc', foreign_landing_url: 'https://flickr.com/3' },
    ] })))
    vi.stubGlobal('fetch', fetch)
    const r = await searchOpenverse('Champaquí', 'photo', 12, 2)
    expect(String(fetch.mock.calls[0][0])).toMatch(/license=by,by-sa,cc0,pdm&source=flickr.*page=2/)
    expect(r.map((x) => x.id)).toEqual(['a', 'b'])
    expect(r[0]).toMatchObject({ source: 'openverse', license: 'CC BY 2.0', credit: 'euge / Flickr (CC BY 2.0)' })
    expect(r[1].credit).toBeNull()
    expect(await searchOpenverse('x', 'video')).toEqual([])
    expect(flickrLarge('https://live.staticflickr.com/8697/17039598170_ff03494732.jpg')).toBe('https://live.staticflickr.com/8697/17039598170_ff03494732_b.jpg')
    expect(flickrLarge('https://live.staticflickr.com/1/2_ab_z.jpg')).toBe('https://live.staticflickr.com/1/2_ab_b.jpg')
    expect(flickrLarge('https://upload.wikimedia.org/a.jpg')).toBeNull()
  })
  it('cerca de un lugar: coordenadas de Wikipedia y fotos de Commons de la más cercana a la más lejana', async () => {
    expect(parseCoords('-31.72, -65.00')).toMatchObject({ lat: -31.72, lon: -65 })
    expect(parseCoords('Mina Clavero')).toBeNull()
    const info = (title: string, license = 'CC0') => ({ title, imageinfo: [{ url: `https://upload.wikimedia.org/${title}`, descriptionurl: 'd', mime: 'image/jpeg', width: 1, height: 1, extmetadata: { LicenseShortName: { value: license } } }] })
    const fetch = vi.fn(async (u: string) => {
      if (u.includes('wikipedia.org')) return reply({ query: { pages: { 1: { title: 'Condorito (desambiguación)', index: 1 }, 2: { title: 'Parque nacional Quebrada del Condorito', index: 2, coordinates: [{ lat: -31.66, lon: -64.66 }] } } } })
      if (u.includes('list=geosearch')) return reply({ query: { geosearch: [{ title: 'File:Cerca.jpg' }, { title: 'File:Privada.jpg' }, { title: 'File:Lejos.jpg' }] } })
      return reply({ query: { pages: { x: info('File:Lejos.jpg'), y: info('File:Privada.jpg', 'Copyrighted'), z: info('File:Cerca.jpg') } } })
    })
    vi.stubGlobal('fetch', fetch)
    const place = (await geocode('Quebrada del Condorito'))!
    expect(place).toMatchObject({ name: 'Parque nacional Quebrada del Condorito', lat: -31.66, from: 'Wikipedia' })
    const r = await searchCommonsNear(place, 'photo', 3)
    expect(r.map((x) => x.id)).toEqual(['File:Cerca.jpg', 'File:Lejos.jpg'])
    expect(fetch.mock.calls.some(([u]) => String(u).includes('gsradius=3000&gscoord=-31.66|-64.66'))).toBe(true)
  })
  it('bestFile cae al más chico si todos son enormes', () => {
    expect(bestFile([{ width: 3840, height: 2160 }, { width: 2560, height: 1440 }])?.width).toBe(2560)
  })
})

describe('créditos y recortes', () => {
  it('agrega los créditos al final sin duplicarlos al corregir', () => {
    const c = withCredits('Hola\n\n#sierras', creditsOf([{ credit: 'Juan / Wikimedia Commons (CC BY-SA 4.0)' }, { credit: null }, { credit: 'Juan / Wikimedia Commons (CC BY-SA 4.0)' }]))
    expect(c).toBe('Hola\n\n#sierras\n\n📷 Juan / Wikimedia Commons (CC BY-SA 4.0)')
    expect(withCredits(c, ['Otra'])).toBe('Hola\n\n#sierras\n\n📷 Otra')
    expect(withCredits(c, [])).toBe('Hola\n\n#sierras')
  })
  it('usa un tramo del video real', () => {
    expect(realCut(undefined, 4)).toEqual({})
    expect(realCut({ video: 'v.mp4', duration: 20 }, 4)).toEqual({ start: 4.5, seconds: 5 })
    expect(realCut({ video: 'v.mp4', duration: 3 }, 4)).toEqual({ start: 0, seconds: 3 })
  })
})

describe('tipo material real', () => {
  it('es un tipo elegible y sin imagen IA', () => {
    expect(KIND_CHOICES.some((k) => k.id === 'real')).toBe(true)
    expect(parsePostKind('real')).toBe('real')
    expect(noAiImage('real')).toBe(true)
  })
  it('el plan pide imágenes reales o una búsqueda, nunca una imagen generada', () => {
    const slots = weekSlots(new Date('2026-10-05T00:00:00Z'), { feed: 1, reels: 1, stories: 0 }, '10:00', 'UTC')
    const p = buildPlanPrompt(m, slots, { feed: [], texts: [], releases: [], recent: [], bestPillars: [], kind: 'real' })
    expect(p.system).toMatch(/imageType "real": only REAL photos and videos/)
    expect(p.system).toMatch(/stockQuery/)
    expect(p.system).toMatch(/prefer appImages with "video"/)
    expect(p.system).not.toMatch(/Show people/)
    expect(JSON.parse(p.user).week[0].visual).toEqual({ imageType: 'real' })
  })
  it('al animar una foto real no se toca el paisaje', () => {
    const v = videoPromptFor(m, 'Cerro Champaquí', { kind: 'real', style: '' })
    expect(v).toMatch(/Do not add, remove or change any element of the landscape/)
    expect(v).toMatch(/Cerro Champaquí/)
  })
})
