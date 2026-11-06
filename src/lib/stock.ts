// Material real para las piezas: videos y fotos de bancos libres (Pexels, Pixabay, Wikimedia Commons) que se importan a la
// biblioteca de la app con su autor y licencia. Lo usa la pestaña Imágenes (buscar e importar a mano) y el plan, cuando
// una diapositiva o escena de tipo "Material real" no tiene nada que le sirva en la biblioteca (busca, el modelo de
// visión elige el que de verdad muestra ese lugar, y se importa).
import type { App, AppImage } from '@prisma/client'
import { rm } from 'node:fs/promises'
import { db } from './db'
import { env } from './env'
import { enqueue, QUEUES } from './jobs'
import { extOf, mediaPath, saveMedia, sniffMime } from './media'
import { completeJson } from './openrouter'
import { getSecret } from './settings'
import { contactSheet, probeVideo, videoFrame } from '@/render/renderer'

export type StockSource = 'pexels' | 'pixabay' | 'commons' | 'openverse'
export type StockKind = 'video' | 'photo'

export interface StockItem {
  source: StockSource
  id: string
  kind: StockKind
  title: string
  /** Miniatura para mostrar y para que el modelo de visión elija. */
  preview: string
  /** Video liviano para mirarlo en el buscador antes de importarlo. */
  clip?: string
  /** Archivo a bajar (MP4 o JPEG), ya elegido en un tamaño razonable. */
  url: string
  width: number
  height: number
  duration?: number
  author: string
  pageUrl: string
  license: string
  /** Atribución obligatoria (sólo Commons con CC BY / BY-SA); null = no hace falta. */
  credit: string | null
}

export const SOURCE_LABEL: Record<StockSource | 'upload', string> = { pexels: 'Pexels', pixabay: 'Pixabay', commons: 'Wikimedia Commons', openverse: 'Flickr (Openverse)', upload: 'Subido' }

/** Wikimedia pide identificarse; sin datos personales. */
const UA = `PromoStudio/1.0 (${env.publicUrl})`
const MAX_DOWNLOAD = 250 * 1024 * 1024
const TIMEOUT = 20000

async function json<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(TIMEOUT) })
  if (!res.ok) throw new Error(`${new URL(url).host}: HTTP ${res.status}`)
  return (await res.json()) as T
}

/** El MP4 más liviano (para la vista previa). */
export function lightestFile<T extends { width: number; height: number; type?: string }>(files: T[]): T | undefined {
  const mp4 = files.filter((f) => (!f.type || f.type === 'video/mp4') && f.width > 0)
  return (mp4.length ? mp4 : files).sort((a, b) => a.width * a.height - b.width * b.height)[0]
}

/** Videos: el archivo MP4 más grande que no pase de 1920 px del lado largo (Instagram no usa más). */
export function bestFile<T extends { width: number; height: number; type?: string }>(files: T[]): T | undefined {
  const ok = files.filter((f) => (!f.type || f.type === 'video/mp4') && f.width > 0 && Math.max(f.width, f.height) <= 1920)
  return ok.sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? files.sort((a, b) => a.width * a.height - b.width * b.height)[0]
}

// ---------------------------------------------------------------------------
// Bancos
// ---------------------------------------------------------------------------

type PexelsVideo = { id: number; width: number; height: number; url: string; image: string; duration: number; user: { name: string; url: string }; video_files: { quality: string; file_type: string; width: number; height: number; link: string }[] }
type PexelsPhoto = { id: number; width: number; height: number; url: string; alt?: string; photographer: string; src: { large2x: string; medium: string } }

