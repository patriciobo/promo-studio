// Fotos elegidas por el usuario: cómo se muestran en la pieza y el carrusel armado sólo con ellas.

export type PhotoMode = 'fondo' | 'marco' | 'mezcla'

export const PHOTO_MODES: { id: PhotoMode; label: string; hint: string }[] = [
  { id: 'fondo', label: 'De fondo', hint: 'La foto ocupa toda la pieza y el texto y los adornos del estilo van delante. Textos cortos para que se vea.' },
  { id: 'marco', label: 'Enmarcada', hint: 'La foto va dentro del diseño, en el recuadro propio del estilo, junto al texto. Entra más texto.' },
  { id: 'mezcla', label: 'Mezcla', hint: 'Alterna: la portada de fondo, la siguiente enmarcada, y así. Da ritmo a un carrusel.' },
]

export const parsePhotoMode = (v: unknown): PhotoMode | undefined => PHOTO_MODES.find((m) => m.id === v)?.id

/** Tratamiento de la diapositiva `i`: la foto a sangre (hero) o enmarcada en el estilo (frame). */
export const photoTreatment = (mode: PhotoMode, i: number): 'hero' | 'frame' => (mode === 'marco' || (mode === 'mezcla' && i % 2 === 1) ? 'frame' : 'hero')

/** Máximo de piezas de un carrusel que deja publicar la API de Instagram (la app deja 20, la API 10). */
export const MAX_CAROUSEL = 10

/**
 * Carrusel de fotos: una diapositiva por foto, en el orden elegido. Usa los textos que planificó el modelo
 * y fuerza la foto de cada una (si faltan diapositivas, repite el gancho; si sobran, se descartan).
 */
export function photoSetSlides<S extends { title: string; imageId?: string | null }>(slides: S[], ids: string[], fallback: string): S[] {
  return ids.slice(0, MAX_CAROUSEL).map((id, i) => ({ ...(slides[i] ?? ({ title: fallback } as S)), imageId: id }))
}
