// Íconos del sitio a partir del ícono de una alternativa: favicon.svg (vectorizado), PNG en cada tamaño y favicon.ico.
// Al guardar en el repo sólo se reemplazan los que el sitio ya usa, en la misma ruta, formato y tamaño.
import { renderHtml } from '@/render/renderer'
import { saveMedia } from '../media'

/** Tamaños estándar (favicon, Apple, Android/PWA); se suman los que use el sitio. */
export const ICON_SIZES = [16, 32, 48, 180, 192, 512]
/** Tamaños dentro del favicon.ico. */
export const ICO_SIZES = [16, 32, 48]

export type SiteIcon = { path: string; format: 'svg' | 'png' | 'ico'; size?: number }

const SKIP = /(^|\/)(node_modules|dist|build|\.next|\.promo|vendor|out)\//

/** Archivos de ícono que sirve el sitio (favicon, apple-touch-icon, íconos de PWA y de Next). */
export function isSiteIcon(path: string) {
  if (SKIP.test(path)) return false
  const name = path.split('/').pop()!.toLowerCase()
  return /^(favicon[\w.-]*\.(svg|ico|png)|apple-touch-icon[\w.-]*\.png|apple-icon\.png|icon(-\d+)?(x\d+)?\.(svg|png)|android-chrome-\d+x\d+\.png|mstile-\d+x\d+\.png)$/.test(name)
}

/** Ancho de un PNG o del ícono más grande de un .ico (sin dependencias). SVG: sin tamaño. */
export function iconSize(data: Buffer, format: SiteIcon['format']): number | undefined {
  if (format === 'png' && data.length >= 24 && data.readUInt32BE(12) === 0x49484452) return data.readUInt32BE(16)
  if (format === 'ico' && data.length >= 6 && data.readUInt16LE(2) === 1) {
    const n = data.readUInt16LE(4)
    let max = 0
    for (let i = 0; i < n && 6 + i * 16 < data.length; i++) max = Math.max(max, data[6 + i * 16] || 256)
    return max || undefined
  }
  return undefined
}

export const iconFormat = (path: string): SiteIcon['format'] => (path.endsWith('.svg') ? 'svg' : path.endsWith('.ico') ? 'ico' : 'png')

/** .ico con PNG adentro (lo aceptan todos los navegadores desde hace años). */
export function buildIco(pngs: { size: number; data: Buffer }[]) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  let offset = 6 + pngs.length * 16
  const entries = pngs.map(({ size, data }) => {
    const e = Buffer.alloc(16)
    e[0] = size >= 256 ? 0 : size
    e[1] = size >= 256 ? 0 : size
    e.writeUInt16LE(1, 4) // planos
    e.writeUInt16LE(32, 6) // bits por pixel
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += data.length
    return e
  })
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)])
}

const iconHtml = (src: string, size: number) =>
  `<!doctype html><html><head><style>*{margin:0;padding:0}html,body{width:${size}px;height:${size}px;overflow:hidden;background:transparent}img{width:${size}px;height:${size}px;object-fit:cover;display:block}</style></head><body><img src="${src}"></body></html>`

/**
 * PNG del ícono en cada tamaño y el favicon.ico. Devuelve { "16": ruta, …, "ico": ruta } (rutas de media).
 * `extra`: tamaños que ya usa el sitio, para reemplazarlos sin cambiar dimensiones.
 */
export async function renderIconSet(iconSrc: string, dir: string, extra: number[] = []) {
  const sizes = [...new Set([...ICON_SIZES, ...extra.filter((s) => s >= 16 && s <= 1024)])].sort((a, b) => a - b)
  const files: Record<string, string> = {}
  const pngs = new Map<number, Buffer>()
  for (const size of sizes) {
    const png = await renderHtml(iconHtml(iconSrc, size), size, size, 'png')
    pngs.set(size, png)
    files[String(size)] = await saveMedia(`${dir}/icon-${size}.png`, png)
  }
  files.ico = await saveMedia(`${dir}/favicon.ico`, buildIco(ICO_SIZES.map((size) => ({ size, data: pngs.get(size)! }))))
  return files
}