export async function searchPexels(q: string, kind: StockKind, n = 12, page = 1): Promise<StockItem[]> {
  const key = await getSecret('PEXELS_API_KEY')
  if (!key) return []
  const h = { Authorization: key }
  if (kind === 'video') {
    const r = await json<{ videos: PexelsVideo[] }>(`https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&per_page=${n}&page=${page}&size=medium`, h)
    return r.videos.flatMap((v) => {
      const f = bestFile(v.video_files.map((x) => ({ ...x, type: x.file_type })))
      if (!f) return []
      const title = v.url.split('/').filter(Boolean).pop()?.replace(/-\d+$/, '').replace(/-/g, ' ') ?? ''
      const clip = lightestFile(v.video_files.map((x) => ({ ...x, type: x.file_type })))?.link
      return [{ source: 'pexels' as const, id: String(v.id), kind, title, preview: v.image, clip, url: f.link, width: f.width, height: f.height, duration: v.duration, author: v.user.name, pageUrl: v.url, license: 'Licencia de Pexels', credit: null }]
    })
  }
  const r = await json<{ photos: PexelsPhoto[] }>(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${n}&page=${page}`, h)
  return r.photos.map((p) => ({ source: 'pexels' as const, id: String(p.id), kind, title: p.alt ?? '', preview: p.src.medium, url: p.src.large2x, width: p.width, height: p.height, author: p.photographer, pageUrl: p.url, license: 'Licencia de Pexels', credit: null }))
}

type PixabayVideo = { id: number; pageURL: string; tags: string; duration: number; user: string; videos: Record<'large' | 'medium' | 'small' | 'tiny', { url: string; width: number; height: number; thumbnail?: string }> }
type PixabayPhoto = { id: number; pageURL: string; tags: string; webformatURL: string; largeImageURL: string; imageWidth: number; imageHeight: number; user: string }

export async function searchPixabay(q: string, kind: StockKind, n = 12, page = 1): Promise<StockItem[]> {
  const key = await getSecret('PIXABAY_API_KEY')
  if (!key) return []
  const per = Math.max(3, Math.min(200, n))
  if (kind === 'video') {
    const r = await json<{ hits: PixabayVideo[] }>(`https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&per_page=${per}&page=${page}&safesearch=true`)
    return r.hits.flatMap((v) => {
      const sizes = Object.values(v.videos).filter((x) => x?.url)
      const f = bestFile(sizes)
      if (!f) return []
      const preview = v.videos.medium?.thumbnail || v.videos.small?.thumbnail || v.videos.tiny?.thumbnail || ''
      return [{ source: 'pixabay' as const, id: String(v.id), kind, title: v.tags, preview, clip: lightestFile(sizes)?.url, url: f.url, width: f.width, height: f.height, duration: v.duration, author: v.user, pageUrl: v.pageURL, license: 'Licencia de Pixabay', credit: null }]
    })
  }
  const r = await json<{ hits: PixabayPhoto[] }>(`https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&image_type=photo&per_page=${per}&page=${page}&safesearch=true`)
  return r.hits.map((p) => ({ source: 'pixabay' as const, id: String(p.id), kind, title: p.tags, preview: p.webformatURL, url: p.largeImageURL, width: p.imageWidth, height: p.imageHeight, author: p.user, pageUrl: p.pageURL, license: 'Licencia de Pixabay', credit: null }))
}

type CommonsInfo = { url: string; descriptionurl: string; mime: string; width: number; height: number; thumburl?: string; duration?: number; extmetadata?: Record<string, { value: string }> }
type CommonsPage = { title: string; index?: number; imageinfo?: CommonsInfo[] }

const stripHtml = (s = '') => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim()

/** Licencias de Commons que dejan usarlo en la cuenta de un negocio (con atribución si la piden). */
export const COMMONS_OK = /^(CC0|Public domain|PD|CC BY(-SA)? [\d.]+|CC BY(-SA)?$)/i

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php?action=query&format=json'
const COMMONS_INFO = 'prop=imageinfo&iiprop=url|mime|size|extmetadata&iiurlwidth=1600'

/** Páginas de archivos de Commons (en el orden dado) a resultados: sólo licencias libres y el tipo pedido. */
function commonsItems(pages: CommonsPage[], kind: StockKind, n: number): StockItem[] {
  const out: StockItem[] = []
  for (const p of pages) {
    const ii = p.imageinfo?.[0]
    const meta = ii?.extmetadata ?? {}
    const license = stripHtml(meta.LicenseShortName?.value)
    if (!ii || !COMMONS_OK.test(license)) continue
    if (kind === 'photo' && !/^image\/(jpeg|png|webp)$/.test(ii.mime)) continue
    if (kind === 'video' && !/^video\//.test(ii.mime)) continue
    const author = stripHtml(meta.Artist?.value) || 'Autor desconocido'
    const needsCredit = !/^(CC0|Public domain|PD)/i.test(license)
    const title = stripHtml(meta.ImageDescription?.value).slice(0, 200) || p.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '')
    out.push({
      source: 'commons',
      id: p.title,
      kind,
      title,
      preview: ii.thumburl ?? ii.url,
      clip: kind === 'video' ? ii.url : undefined,
      // Fotos: la versión de 1600 px (el original puede pesar decenas de MB). Videos: el original (WebM; ffmpeg lo lee).
      url: kind === 'photo' ? (ii.thumburl ?? ii.url) : ii.url,
      width: ii.width,
      height: ii.height,
      duration: ii.duration,
      author,
      pageUrl: ii.descriptionurl,
      license,
      credit: needsCredit ? `${author.slice(0, 80)} / Wikimedia Commons (${license})` : null,
    })
    if (out.length >= n) break
  }
  return out
}

export async function searchCommons(q: string, kind: StockKind, n = 12, page = 1): Promise<StockItem[]> {
  const filetype = kind === 'video' ? 'filetype:video' : 'filetype:bitmap'
  // Se piden de más: una parte se descarta por licencia.
  const limit = Math.min(50, n * 2)
  const url = `${COMMONS_API}&generator=search&gsrnamespace=6&gsrlimit=${limit}&gsroffset=${(page - 1) * limit}&gsrsearch=${encodeURIComponent(`${q} ${filetype}`)}&${COMMONS_INFO}`
  const r = await json<{ query?: { pages: Record<string, CommonsPage> } }>(url)
  return commonsItems(Object.values(r.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0)), kind, n)
}

// --- Por cercanía -------------------------------------------------------------

export interface Place {
  name: string
  lat: number
  lon: number
  /** De dónde salen las coordenadas (para mostrarlo). */
  from: string
}

const placeCache = new Map<string, Place | null>()

/** "-31.72, -65.00" escrito a mano. */
export function parseCoords(s: string): Place | null {
  const m = s.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:\.\d+)?)$/)
  if (!m) return null
  const lat = Number(m[1])
  const lon = Number(m[2])
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { name: `${lat}, ${lon}`, lat, lon, from: 'coordenadas' } : null
}

/**
 * Coordenadas de un lugar: el primer artículo de Wikipedia (en español, después en inglés) que las tenga. Para lugares
 * naturales anda mejor que un geocodificador de calles ("Quebrada del Condorito" también es una calle de Córdoba).
 */
export async function geocode(name: string): Promise<Place | null> {
  const typed = parseCoords(name)
  if (typed) return typed
  const key = name.trim().toLowerCase()
  if (placeCache.has(key)) return placeCache.get(key)!
  let found: Place | null = null
  for (const lang of ['es', 'en']) {
    const r = await json<{ query?: { pages: Record<string, { title: string; index: number; coordinates?: { lat: number; lon: number }[] }> } }>(
      `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrlimit=5&prop=coordinates&gsrsearch=${encodeURIComponent(name)}`,
    )
    const hit = Object.values(r.query?.pages ?? {})
      .sort((a, b) => a.index - b.index)
      .find((p) => p.coordinates?.length)
    if (hit) {
      found = { name: hit.title, lat: hit.coordinates![0].lat, lon: hit.coordinates![0].lon, from: `Wikipedia${lang === 'en' ? ' en inglés' : ''}` }
      break
    }
  }
  placeCache.set(key, found)
  return found
}

export const RADII_KM = [1, 3, 5, 10]

/** Fotos (o videos) de Commons tomados a menos de `km` del lugar, de la más cercana a la más lejana. */
export async function searchCommonsNear(place: Place, kind: StockKind, km = 5, n = 24, page = 1): Promise<StockItem[]> {
  const radius = Math.round(Math.min(10, Math.max(0.1, km)) * 1000)
  const r = await json<{ query?: { geosearch: { title: string }[] } }>(`${COMMONS_API}&list=geosearch&gsnamespace=6&gslimit=500&gsradius=${radius}&gscoord=${place.lat}|${place.lon}`)
  const titles = (r.query?.geosearch ?? []).map((g) => g.title)
  const out: StockItem[] = []
  // Se recorren de a 50 (lo que deja pedir Commons) desde el principio, porque parte se descarta por licencia o tipo y
  // no se sabe de antemano dónde empieza cada página.
  const want = page * n
  for (let at = 0; at < titles.length && out.length < want; at += 50) {
    const batch = titles.slice(at, at + 50)
    const info = await json<{ query?: { pages: Record<string, CommonsPage> } }>(`${COMMONS_API}&titles=${encodeURIComponent(batch.join('|'))}&${COMMONS_INFO}`)
    const byTitle = new Map(Object.values(info.query?.pages ?? {}).map((p) => [p.title, p]))
    out.push(...commonsItems(batch.flatMap((t) => byTitle.get(t) ?? []), kind, want - out.length))
  }
  return out.slice((page - 1) * n, want)
}

// --- Openverse (Flickr) -------------------------------------------------------

type OpenverseImage = { id: string; title?: string; url: string; thumbnail?: string; creator?: string; license: string; license_version?: string; foreign_landing_url: string; width?: number; height?: number }

const CC_NAME: Record<string, string> = { by: 'CC BY', 'by-sa': 'CC BY-SA', cc0: 'CC0', pdm: 'Dominio público' }

/** Flickr sirve el mismo archivo en varios tamaños con un sufijo: "_b" es 1024 px (el de Openverse suele ser de 500). */
export const flickrLarge = (url: string) => {
  const m = url.match(/^(https:\/\/live\.staticflickr\.com\/\d+\/\d+_[0-9a-f]+)(?:_[a-z])?\.jpg$/)
  return m ? `${m[1]}_b.jpg` : null
}

/**
 * Openverse (de WordPress): fotos con licencia libre de Flickr, buscables y sin clave. Sólo licencias que permiten uso
 * comercial y modificación (las piezas recortan y ponen texto encima). No tiene videos.
 */
export async function searchOpenverse(q: string, kind: StockKind, n = 12, page = 1): Promise<StockItem[]> {
  if (kind === 'video') return []
  const size = Math.min(20, n)
  const r = await json<{ results: OpenverseImage[] }>(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license=by,by-sa,cc0,pdm&source=flickr&mature=false&page_size=${size}&page=${page}`)
  return r.results.flatMap((p) => {
    if (!CC_NAME[p.license] || !p.url.startsWith('https://')) return []
    const license = `${CC_NAME[p.license]}${p.license_version && p.license !== 'pdm' ? ` ${p.license_version}` : ''}`
    const author = (p.creator || 'Autor desconocido').slice(0, 200)
    const needsCredit = p.license === 'by' || p.license === 'by-sa'
    return [{ source: 'openverse' as const, id: p.id, kind, title: (p.title ?? '').slice(0, 200), preview: p.thumbnail || p.url, url: p.url, width: p.width ?? 0, height: p.height ?? 0, author, pageUrl: p.foreign_landing_url, license, credit: needsCredit ? `${author.slice(0, 80)} / Flickr (${license})` : null }]
  })
}

