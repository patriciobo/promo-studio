// Etiquetas y formatos para la interfaz.
import type { PostStatus, PostType } from '@prisma/client'

export const STATUS: Record<PostStatus, { label: string; tone: string }> = {
  DRAFT: { label: 'Borrador', tone: '' },
  PENDING_REVIEW: { label: 'Para revisar', tone: 'warn' },
  APPROVED: { label: 'Aprobado', tone: 'info' },
  PUBLISHING: { label: 'Publicando', tone: 'info' },
  PUBLISHED: { label: 'Publicado', tone: 'ok' },
  FAILED: { label: 'Falló', tone: 'bad' },
  REJECTED: { label: 'Rechazado', tone: '' },
}

export const TYPE: Record<PostType, string> = { IMAGE: 'Imagen', CAROUSEL: 'Carrusel', REEL: 'Reel', STORY: 'Story' }

export const fmtDate = (d: Date | null | undefined, tz = 'America/Argentina/Buenos_Aires') =>
  d ? new Intl.DateTimeFormat('es-AR', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d) : '—'

export const usd = (n: number) => `US$ ${n.toFixed(2)}`

/** Lo que costó generar el post: su parte del texto más todas sus ilustraciones (incluidas las regeneradas). */
export function postCost(post: { textCostUsd: number | null; assets: { kind: string; costUsd: number | null }[] }) {
  const images = post.assets.filter((a) => a.kind === 'BACKGROUND')
  const image = images.reduce((s, a) => s + (a.costUsd ?? 0), 0)
  const text = post.textCostUsd ?? 0
  return { total: text + image, text, image, images: images.length }
}

/** Montos chicos con más decimales (US$ 0,004). */
export const usdSmall = (n: number) => `US$ ${n.toFixed(n > 0 && n < 0.1 ? 3 : 2).replace('.', ',')}`
export const pct = (n: number) => `${(n * 100).toFixed(1)}%`

/** Fecha de hace `n` días (para filtros de consultas). */
export const daysAgo = (n: number) => new Date(Date.now() - n * 864e5)
