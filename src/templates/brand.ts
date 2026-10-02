// Variables de marca para las plantillas, derivadas del manifiesto.
import type { Manifest } from '@/lib/manifest'

export interface Brand {
  name: string
  primary: string
  bg: string
  ink: string
  accent: string
  font: string
  /** data: URI del logo, si existe. */
  logo?: string
  url: string
}

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Elige fondo claro y tinta oscura entre los colores de la marca; el primero es el principal. */
export function brandFrom(m: Manifest, logo?: string): Brand {
  const [primary, ...rest] = m.brand.colors
  const sorted = [...rest].sort((a, b) => lum(b) - lum(a))
  const bg = sorted.find((c) => lum(c) > 0.7) ?? '#f6f6f3'
  const ink = [...sorted].reverse().find((c) => lum(c) < 0.15) ?? '#17191b'
  const accent = rest.find((c) => c !== bg && c !== ink) ?? primary
  return { name: m.name, primary, bg, ink, accent, font: m.brand.font, logo, url: m.url.replace(/^https?:\/\//, '').replace(/\/$/, '') }
}

/** Texto blanco o negro según el fondo. */
export const onColor = (hex: string) => (lum(hex) > 0.45 ? '#111111' : '#ffffff')
