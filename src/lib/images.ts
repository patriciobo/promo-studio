// Imágenes propias de cada app (capturas o fotos subidas desde el panel) para basar publicaciones en ellas.
// Al subirlas, el modelo de texto las describe una sola vez; después el planificador sólo lee esa descripción.
import type { App, AppImage, AppImageKind } from '@prisma/client'
import { existsSync } from 'node:fs'
import { db } from './db'
import { dataUri, mediaPath, saveMedia } from './media'
import { completeJson } from './openrouter'

const TYPES: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
/** Cuántas imágenes de la biblioteca ve el planificador (sólo su descripción) y cuántas se le muestran enteras. */
const LIBRARY_IN_PROMPT = 30
const FOCUS_SHOWN = 4

/** Archivos del formulario que son imágenes válidas (los vacíos o de otro tipo se ignoran). */
export const imageFiles = (files: FormDataEntryValue[]) => files.filter((f): f is File => f instanceof File && f.size > 0 && f.size <= MAX_IMAGE_BYTES && f.type in TYPES)

/** Guarda las imágenes en la biblioteca de la app. Devuelve las creadas (la descripción la escribe el worker). */
export async function addImages(app: Pick<App, 'id' | 'slug'>, files: File[], note?: string) {
  const out: AppImage[] = []
  for (const f of files) {
    const img = await db.appImage.create({ data: { appId: app.id, path: '', note: note || null } })
    const path = await saveMedia(`apps/${app.slug}/uploads/${img.id}${TYPES[f.type]}`, Buffer.from(await f.arrayBuffer()))
    out.push(await db.appImage.update({ where: { id: img.id }, data: { path } }))
  }
  return out
}

/** Una llamada barata con visión: qué tipo de imagen es y qué muestra. */
export async function describeImage(imageId: string) {
  const img = await db.appImage.findUniqueOrThrow({ where: { id: imageId }, include: { app: true } })
  if (img.description || !existsSync(mediaPath(img.path))) return img
  if (process.env.OPENROUTER_MOCK === '1') return db.appImage.update({ where: { id: imageId }, data: { description: img.note ?? 'Imagen subida' } })
  const r = await completeJson<{ kind?: string; description?: string }>({
    appId: img.appId,
    model: img.app.textModel,
    system: 'You describe images for a social media planner. Answer only with JSON: {"kind":"SCREENSHOT"|"PHOTO","description":string}. kind is SCREENSHOT for an app or web screen, PHOTO for anything else. description, in Spanish, max 300 characters: what the image shows, which feature or step of the app is visible and any readable key text. Do not guess what is not visible.',
    user: img.note ? `Nota del usuario: ${img.note}` : 'Describí la imagen.',
    images: [await dataUri(img.path)],
    maxTokens: 400,
    purpose: 'describir imagen',
  })
  const kind: AppImageKind = r.kind === 'PHOTO' ? 'PHOTO' : 'SCREENSHOT'
  return db.appImage.update({ where: { id: imageId }, data: { kind, description: (r.description ?? '').slice(0, 400) || null } })
}

export type PromptImage = { id: string; kind: AppImageKind; description: string | null; note: string | null; focus: boolean }

/**
 * Imágenes para planificar: las elegidas (`focusIds`, se le muestran al modelo) y las de la biblioteca (sólo texto).
 * Las que todavía no tienen descripción se describen ahora.
 */
export async function imagesForPlan(appId: string, focusIds: string[] = []) {
  const focus = focusIds.length ? await db.appImage.findMany({ where: { appId, id: { in: focusIds } } }) : []
  const library = await db.appImage.findMany({ where: { appId, archived: false, id: { notIn: focusIds } }, orderBy: { createdAt: 'desc' }, take: LIBRARY_IN_PROMPT })
  const all = [...focus, ...library].filter((i) => existsSync(mediaPath(i.path)))
  const described = await Promise.all(all.map((i) => (i.description ? i : describeImage(i.id).catch(() => i))))
  const prompt: PromptImage[] = described.map((i) => ({ id: i.id, kind: i.kind, description: i.description, note: i.note, focus: focusIds.includes(i.id) }))
  const shown = await Promise.all(described.filter((i) => focusIds.includes(i.id)).slice(0, FOCUS_SHOWN).map((i) => dataUri(i.path)))
  return { prompt, shown }
}

/** Imágenes de la app usadas por las diapositivas del post (id → tipo y data URI). Las borradas se omiten. */
export async function slideImages(appId: string, ids: string[]) {
  const imgs = ids.length ? await db.appImage.findMany({ where: { appId, id: { in: ids } } }) : []
  const out = new Map<string, { kind: AppImageKind; src: string }>()
  for (const i of imgs) if (existsSync(mediaPath(i.path))) out.set(i.id, { kind: i.kind, src: await dataUri(i.path) })
  return out
}