// --- Todos juntos ------------------------------------------------------------

/** Qué bancos tienen clave cargada (Commons y Openverse no piden). */
export async function availableSources(): Promise<StockSource[]> {
  const [pexels, pixabay] = await Promise.all([getSecret('PEXELS_API_KEY'), getSecret('PIXABAY_API_KEY')])
  return [...(pexels ? ['pexels' as const] : []), ...(pixabay ? ['pixabay' as const] : []), 'commons', 'openverse']
}

const SEARCH: Record<StockSource, typeof searchPexels> = { pexels: searchPexels, pixabay: searchPixabay, commons: searchCommons, openverse: searchOpenverse }
/** Los bancos globales están en inglés; Commons y Flickr tienen mucho descripto en español (lo suben los de acá). */
const BILINGUAL: StockSource[] = ['commons', 'openverse']

export interface Queries {
  en: string
  es: string
}

const queryCache = new Map<string, Queries>()

/** La búsqueda en inglés y en español (con los nombres de lugares como se escriben acá). Si falla, la misma en los dos. */
export async function queryVariants(q: string, ai?: { appId: string; model: string }): Promise<Queries> {
  const key = q.trim().toLowerCase()
  if (!ai || process.env.OPENROUTER_MOCK === '1') return { en: q, es: q }
  if (queryCache.has(key)) return queryCache.get(key)!
  try {
    const r = await completeJson<Partial<Queries>>({
      appId: ai.appId,
      model: ai.model,
      system: 'You rewrite a stock photo search query. Return the same search in English and in Spanish, short (2 to 6 words), keeping proper place names as they are written locally in Spanish with accents (e.g. "Cerro Champaquí", "Quebrada del Condorito"), and the region or country only if the query had it. Answer only with JSON: {"en":string,"es":string}.',
      user: q,
      purpose: 'traducir búsqueda de material real',
      maxTokens: 400,
    })
    const v = { en: r.en?.trim().slice(0, 100) || q, es: r.es?.trim().slice(0, 100) || q }
    queryCache.set(key, v)
    return v
  } catch {
    return { en: q, es: q }
  }
}

