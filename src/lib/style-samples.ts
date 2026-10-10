// Muestras de estilo: una portada por estilo y calidad, para elegir en Ajustes.
// Genéricas (marca de prueba, iguales para todas las apps: sirven para comparar calidades) o con la marca y el tema de una app.
import type { App } from '@prisma/client'
import { existsSync, statSync } from 'node:fs'
import { readdir, readFile, rm } from 'node:fs/promises'
import { TEMPLATES } from '@/templates/styles'
import type { Brand } from '@/templates/brand'
import { SIZES, type SlideData } from '@/templates/html'
import { closeBrowser, renderHtml } from '@/render/renderer'
import { db } from './db'
import { DEFAULT_IMAGE_STYLE, DEFAULT_PHOTO_STYLE } from './manifest'
import { bufferDataUri, dataUri, mediaPath, mediaSrc, saveMedia } from './media'
import { IMAGE_MODELS, parseImageKind, type ImageKind, type ImageQuality } from './models'
import { generateImage } from './openrouter'
import { brandOf, manifestOf, styleFor } from './pipeline'
import { DESIGN_STYLES, designStyle, SAMPLE_MODEL, sampleKey, type DesignStyleId } from './styles'

const dirOf = (slug?: string) => (slug ? `apps/${slug}/estilos` : 'estilos')
const fileOf = (dir: string, key: string) => `${dir}/${key}.jpg`
const bgOf = (dir: string, key: string) => `${dir}/fondos/${key}.jpg`

/** Muestras ya generadas: clave "estilo-calidad" → src para la web (con la fecha, porque /media se cachea como inmutable). */
export async function listSamples(slug?: string): Promise<Record<string, string>> {
  const dir = dirOf(slug)
  const files = await readdir(mediaPath(dir)).catch(() => [] as string[])
  return Object.fromEntries(files.filter((f) => f.endsWith('.jpg')).map((f) => [f.slice(0, -4), `${mediaSrc(`${dir}/${f}`)}?v=${Math.round(statSync(mediaPath(`${dir}/${f}`)).mtimeMs)}`]))
}

/** US$ estimados para generar estas muestras (las que ya tienen fondo no cuestan). */
export function samplesCost(styles: DesignStyleId[], qualities: ImageQuality[], slug?: string) {
  const prices = IMAGE_MODELS.find((m) => m.id === SAMPLE_MODEL)!.qualities!
  return styles.flatMap((s) => qualities.filter((q) => !existsSync(mediaPath(bgOf(dirOf(slug), sampleKey(s, q))))).map((q) => prices[q])).reduce((a, b) => a + b, 0)
}

// Contenido de prueba de las genéricas: una app de finanzas inventada.
const DEMO_COLORS = ['#ff5a36', '#ffb000', '#fff7ef', '#1c1a24']
const DEMO_BRAND: Brand = { name: 'Rumbo', primary: DEMO_COLORS[0], accent: DEMO_COLORS[1], bg: DEMO_COLORS[2], ink: DEMO_COLORS[3], font: 'Inter', url: 'rumbo.app' }
const DEMO_SLIDE: SlideData = { eyebrow: 'Finanzas personales', title: 'Ahorrá sin pensarlo', body: '3 hábitos automáticos que suman a fin de mes.', index: 0, total: 5 }
const DEMO_SCENE = 'A young woman relaxed on a sofa checking a savings app on her phone, a glass jar with coins and a small plant on the table, warm afternoon'

interface Subject {
  brand: Brand
  slide: SlideData
  scene: string
  colors: string[]
  look: (style: DesignStyleId, kind: ImageKind) => string
  kind: (style: DesignStyleId) => ImageKind
}

const demo: Subject = {
  brand: DEMO_BRAND,
  slide: DEMO_SLIDE,
  scene: DEMO_SCENE,
  colors: DEMO_COLORS,
  look: (s, k) => designStyle(s).image?.[k] ?? (k === 'photo' ? DEFAULT_PHOTO_STYLE : DEFAULT_IMAGE_STYLE),
  kind: (s) => designStyle(s).sampleKind ?? 'illustration',
}

