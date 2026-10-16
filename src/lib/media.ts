// Archivos generados (imágenes y videos), servidos públicamente en /media/... para que Instagram los descargue.
import { closeSync, openSync, readSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join, normalize } from 'node:path'
import { env } from './env'

export const mediaPath = (rel: string) => {
  const p = normalize(join(env.mediaDir, rel))
  if (!p.startsWith(env.mediaDir)) throw new Error('Ruta de media inválida')
  return p
}

/** Ruta relativa para mostrar en la web: funciona en cualquier host o puerto. */
export const mediaSrc = (rel: string) => `/media/${rel.split('/').map(encodeURIComponent).join('/')}`

/** URL absoluta (PUBLIC_URL) para que Instagram descargue la media. */
export const mediaUrl = (rel: string) => `${env.publicUrl}${mediaSrc(rel)}`

export async function saveMedia(rel: string, data: Buffer | Uint8Array) {
  const p = mediaPath(rel)
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, data)
  return rel
}

const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg' }
export const mimeOf = (p: string) => MIME[extname(p).toLowerCase()] ?? 'application/octet-stream'

/** Tipo real de una imagen por sus primeros bytes (un modelo puede devolver PNG o WebP aunque el archivo diga .jpg). */
export function sniffMime(b: Buffer): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'image/x-icon'
  if (/^(\uFEFF)?\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/.test(b.subarray(0, 1024).toString('utf8'))) return 'image/svg+xml'
  return null
}

/** Extensión para un tipo de imagen ('.jpg', '.png'…). */
export const extOf = (mime: string) => Object.entries(MIME).find(([, m]) => m === mime)?.[0] ?? ''

/** Extensión según el contenido del archivo (la del nombre si no se reconoce). */
export function realExt(rel: string) {
  try {
    const fd = openSync(mediaPath(rel), 'r')
    const b = Buffer.alloc(1024)
    const n = readSync(fd, b, 0, 1024, 0)
    closeSync(fd)
    const mime = sniffMime(b.subarray(0, n))
    return (mime && extOf(mime)) || extname(rel)
  } catch {
    return extname(rel)
  }
}

/** Nombre de descarga: sin caracteres raros y con la extensión del contenido real. */
export function downloadName(name: string, mime: string) {
  const base = name.replace(/\.[a-z0-9]{2,4}$/i, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'archivo'
  return `${base}${extOf(mime) || extname(name)}`
}

export async function dataUri(rel: string) {
  return `data:${mimeOf(rel)};base64,${(await readFile(mediaPath(rel))).toString('base64')}`
}

export const bufferDataUri = (b: Buffer, mime: string) => `data:${mime};base64,${b.toString('base64')}`
