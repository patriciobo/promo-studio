// Estilos de diseño de las piezas: cada uno cambia la plantilla (src/templates/styles.ts) y la estética de las imágenes IA.
// Elegidos entre los más usados en Instagram en 2026 (tendencias de Kittl, Picsart, DesignRush, G2 y guías de carruseles).
// Los ejemplos de Ajustes se generan desde el panel o con `npm run styles:samples` (src/lib/style-samples.ts).
import type { ImageKind, ImageQuality } from './models'

export type DesignStyleId = 'clasico' | 'poster' | 'editorial' | 'papel' | 'collage' | 'suave3d' | 'bento' | 'retro' | 'amano'

export interface DesignStyle {
  id: DesignStyleId
  label: string
  /** Cómo se ve. */
  hint: string
  /** Por qué se usa en redes. */
  trend: string
  /** Lo que busca hacer sentir a los seguidores. */
  feelings: string[]
  /** Estética de las imágenes IA (en inglés). Sin definir = la del promo.yaml (brand.imageStyle / photoStyle). */
  image?: Record<ImageKind, string>
  /** Tipo de imagen con el que se luce en los ejemplos (si no, ilustración). */
  sampleKind?: ImageKind
}

export const DESIGN_STYLES: DesignStyle[] = [
  {
    id: 'clasico',
    label: 'Clásico de marca',
    hint: 'Imagen a sangre con degradado, título grande y cierre en el color principal.',
    trend: 'El formato de siempre: seguro y prolijo. Usa el estilo de imagen del promo.yaml.',
    feelings: ['confianza', 'claridad', 'profesionalismo', 'coherencia'],
  },
  {
    id: 'poster',
    label: 'Tipografía XL',
    sampleKind: 'photo',
    hint: 'Fondo negro, letras condensadas enormes y el color de la marca como neón. Cada diapositiva es un póster.',
    trend: 'La tipografía protagonista es la tendencia más fuerte de 2026 (estilo Spotify Wrapped): frena el scroll.',
    feelings: ['impacto', 'energía', 'audacia', 'urgencia'],
    image: {
      illustration: 'bold graphic poster art, high contrast, strong simple silhouettes, dramatic shapes, minimal detail, large negative space, not a photo',
      photo: 'high-contrast black and white editorial photo, dramatic hard light, deep shadows, strong silhouette, film grain',
    },
  },
  {
    id: 'editorial',
    label: 'Revista',
    sampleKind: 'photo',
    hint: 'Papel crema, títulos en serif, foto enmarcada con epígrafe y número de edición.',
    trend: 'El look editorial transmite autoridad y es de los más guardados en carruseles educativos.',
    feelings: ['autoridad', 'sofisticación', 'credibilidad', 'curiosidad'],
    image: {
      illustration: 'risograph print illustration, grainy texture, limited muted palette, elegant editorial magazine art, considered composition, not a photo',
      photo: 'editorial magazine photography, medium format film look, soft window light, muted natural tones, fine grain, considered composition',
    },
  },
  {
    id: 'papel',
    label: 'Minimal blanco',
    hint: 'Fondo blanco, mucho aire, líneas finas y una imagen chica en tarjeta.',
    trend: 'El carrusel "white & paper" es el más popular entre creadores: limpio, fácil de leer y con CTA claro.',
    feelings: ['calma', 'claridad', 'orden', 'simplicidad'],
    image: {
      illustration: 'minimal line illustration, thin consistent strokes, flat pastel fills, mostly white background, airy and simple, few objects, not a photo',
      photo: 'bright minimal photography, white seamless background, soft diffused light, clean composition, lots of negative space',
    },
  },
  {
    id: 'collage',
    label: 'Collage',
    hint: 'Papel kraft, foto tipo polaroid con cinta, títulos en recortes y marcador.',
    trend: 'Mixed media y collage vuelven fuerte en 2026: se sienten hechos a mano frente a lo pulido de la IA.',
    feelings: ['creatividad', 'espontaneidad', 'diversión', 'cercanía'],
    image: {
      illustration: 'mixed media paper collage, cut-out shapes and torn paper, halftone dots, scissor-cut edges, layered textures, playful scrapbook art',
      photo: 'cut-out photo collage of real people and objects, torn paper edges, halftone print texture, layered scrapbook look',
    },
  },
  {
    id: 'suave3d',
    label: '3D suave',
    hint: 'Degradados pastel de la marca, tarjetas de vidrio esmerilado y formas redondeadas.',
    trend: 'El 3D tipo arcilla y el glassmorphism dominan en apps y tecnología: amigable y moderno.',
    feelings: ['amabilidad', 'optimismo', 'ternura', 'modernidad'],
    image: {
      illustration: 'soft 3D clay render, rounded inflated shapes, pastel colors, smooth matte materials, soft studio lighting, cute and friendly characters',
      photo: 'soft pastel studio photography, dreamy diffused light, glossy glass and plastic props, gentle color gradients',
    },
  },
  {
    id: 'bento',
    label: 'Bento oscuro',
    hint: 'Modo oscuro con grilla de tarjetas, brillo del color de la marca y etiquetas monoespaciadas.',
    trend: 'Las grillas bento (estilo Apple) son el formato favorito para mostrar funciones de producto.',
    feelings: ['innovación', 'precisión', 'potencia', 'exclusividad'],
    image: {
      illustration: 'sleek dark 3D render, glowing neon accents, glass and metal materials, futuristic product shot, dark background, rim light',
      photo: 'moody low-key photography at night, screen glow on faces, dark background, cinematic colored lighting',
    },
  },
  {
    id: 'retro',
    label: 'Retro',
    hint: 'Crema y rayos de sol, letras gruesas con sombra, imagen en arco y sticker de estrella.',
    trend: 'La nostalgia (70s y Y2K) sigue entre las estéticas que más interacción generan.',
    feelings: ['nostalgia', 'calidez', 'alegría', 'pertenencia'],
    image: {
      illustration: 'retro 1970s illustration, warm grainy print texture, rounded bold shapes, sunburst motifs, vintage poster palette, not a photo',
      photo: 'vintage 35mm film photo, warm faded colors, subtle light leaks, 1970s mood, soft grain',
    },
  },
  {
    id: 'amano',
    label: 'Hecho a mano',
    hint: 'Hoja cuadriculada, subrayados y flechas dibujadas, resaltador y letra manuscrita.',
    trend: 'Lo auténtico e imperfecto gana en 2026: parece nota de un creador, no un aviso.',
    feelings: ['autenticidad', 'cercanía', 'complicidad', 'honestidad'],
    image: {
      illustration: 'hand-drawn doodle illustration, ink pen and crayon lines, imperfect sketchy strokes, notebook sketch on white paper, playful',
      photo: 'candid smartphone photo, authentic and imperfect, natural light, real everyday moment, slightly grainy, unpolished',
    },
  },
]

export const DEFAULT_DESIGN_STYLE: DesignStyleId = 'clasico'

export const parseDesignStyle = (v: string | null | undefined): DesignStyleId | undefined => DESIGN_STYLES.find((s) => s.id === v)?.id

export const designStyle = (v: string | null | undefined) => DESIGN_STYLES.find((s) => s.id === v) ?? DESIGN_STYLES[0]

/** Modelo con el que se generan los ejemplos: cada calidad muestra cuánto cambia el resultado. */
export const SAMPLE_MODEL = 'openai/gpt-image-2.5-sunburst'
export const SAMPLE_QUALITIES: ImageQuality[] = ['low', 'medium', 'high']
export const sampleKey = (id: DesignStyleId, q: ImageQuality) => `${id}-${q}`

/** Estilo sugerido para el negocio, con el porqué (lo escribe el modelo de texto). */
export type StyleSuggestion = { id: DesignStyleId; reason: string }
