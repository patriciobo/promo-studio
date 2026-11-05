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

export type StockSource = 'pexels' | 'pixabay' | 'commons'
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

export const SOURCE_LABEL: Record<StockSource | 'upload', string> = { pexels: 'Pexels', pixabay: 'Pixabay', commons: 'Wikimedia Commons', upload: 'Subido' }

/** Wikimedia pide identificarse; sin datos personales. */
const UA = `PromoStudio/1.0 (${env.publicUrl})`
const MAX_DOWNLOAD = 250 * 1024 * 1024
const TIMEOUT = 20000

async function json<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(TIMEOUT) })
  if (!res.ok) throw new Error(`${new URL(url).host}: HTTP ${res.status}`)
  return (await res.json()) as T
}

/** Videos: el archivo MP4 más grande que no pase de 1920 px del lado largo (Instagram no usa más). */
/** El MP4 más liviano (para la vista previa). */
export function lightestFile<T extends { width: number; height: number; type?: string }>(files: T[]): T | undefined {
  const mp4 = files.filter((f) => (!f.type || f.type === 'video/mp4') && f.width > 0)
  return (mp4.length ? mp4 : files).sort((a, b) => a.width * a.height - b.width * b.height)[0]
}

export function bestFile<T extends { width: number; height: number; type?: string }>(files: T[]): T | undefined {
  const ok = files.filter((f) => (!f.type || f.type === 'video/mp4') && f.width > 0 && Math.max(f.width, f.height) <= 1920)
  return ok.sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? files.sort((a, b) => a.width * a.height - b.width * b.height)[0]
}

// ---------------------------------------------------------------------------
// Bancos
// ---------------------------------------------------------------------------

type PexelsVideo = { id: number; width: number; height: number; url: string; image: string; duration: number; user: { name: string; url: string }; video_files: { quality: string; file_type: string; width: number; height: number; link: string }[] }
type PexelsPhoto = { id: number; width: number; height: number; url: string; alt?: string; photographer: string; src: { large2x: string; medium: string } }

