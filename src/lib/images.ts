// Imágenes propias de cada app (capturas o fotos subidas desde el panel) para basar publicaciones en ellas.
// Al subirlas, el modelo de texto las describe una sola vez; después el planificador sólo lee esa descripción.
import type { App, AppImage, AppImageKind } from '@prisma/client'
import { existsSync } from 'node:fs'
import { db } from './db'
import { getRawBytes, treeShas } from './github'
import { flowScreenPath, type Manifest } from './manifest'
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
    purpose: 'describir imagen',
  })
  const kind: AppImageKind = r.kind === 'PHOTO' ? 'PHOTO' : 'SCREENSHOT'
  return db.appImage.update({ where: { id: imageId }, data: { kind, description: (r.description ?? '').slice(0, 400) || null } })
}

/** Filas en el orden de `ids` (los pasos de un flujo tienen que llegar en orden). */
export const inOrder = <T extends { id: string }>(ids: string[], rows: T[]) => ids.flatMap((id) => rows.filter((r) => r.id === id))

export type PromptImage = { id: string; kind: AppImageKind; description: string | null; note: string | null; focus: boolean }

/**
 * Imágenes para planificar: las elegidas (`focusIds`, se le muestran al modelo) y las de la biblioteca (sólo texto).
 * Las que todavía no tienen descripción se describen ahora.
 */
export async function imagesForPlan(appId: string, focusIds: string[] = []) {
  const focus = focusIds.length ? inOrder(focusIds, await db.appImage.findMany({ where: { appId, id: { in: focusIds } } })) : []
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

/**
 * Importa las capturas de los flujos del promo.yaml (`.promo/screens/<flujo>/<n>.png`, las saca capture.mjs en el repo)
 * a la biblioteca, ya descritas con el `shows` de cada paso: no gasta en modelos. Sólo baja las que cambiaron;
 * las de pasos o flujos que ya no están quedan archivadas.
 */
export async function importFlowScreens(app: Pick<App, 'id' | 'slug' | 'repo' | 'branch'>, m: Manifest) {
  const shas = m.flows.length ? await treeShas(app.repo, app.branch, '.promo/screens/') : new Map<string, string>()
  const existing = await db.appImage.findMany({ where: { appId: app.id, flowId: { not: null } } })
  const keep = new Set<string>()
  let imported = 0
  for (const flow of m.flows) {
    for (const [n, step] of flow.steps.entries()) {
      const src = flowScreenPath(flow.id, n)
      const sha = shas.get(src)
      if (!sha) continue
      const description = `${flow.name}, paso ${n + 1}/${flow.steps.length}: ${step.shows}`.slice(0, 400)
      const note = flow.description ?? null
      const prev = existing.find((i) => i.flowId === flow.id && i.step === n)
      let path = prev?.path ?? ''
      if (!prev || prev.sha !== sha || !existsSync(mediaPath(prev.path))) {
        const bytes = await getRawBytes(app.repo, src, app.branch)
        if (!bytes) continue
        path = await saveMedia(`apps/${app.slug}/flows/${flow.id}/${n + 1}.png`, bytes)
        imported++
      }
      // Si la archivaste a mano y no cambió, queda archivada.
      const data = { path, sha, description, note, kind: 'SCREENSHOT' as const, archived: prev?.sha === sha ? prev.archived : false }
      const img = prev ? await db.appImage.update({ where: { id: prev.id }, data }) : await db.appImage.create({ data: { ...data, appId: app.id, flowId: flow.id, step: n } })
      keep.add(img.id)
    }
  }
  const gone = existing.filter((i) => !keep.has(i.id) && !i.archived).map((i) => i.id)
  // Sin sha: si el paso vuelve, se reimporta y se reactiva (a diferencia de una archivada a mano).
  if (gone.length) await db.appImage.updateMany({ where: { id: { in: gone } }, data: { archived: true, sha: null } })
  return { imported, archived: gone.length }
}