/** Entrevera listas (así ninguna tapa a las otras) y saca repetidos. */
function interleave(lists: StockItem[][]) {
  const seen = new Set<string>()
  const items: StockItem[] = []
  for (let i = 0; i < Math.max(0, ...lists.map((l) => l.length)); i++)
    for (const l of lists) {
      const it = l[i]
      if (it && !seen.has(`${it.source}:${it.id}`)) {
        seen.add(`${it.source}:${it.id}`)
        items.push(it)
      }
    }
  return items
}

export interface StockSearch {
  items: StockItem[]
  errors: string[]
  /** Algún banco devolvió la página llena: puede haber más. */
  more: boolean
  queries?: Queries
}

/**
 * Busca en los bancos pedidos y entrevera los resultados. Un banco caído no frena la búsqueda. Con `ai`, la búsqueda se
 * hace en inglés y en español (Commons y Flickr en los dos).
 */
export async function searchStock(q: string, kind: StockKind, sources?: StockSource[], perSource = 12, opts: { page?: number; ai?: { appId: string; model: string } } = {}): Promise<StockSearch> {
  const use = sources?.length ? sources : await availableSources()
  const page = Math.max(1, opts.page ?? 1)
  const queries = await queryVariants(q, opts.ai)
  const jobs = use.flatMap((s) => {
    const qs = BILINGUAL.includes(s) && queries.es.toLowerCase() !== queries.en.toLowerCase() ? [queries.es, queries.en] : [opts.ai ? queries.en : q]
    // En dos idiomas, mitad y mitad: el total por banco no cambia.
    const n = qs.length > 1 ? Math.ceil(perSource / 2) : perSource
    return qs.map((x) => ({ s, n, run: () => SEARCH[s](x, kind, n, page) }))
  })
  const results = await Promise.allSettled(jobs.map((j) => j.run()))
  const errors = [...new Set(results.flatMap((r, i) => (r.status === 'rejected' ? [`${SOURCE_LABEL[jobs[i].s]}: ${(r.reason as Error).message}`] : [])))]
  const bySource = use.map((s) => results.flatMap((r, i) => (jobs[i].s === s && r.status === 'fulfilled' ? [r.value] : [])))
  const more = results.some((r, i) => r.status === 'fulfilled' && r.value.length >= jobs[i].n)
  return { items: interleave(bySource.map((ls) => interleave(ls))), errors, more, queries: opts.ai ? queries : undefined }
}