/** La portada de muestra de una app: su marca, su tema y su tipo de imagen (el de Ajustes). */
async function subjectOf(app: App): Promise<Subject> {
  const m = manifestOf(app)
  const last = await db.post.findFirst({ where: { appId: app.id, hook: { not: null } }, orderBy: { createdAt: 'desc' }, select: { hook: true } })
  const title = last?.hook && last.hook.length <= 60 && !last.hook.startsWith('Edición ') ? last.hook : m.tagline
  const kind = parseImageKind(app.imageKind) ?? 'illustration'
  return {
    brand: await brandOf(app),
    slide: { eyebrow: m.pillars[0], title, body: title === m.tagline ? m.features[0] : m.tagline, index: 0, total: 5 },
    scene: `A scene for "${m.name}" (${m.tagline}). ${m.description ? `${m.description.slice(0, 300)}. ` : ''}Show ${m.audience.description ?? 'its typical customer'} in a moment where it helps them`,
    colors: m.brand.colors,
    look: (s, k) => styleFor(m, k, s),
    kind: () => kind,
  }
}

const PLACEHOLDER = (c: string[]) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000"><rect width="800" height="1000" fill="#9fb4c7"/><circle cx="560" cy="300" r="260" fill="${c[1] ?? c[0]}"/><circle cx="240" cy="700" r="300" fill="${c[0]}" opacity=".8"/></svg>`)}`

/**
 * Genera las muestras pedidas (estilo × calidad). Reutiliza el fondo IA ya generado salvo `force`,
 * así volver a armarlas tras cambiar una plantilla no cuesta nada. Con OPENROUTER_MOCK=1 usa un fondo de relleno.
 */
export async function generateSamples(opts: { app?: App; styles: DesignStyleId[]; qualities: ImageQuality[]; force?: boolean; log?: (s: string) => void; onProgress?: (done: number, total: number) => Promise<unknown> }) {
  const subject = opts.app ? await subjectOf(opts.app) : demo
  const dir = dirOf(opts.app?.slug)
  const total = opts.styles.length * opts.qualities.length
  let cost = 0
  let done = 0
  try {
    for (const s of opts.styles) {
      const kind = subject.kind(s)
      for (const q of opts.qualities) {
        const key = sampleKey(s, q)
        const bgRel = bgOf(dir, key)
        let bg: string
        if (!opts.force && existsSync(mediaPath(bgRel))) bg = await dataUri(bgRel)
        else if (process.env.OPENROUTER_MOCK === '1') bg = PLACEHOLDER(subject.colors)
        else {
          const prompt = `${subject.scene}. ${kind === 'photo' ? 'Photorealistic photo. ' : ''}Style: ${subject.look(s, kind)}. Color palette ${subject.colors.join(', ')}. Leave calm space for overlaid text. Absolutely no text, letters, numbers, logos or watermarks.`
          const img = await generateImage({ appId: opts.app?.id ?? null, model: SAMPLE_MODEL, quality: q, prompt, aspectRatio: '4:5', kind, purpose: `muestra de estilo ${s} (${q})` })
          await saveMedia(bgRel, img.data)
          cost += img.cost
          bg = bufferDataUri(img.data, img.mime)
        }
        const html = TEMPLATES[s].cover(subject.brand, { ...subject.slide, background: bg }, SIZES.feed)
        await saveMedia(fileOf(dir, key), await renderHtml(html, SIZES.feed.w, SIZES.feed.h))
        opts.log?.(`${key} listo`)
        await opts.onProgress?.(++done, total)
      }
    }
  } finally {
    await closeBrowser()
  }
  return { cost }
}

export const ALL_STYLES = DESIGN_STYLES.map((s) => s.id)

// Estado del último pedido de muestras (lo corre el worker): para mostrar "generando" o el error en Ajustes.
export type SamplesState = { status: 'running' | 'error'; at: string; error?: string; started?: string; done?: number; total?: number }
const stateOf = (slug?: string) => `${dirOf(slug)}/estado.json`

export async function setSamplesState(slug: string | undefined, state: Omit<SamplesState, 'at'> | null) {
  if (!state) return rm(mediaPath(stateOf(slug)), { force: true })
  await saveMedia(stateOf(slug), Buffer.from(JSON.stringify({ ...state, at: new Date().toISOString() })))
}

/** Un pedido "running" de hace más de 30 min se da por caído (worker reiniciado). */
export async function samplesState(slug?: string): Promise<SamplesState | null> {
  const st = (await readFile(mediaPath(stateOf(slug)), 'utf8').then((t) => JSON.parse(t) as SamplesState).catch(() => null)) ?? null
  if (st?.status === 'running' && Date.now() - Date.parse(st.at) > 30 * 60e3) return null
  return st
}
