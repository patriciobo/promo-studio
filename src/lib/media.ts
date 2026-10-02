// Archivos generados (imágenes y videos), servidos públicamente en /media/... para que Instagram los descargue.
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

const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg' }
export const mimeOf = (p: string) => MIME[extname(p).toLowerCase()] ?? 'application/octet-stream'

export async function dataUri(rel: string) {
  return `data:${mimeOf(rel)};base64,${(await readFile(mediaPath(rel))).toString('base64')}`
}

export const bufferDataUri = (b: Buffer, mime: string) => `data:${mime};base64,${b.toString('base64')}`
