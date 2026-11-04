// Catálogo curado de modelos de video de OpenRouter para los reels: cada escena es un clip generado (movimiento real),
// no una imagen fija con zoom. Precios de GET /api/v1/videos/models (pricing_skus) a 720p vertical.
// El gasto real se registra en cada llamada (usage.cost); estos sirven para estimar y para el tope del presupuesto.

export const VIDEO_PRICES_CHECKED = '2026-11-04'

export interface VideoModel {
  id: string
  name: string
  /** US$ por segundo a la resolución elegida (con audio si el modelo lo genera). Aproximado en los que cobran por tokens. */
  pricePerSec: number
  /** Duraciones por escena que acepta (segundos). */
  durations: number[]
  resolution: '720p' | '768p' | '1080p'
  /** Genera sonido propio (ambiente, efectos). Si no, el reel usa la música del promo.yaml o va en silencio. */
  audio: boolean
  /** Para qué conviene. */
  uses: string
  level: string
  /** Dónde ver ejemplos reales del modelo. */
  examples: string
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

export const VIDEO_MODELS: VideoModel[] = [
  {
    id: 'google/veo-3.1-lite',
    name: 'Veo 3.1 Lite (Google)',
    pricePerSec: 0.05,
    durations: [4, 6, 8],
    resolution: '720p',
    audio: true,
    uses: 'El equilibrio: movimiento y física creíbles, con sonido ambiente propio',
    level: 'Muy bueno; el mejor precio con audio',
    examples: 'https://deepmind.google/models/veo/',
  },
  {
    id: 'x-ai/grok-imagine-video-1.5-lite',
    name: 'Grok Imagine Video 1.5 Lite (xAI)',
    pricePerSec: 0.03,
    durations: range(1, 15),
    resolution: '720p',
    audio: true,
    uses: 'Memes y escenas rápidas, para probar formatos de tendencia sin gastar',
    level: 'Bueno; menos consistente en manos y caras',
    examples: 'https://grok.com/imagine',
  },
  {
    id: 'bytedance/seedance-2.0-fast',
    name: 'Seedance 2.0 Fast (ByteDance)',
    pricePerSec: 0.09,
    durations: range(4, 15),
    resolution: '720p',
    audio: true,
    uses: 'Estética nativa de TikTok/Reels; respeta muy bien el primer cuadro y las referencias',
    level: 'Muy bueno en gente y movimiento de cámara',
    examples: 'https://seed.bytedance.com/en/seedance2_0',
  },
  {
    id: 'minimax/hailuo-3-max',
    name: 'Hailuo 3 Max (MiniMax)',
    pricePerSec: 0.08,
    durations: range(5, 15),
    resolution: '768p',
    audio: false,
    uses: 'Acción y expresiones exageradas: sirve para el humor',
    level: 'Muy bueno en física y expresiones',
    examples: 'https://hailuoai.video/',
  },
  {
    id: 'kwaivgi/kling-v3.0-std',
    name: 'Kling 3.0 Standard (Kuaishou)',
    pricePerSec: 0.126,
    durations: range(3, 15),
    resolution: '720p',
    audio: true,
    uses: 'Gente realista y gestos naturales, con audio',
    level: 'Excelente',
    examples: 'https://app.klingai.com/global/community/material',
  },
  {
    id: 'google/veo-3.1-fast',
    name: 'Veo 3.1 Fast (Google)',
    pricePerSec: 0.1,
    durations: [4, 6, 8],
    resolution: '720p',
    audio: true,
    uses: 'Piezas finales cuidadas con sonido',
    level: 'Excelente',
    examples: 'https://deepmind.google/models/veo/',
  },
]

/** Sugerido: audio propio y el mejor precio por segundo de los que suenan bien. */
export const SUGGESTED_VIDEO_MODEL = 'google/veo-3.1-lite'

/** Comparar varios modelos con el mismo prompt, votado por gente: la mejor forma de elegir. */
export const VIDEO_ARENA_URL = 'https://artificialanalysis.ai/text-to-video/arena'

export const videoModel = (id: string | null | undefined) => VIDEO_MODELS.find((m) => m.id === id)

/** El modelo de video de la app, o el sugerido. Uno fuera del catálogo se usa igual con duraciones de 4 a 8 s. */
export function videoModelOf(id: string | null | undefined): VideoModel {
  if (!id) return videoModel(SUGGESTED_VIDEO_MODEL)!
  return videoModel(id) ?? { id, name: id, pricePerSec: 0.15, durations: [4, 5, 6, 8], resolution: '720p', audio: false, uses: '', level: '', examples: `https://openrouter.ai/${id}` }
}

/** Duración permitida más cercana a la deseada (ante empate, la más corta: cuesta menos). */
export function pickDuration(m: Pick<VideoModel, 'durations'>, target: number) {
  return [...m.durations].sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)[0]
}

/** Placa final de marca (con el llamado a la acción) que se suma al final de cada reel. */
export const END_CARD_SECONDS = 2.5
/** Duración objetivo del reel, sin la placa final: corto retiene mejor. */
export const REEL_TARGET_SECONDS = 12
export const MAX_REEL_SCENES = 4

/** Segundos por escena y costo estimado de un reel de `scenes` escenas. */
export function reelPlan(m: VideoModel, scenes: number) {
  const n = Math.max(1, Math.min(MAX_REEL_SCENES, scenes))
  const seconds = pickDuration(m, REEL_TARGET_SECONDS / n)
  return { seconds, total: seconds * n + END_CARD_SECONDS, costUsd: seconds * n * m.pricePerSec }
}