export async function searchPexels(q: string, kind: StockKind, n = 12): Promise<StockItem[]> {
  const key = await getSecret('PEXELS_API_KEY')
  if (!key) return []
  const h = { Authorization: key }
  if (kind === 'video') {
    const r = await json<{ videos: PexelsVideo[] }>(`https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&per_page=${n}&size=medium`, h)
    return r.videos.flatMap((v) => {
      const f = bestFile(v.video_files.map((x) => ({ ...x, type: x.file_type })))
      if (!f) return []
      const title = v.url.split('/').filter(Boolean).pop()?.replace(/-\d+$/, '').replace(/-/g, ' ') ?? ''
      const clip = lightestFile(v.video_files.map((x) => ({ ...x, type: x.file_type })))?.link
      return [{ source: 'pexels' as const, id: String(v.id), kind, title, preview: v.image, clip, url: f.link, width: f.width, height: f.height, duration: v.duration, author: v.user.name, pageUrl: v.url, license: 'Licencia de Pexels', credit: null }]
    })
  }
  const r = await json<{ photos: PexelsPhoto[] }>(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${n}`, h)
  return r.photos.map((p) => ({ source: 'pexels' as const, id: String(p.id), kind, title: p.alt ?? '', preview: p.src.medium, url: p.src.large2x, width: p.width, height: p.height, author: p.photographer, pageUrl: p.url, license: 'Licencia de Pexels', credit: null }))
}

type PixabayVideo = { id: number; pageURL: string; tags: string; duration: number; user: string; videos: Record<'large' | 'medium' | 'small' | 'tiny', { url: string; width: number; height: number; thumbnail?: string }> }
type PixabayPhoto = { id: number; pageURL: string; tags: string; webformatURL: string; largeImageURL: string; imageWidth: number; imageHeight: number; user: string }

export async function searchPixabay(q: string, kind: StockKind, n = 12): Promise<StockItem[]> {
  const key = await getSecret('PIXABAY_API_KEY')
  if (!key) return []
  const per = Math.max(3, Math.min(200, n))
  if (kind === 'video') {
    const r = await json<{ hits: PixabayVideo[] }>(`https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&per_page=${per}&safesearch=true`)
    return r.hits.flatMap((v) => {
      const sizes = Object.values(v.videos).filter((x) => x?.url)
      const f = bestFile(sizes)
      if (!f) return []
      const preview = v.videos.medium?.thumbnail || v.videos.small?.thumbnail || v.videos.tiny?.thumbnail || ''
      return [{ source: 'pixabay' as const, id: String(v.id), kind, title: v.tags, preview, clip: lightestFile(sizes)?.url, url: f.url, width: f.width, height: f.height, duration: v.duration, author: v.user, pageUrl: v.pageURL, license: 'Licencia de Pixabay', credit: null }]
    })
  }
  const r = await json<{ hits: PixabayPhoto[] }>(`https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&image_type=photo&per_page=${per}&safesearch=true`)
  return r.hits.map((p) => ({ source: 'pixabay' as const, id: String(p.id), kind, title: p.tags, preview: p.webformatURL, url: p.largeImageURL, width: p.imageWidth, height: p.imageHeight, author: p.user, pageUrl: p.pageURL, license: 'Licencia de Pixabay', credit: null }))
}

type CommonsPage = { title: string; imageinfo?: { url: string; descriptionurl: string; mime: string; width: number; height: number; thumburl?: string; duration?: number; extmetadata?: Record<string, { value: string }> }[] }

const stripHtml = (s = '') => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim()

/** Licencias de Commons que dejan usarlo en la cuenta de un negocio (con atribución si la piden). */
export const COMMONS_OK = /^(CC0|Public domain|PD|CC BY(-SA)? [\d.]+|CC BY(-SA)?$)/i

export async function searchCommons(q: string, kind: StockKind, n = 12): Promise<StockItem[]> {
  const filetype = kind === 'video' ? 'filetype:video' : 'filetype:bitmap'
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=${Math.min(30, n * 2)}&gsrsearch=${encodeURIComponent(`${q} ${filetype}`)}&prop=imageinfo&iiprop=url|mime|size|extmetadata&iiurlwidth=1600`
  const r = await json<{ query?: { pages: Record<string, CommonsPage & { index?: number }> } }>(url)
  const pages = Object.values(r.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
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

/** Qué bancos tienen clave cargada (Commons no pide). */
export async function availableSources(): Promise<StockSource[]> {
  const [pexels, pixabay] = await Promise.all([getSecret('PEXELS_API_KEY'), getSecret('PIXABAY_API_KEY')])
  return [...(pexels ? ['pexels' as const] : []), ...(pixabay ? ['pixabay' as const] : []), 'commons']
}

const SEARCH: Record<StockSource, typeof searchPexels> = { pexels: searchPexels, pixabay: searchPixabay, commons: searchCommons }

/** Busca en los bancos pedidos y entrevera los resultados (así ninguno tapa a los otros). Un banco caído no frena la búsqueda. */
export async function searchStock(q: string, kind: StockKind, sources?: StockSource[], perSource = 12): Promise<{ items: StockItem[]; errors: string[] }> {
  const use = sources?.length ? sources : await availableSources()
  const results = await Promise.allSettled(use.map((s) => SEARCH[s](q, kind, perSource)))
  const lists = results.map((r) => (r.status === 'fulfilled' ? r.value : []))
  const errors = results.flatMap((r, i) => (r.status === 'rejected' ? [`${SOURCE_LABEL[use[i]]}: ${(r.reason as Error).message}`] : []))
  const items: StockItem[] = []
  for (let i = 0; i < Math.max(0, ...lists.map((l) => l.length)); i++) for (const l of lists) if (l[i]) items.push(l[i])
  return { items, errors }
}

// ---------------------------------------------------------------------------
// Importar a la biblioteca
// ---------------------------------------------------------------------------

/** Sólo se baja de los servidores de archivos de los bancos (los datos del formulario de importar vienen del navegador). */
const ALLOWED_HOSTS = /(^|\.)(pexels\.com|pixabay\.com|wikimedia\.org)$/

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
  const data = await download(item.url)
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
export async function findStock(app: Pick<App, 'id' | 'slug' | 'textModel'>, query: string, kind: StockKind, place: string | undefined, skip: Set<string>): Promise<AppImage | null> {
  // Commons casi no tiene video de lugares (y lo que hay es ruido): para video, los otros bancos si están.
  const all = await availableSources()
  const sources = kind === 'video' && all.some((x) => x !== 'commons') ? all.filter((x) => x !== 'commons') : all
  const { items } = await searchStock(query, kind, sources, 6)
  const candidates = items.filter((i) => i.preview && !skip.has(`${i.source}:${i.id}`)).slice(0, 8)
  if (!candidates.length) return null
  const r = await completeJson<{ index?: number; reason?: string }>({
    appId: app.id,
    model: app.textModel,
    system: `You choose stock ${kind === 'video' ? 'videos (each image is its thumbnail)' : 'photos'} for an Instagram account${place ? ` about ${place}` : ''}. The attached images are candidates 0 to ${candidates.length - 1}, in order. Pick the one that best shows what is needed AND is plausibly in that place: reject other countries or cities with the same name (Córdoba, Spain is NOT Córdoba, Argentina), famous landmarks from elsewhere, images with text overlays or watermarks, visible brands or logos, and close-ups of identifiable faces. Use the titles as hints, but trust what you see. Answer only with JSON: {"index":number,"reason":string} with index -1 if none fits.`,
    user: JSON.stringify({ needed: query, candidates: candidates.map((c, i) => ({ index: i, title: c.title, source: SOURCE_LABEL[c.source] })) }),
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