// ---------------------------------------------------------------------------
// Importar a la biblioteca
// ---------------------------------------------------------------------------

/** Sólo se baja de los servidores de archivos de los bancos (los datos del formulario de importar vienen del navegador). */
const ALLOWED_HOSTS = /(^|\.)(pexels\.com|pixabay\.com|wikimedia\.org|staticflickr\.com)$/

async function download(url: string): Promise<Buffer> {
  const u = new URL(url)
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.test(u.hostname)) throw new Error(`origen no permitido: ${u.hostname}`)
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120000) })
  if (!res.ok) throw new Error(`no se pudo bajar el archivo (HTTP ${res.status})`)
  const len = Number(res.headers.get('content-length') ?? 0)
  if (len > MAX_DOWNLOAD) throw new Error('el archivo pesa demasiado')
  const b = Buffer.from(await res.arrayBuffer())
  if (b.length > MAX_DOWNLOAD) throw new Error('el archivo pesa demasiado')
  return b
}

/** El archivo del banco; de Flickr, primero la versión de 1024 px (si no existe, la que vino). */
async function fetchBest(item: StockItem) {
  const large = item.source === 'openverse' ? flickrLarge(item.url) : null
  if (large) {
    const b = await download(large).catch(() => null)
    if (b && sniffMime(b) === 'image/jpeg') return b
  }
  return download(item.url)
}

