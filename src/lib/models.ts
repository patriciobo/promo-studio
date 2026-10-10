// Catálogo curado de modelos de OpenRouter para el selector de Ajustes.
// Elegidos por reviews de sep–oct 2026 (teamday, frankx, comparativas de OpenRouter) y precios de la API de OpenRouter.
// Los precios son aproximados por imagen de ~1K; el gasto real se registra en cada llamada (Configuración).
import type { Cadence } from './schedule'

export const PRICES_CHECKED = '2026-10-02'

export type Tier = 'pruebas' | 'mejor-calidad'
/** Sin calidad alta: cuesta el triple que la media y en las piezas (con texto encima) casi no se nota. */
export type ImageQuality = 'low' | 'medium'
export type ImageKind = 'illustration' | 'photo'
/** Qué tan bien le sale cada tipo de imagen a un modelo. */
export type Fit = 'ideal' | 'bien' | 'flojo'

export const IMAGE_KINDS: { id: ImageKind; label: string; hint: string }[] = [
  { id: 'illustration', label: 'Ilustración', hint: 'Vector o dibujo con los colores de la marca.' },
  { id: 'photo', label: 'Foto realista', hint: 'Personas y escenas creíbles, como fotos de stock propias. Mismo precio que una ilustración.' },
]

/** Modelo sugerido para cada tipo de imagen. */
export const SUGGESTED: Record<ImageKind, string> = {
  illustration: 'openai/gpt-image-2.5-sunburst',
  photo: 'google/gemini-3.1-flash-image',
}

export const TIERS: { id: Tier; label: string; hint: string }[] = [
  { id: 'pruebas', label: 'Pruebas rápidas', hint: 'Centavos por imagen: para probar el circuito o regenerar mucho.' },
  { id: 'mejor-calidad', label: 'Mejor calidad', hint: 'Las mejores piezas; entran en ~US$ 20/mes para 3 apps.' },
]

export interface ImageModel {
  id: string
  name: string
  tier: Tier
  /** Nivel de resultado esperado. */
  level: string
  /** Para qué conviene. */
  uses: string
  /** Popularidad y lo que dicen las reviews. */
  popularity: string
  /** US$ por imagen (con la calidad por defecto, si tiene). */
  priceUsd: number
  /** Precio por calidad, para los modelos que cobran por tokens según la calidad. */
  qualities?: Record<ImageQuality, number>
  defaultQuality?: ImageQuality
  /** Aspecto para el feed: algunos modelos no aceptan 4:5 (las plantillas recortan con object-fit: cover). */
  feedAspect: '4:5' | '3:4'
  /** Acepta imágenes de referencia (para mantener el mismo estilo en todo el post). */
  references: boolean
  /** Por dónde se pide: endpoint de imágenes o chat con salida de imagen. */
  api: 'images' | 'chat'
  /** Para qué tipo de imagen conviene. */
  fit: Record<ImageKind, Fit>
}

export const IMAGE_MODELS: ImageModel[] = [
  {
    id: 'recraft/recraft-v4.1-flash',
    name: 'Recraft V4.1 Flash',
    tier: 'pruebas',
    level: 'Bueno: ilustración limpia, menos detalle',
    uses: 'Probar el circuito, borradores, regenerar sin pensar en el costo',
    popularity: 'Recraft es la referencia en diseño, vectores y marca',
    priceUsd: 0.007,
    feedAspect: '3:4',
    references: false,
    api: 'images',
    fit: { illustration: 'ideal', photo: 'flojo' },
  },
  {
    id: 'google/gemini-3.1-flash-image',
    name: 'Nano Banana 2 (Gemini 3.1 Flash Image)',
    tier: 'mejor-calidad',
    level: 'Excelente, muy consistente entre piezas con referencias',
    uses: 'Carruseles y reels con el mismo estilo en cada escena',
    popularity: 'El "best value" de los modelos de punta; de los más usados',
    priceUsd: 0.067,
    feedAspect: '4:5',
    references: true,
    api: 'chat',
    fit: { illustration: 'ideal', photo: 'ideal' },
  },
  {
    id: 'openai/gpt-image-2.5-sunburst',
    name: 'GPT Image 2.5 Sunburst',
    tier: 'mejor-calidad',
    level: 'Excelente: mejor jerarquía visual, consistencia y detalle; más lento',
    uses: 'Piezas finales cuidadas',
    popularity: '#1 en LMArena y en las reviews de 2026',
    priceUsd: 0.05,
    qualities: { low: 0.006, medium: 0.05 },
    defaultQuality: 'medium',
    feedAspect: '3:4',
    references: true,
    api: 'images',
    fit: { illustration: 'ideal', photo: 'ideal' },
  },
]

