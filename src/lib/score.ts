// Potencial de un post: interacciones de calidad por persona alcanzada, comparado con la mediana de la app.

export interface Metrics {
  reach?: number | null
  likes?: number | null
  comments?: number | null
  saves?: number | null
  shares?: number | null
}

/** (guardados×3 + compartidos×3 + comentarios×2 + me gusta) / alcance. */
export function engagement(m: Metrics) {
  const reach = m.reach ?? 0
  if (reach <= 0) return 0
  return ((m.saves ?? 0) * 3 + (m.shares ?? 0) * 3 + (m.comments ?? 0) * 2 + (m.likes ?? 0)) / reach
}

export function median(xs: number[]) {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Puntaje relativo: 1 = como la mediana de la app, 2 = el doble. */
export const relativeScore = (value: number, appMedian: number) => (appMedian > 0 ? value / appMedian : value > 0 ? 1 : 0)

/** El 10% superior (mínimo 1 post, y sólo si supera la mediana) es candidato a anuncio. */
export function adCandidates<T extends { score: number | null }>(posts: T[]) {
  const scored = posts.filter((p) => (p.score ?? 0) > 1).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  return scored.slice(0, Math.max(1, Math.ceil(posts.length * 0.1)))
}