/**
 * Guarda un video en la biblioteca: el MP4 (o WebM/MOV tal cual) y un cuadro de portada como `path`.
 * `id`: el de la fila de AppImage ya creada (para nombrar los archivos).
 */
export async function storeVideo(app: Pick<App, 'slug'>, id: string, data: Buffer, ext: string) {
  return processVideo(app, id, await saveMedia(`apps/${app.slug}/library/${id}${ext}`, data))
}

/** Video ya guardado en la carpeta de media: lo valida, mide y le saca la portada. */
export async function processVideo(app: Pick<App, 'slug'>, id: string, videoPath: string) {
  const info = await probeVideo(mediaPath(videoPath))
  if (!info.video) throw new Error('el archivo no tiene video')
  const poster = await videoFrame(mediaPath(videoPath), Math.min(1, (info.duration ?? 2) / 3))
  const path = await saveMedia(`apps/${app.slug}/library/${id}.jpg`, poster)
  return { videoPath, path, duration: info.duration }
}

/** Importa un archivo de un banco a la biblioteca (si ya estaba, devuelve el existente) y encola su descripción. */
export async function importStock(app: Pick<App, 'id' | 'slug'>, item: StockItem, note?: string | null): Promise<AppImage> {
  const prev = await db.appImage.findUnique({ where: { appId_source_sourceId: { appId: app.id, source: item.source, sourceId: item.id } } })
  if (prev) return prev.archived ? db.appImage.update({ where: { id: prev.id }, data: { archived: false } }) : prev
  const data = await fetchBest(item)
  const base = { appId: app.id, kind: 'PHOTO' as const, note: note || null, source: item.source, sourceId: item.id, sourceUrl: item.pageUrl, sourceInfo: item.title.slice(0, 300) || null, author: item.author.slice(0, 200), license: item.license, credit: item.credit, path: '' }
  const img = await db.appImage.create({ data: base })
  try {
    if (item.kind === 'video') {
      const ext = /\.webm(\?|$)/i.test(item.url) ? '.webm' : '.mp4'
      const v = await storeVideo(app, img.id, data, ext)
      return await finish(img.id, v)
    }
    const mime = sniffMime(data)
    if (!mime || !mime.startsWith('image/')) throw new Error('el archivo no es una imagen')
    const path = await saveMedia(`apps/${app.slug}/library/${img.id}${extOf(mime) || '.jpg'}`, data)
    return await finish(img.id, { path })
  } catch (e) {
    await db.appImage.delete({ where: { id: img.id } }).catch(() => {})
    throw e
  }
}

async function finish(id: string, data: { path: string; videoPath?: string; duration?: number | null }) {
  const img = await db.appImage.update({ where: { id }, data })
  await enqueue(QUEUES.describeImage, { imageId: id })
  return img
}

/** Imagen para que el modelo de visión vea un video entero: 4 cuadros en grilla. */
export async function videoSheet(videoPath: string, duration: number | null) {
  return contactSheet(mediaPath(videoPath), duration ?? 6)
}

// ---------------------------------------------------------------------------
// Buscar y elegir solo (para el plan)
// ---------------------------------------------------------------------------

/**
 * Busca `query` en los bancos y deja que el modelo de visión elija el que de verdad muestra eso (y en ese lugar: "Córdoba"
 * también es una ciudad de España). Importa el elegido. null si no hay ninguno que sirva.
 */