export interface TextModel {
  id: string
  name: string
  note: string
  recommended?: boolean
}

export const TEXT_MODELS: TextModel[] = [
  { id: 'anthropic/claude-haiku-5.5', name: 'Claude Haiku 5.5', note: 'Redacción natural en español y JSON confiable; US$ 0,10/0,50 por millón', recommended: true },
  { id: 'openai/gpt-6-luna', name: 'GPT-6 Luna', note: 'Mismo precio, alternativa de OpenAI' },
  { id: 'qwen/qwen3.8-flash', name: 'Qwen3.8 Flash', note: 'Un poco más barato; flojo en tono rioplatense' },
  { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash', note: 'Más caro (US$ 0,75/3,75): para comparar' },
]

export const imageModel = (id: string | null | undefined) => IMAGE_MODELS.find((m) => m.id === id)

/** Precio por imagen con la calidad elegida (o la por defecto del modelo). */
export function imagePrice(m: ImageModel, quality?: string | null) {
  const q = (quality ?? m.defaultQuality) as ImageQuality | undefined
  return (q && m.qualities?.[q]) ?? (m.defaultQuality && m.qualities?.[m.defaultQuality]) ?? m.priceUsd
}

/** Diapositivas o escenas típicas: una ilustración por cada una. */
export const ILLUSTRATIONS_PER_POST = { CAROUSEL: 5, IMAGE: 1, REEL: 4, STORY: 1 } as const

/** Ilustraciones por mes según la cadencia (mismo reparto que weekSlots) y la edición diaria, si la hay. */
export function imagesPerMonth(c: Cadence, daily?: { types: ('CAROUSEL' | 'IMAGE' | 'STORY')[] }) {
  const perDay = daily ? daily.types.reduce((n, t) => n + ILLUSTRATIONS_PER_POST[t], 0) : 0
  const reels = Math.min(c.reels, c.feed)
  const rest = c.feed - reels
  const carousels = Math.ceil(rest / 2)
  const week = carousels * ILLUSTRATIONS_PER_POST.CAROUSEL + (rest - carousels) * ILLUSTRATIONS_PER_POST.IMAGE + reels * ILLUSTRATIONS_PER_POST.REEL + c.stories * ILLUSTRATIONS_PER_POST.STORY
  return Math.round(week * 4.33 + perDay * 30)
}

export const parseImageKind = (v: string | null | undefined): ImageKind | undefined => (v === 'illustration' || v === 'photo' ? v : undefined)

/** Modelo de imagen elegido para una generación puntual. `model: null` = sin imagen IA. `kind`: si no viene, el de Ajustes. */
export interface ImageChoice {
  model: string | null
  quality: string | null
  kind?: ImageKind
}

/** Valor del selector junto a cada botón: "proveedor/modelo|calidad" o "none". Vacío = el predeterminado de la app. */
export const encodeImageChoice = (c: ImageChoice) => (c.model ? `${c.model}|${c.quality ?? ''}` : 'none')

export function parseImageChoice(v: string | null | undefined, kind?: string | null): ImageChoice | undefined {
  if (!v) return undefined
  const k = parseImageKind(kind)
  if (v === 'none') return { model: null, quality: null }
  const [model, quality] = v.split('|')
  return { model, quality: quality || null, ...(k ? { kind: k } : {}) }
}