export async function findStock(app: Pick<App, 'id' | 'slug' | 'textModel'>, query: string, kind: StockKind, place: string | undefined, skip: Set<string>, near?: string | null): Promise<AppImage | null> {
  // Commons casi no tiene video de lugares (y lo que hay es ruido): para video, los otros bancos si están.
  const all = await availableSources()
  const sources = kind === 'video' && all.some((x) => x !== 'commons' && x !== 'openverse') ? all.filter((x) => x !== 'commons' && x !== 'openverse') : all
  // Con el lugar exacto, primero lo tomado ahí mismo (Commons guarda dónde se sacó cada foto).
  const spot = near?.trim() && kind === 'photo' ? await geocode(`${near.trim()}`).catch(() => null) : null
  const [nearby, { items }] = await Promise.all([spot ? searchCommonsNear(spot, kind, 3, 6).catch(() => []) : [], searchStock(query, kind, sources, 6, { ai: { appId: app.id, model: app.textModel } })])
  const candidates = interleave([nearby, items]).filter((i) => i.preview && !skip.has(`${i.source}:${i.id}`)).slice(0, 8)
  if (!candidates.length) return null
  const r = await completeJson<{ index?: number; reason?: string }>({
    appId: app.id,
    model: app.textModel,
    system: `You choose stock ${kind === 'video' ? 'videos (each image is its thumbnail)' : 'photos'} for an Instagram account${place ? ` about ${place}` : ''}. The attached images are candidates 0 to ${candidates.length - 1}, in order. Pick the one that best shows what is needed AND is plausibly in that place: reject other countries or cities with the same name (Córdoba, Spain is NOT Córdoba, Argentina), famous landmarks from elsewhere, images with text overlays or watermarks, visible brands or logos, and close-ups of identifiable faces. Use the titles as hints, but trust what you see. Answer only with JSON: {"index":number,"reason":string} with index -1 if none fits.`,
    user: JSON.stringify({ needed: query, ...(spot ? { takenNear: spot.name } : {}), candidates: candidates.map((c, i) => ({ index: i, title: c.title, source: SOURCE_LABEL[c.source] })) }),
    images: candidates.map((c) => c.preview),
    purpose: `elegir material real: ${query}`.slice(0, 120),
  })
  const pick = typeof r.index === 'number' ? candidates[r.index] : undefined
  if (!pick) return null
  skip.add(`${pick.source}:${pick.id}`)
  return importStock(app, pick, `Buscado como “${query}”`)
}

/** Créditos que hay que poner al final de la descripción, sin repetir. */
export const creditsOf = (imgs: Pick<AppImage, 'credit'>[]) => [...new Set(imgs.flatMap((i) => (i.credit ? [i.credit] : [])))]

const CREDIT_MARK = '📷 '

/** La descripción con los créditos al final (reemplaza los de antes, así corregir el post no los duplica). */
export function withCredits(caption: string, credits: string[]) {
  const body = caption
    .split('\n')
    .filter((l) => !l.startsWith(CREDIT_MARK))
    .join('\n')
    .replace(/\n+$/, '')
  if (!credits.length) return body
  return `${body}\n\n${credits.map((c) => `${CREDIT_MARK}${c}`).join('\n')}`.slice(0, 2200)
}

/**
 * Video subido desde el panel: `write` guarda el archivo (en streaming) en la ruta que se le pasa; después se procesa
 * como cualquier video de la biblioteca. Si algo falla no queda nada a medias.
 */
export async function addUploadedVideo(app: Pick<App, 'id' | 'slug'>, ext: string, note: string | null, write: (rel: string) => Promise<void>) {
  const img = await db.appImage.create({ data: { appId: app.id, kind: 'PHOTO', path: '', note: note || null, source: 'upload' } })
  const rel = `apps/${app.slug}/library/${img.id}${ext}`
  try {
    await write(rel)
    return await finish(img.id, await processVideo(app, img.id, rel))
  } catch (e) {
    await db.appImage.delete({ where: { id: img.id } }).catch(() => {})
    await rm(mediaPath(rel), { force: true }).catch(() => {})
    throw e
  }
}
