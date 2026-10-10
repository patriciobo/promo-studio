// Esquema de promo.yaml: lo que cada app le cuenta al servicio sobre sí misma.
import { createHash } from 'node:crypto'
import { parse as parseYaml, parseDocument, stringify } from 'yaml'
import { z } from 'zod'

/** Estilo de las ilustraciones si el promo.yaml no define brand.imageStyle. */
export const DEFAULT_IMAGE_STYLE =
  'flat vector illustration, clean shapes, soft gradients, friendly characters using a phone or laptop, simplified app UI without readable text, not a photo, not photorealistic'

/** Estilo de las fotos realistas si el promo.yaml no define brand.photoStyle. */
export const DEFAULT_PHOTO_STYLE =
  'photorealistic lifestyle photography, natural light, shallow depth of field, real people in everyday settings, candid, phone or laptop screens angled or out of focus, not an illustration'

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color en formato #rrggbb')

/** Acción de Playwright para llegar a una pantalla (la ejecuta .promo/capture.mjs en el repo). */
const CaptureAction = z.union([
  z.object({ click: z.string() }),
  z.object({ fill: z.string(), value: z.string() }),
  z.object({ waitFor: z.string() }),
  z.object({ scroll: z.number().int() }),
])

/** Cómo levantar la app en local y entrar con el usuario demo para sacar las capturas de los flujos. */
const CaptureSchema = z.object({
  start: z.string().optional(),
  url: z.url(),
  seed: z.string().optional(),
  device: z.enum(['mobile', 'desktop']).default('mobile'),
  mask: z.array(z.string()).default([]),
  maskColor: z.string().optional(), // color de los recuadros que tapan `mask` (por defecto gris claro)
  login: z.object({ path: z.string().startsWith('/'), steps: z.array(CaptureAction).min(1) }).optional(),
})

/** Flujo de uso de la app: pasos con la pantalla que muestra cada uno, para posts paso a paso. */
const FlowSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id en kebab-case, p. ej. agendar-turno'),
  name: z.string().min(3).max(80),
  description: z.string().max(300).optional(),
  pillar: z.string().optional(),
  steps: z
    .array(
      z.object({
        path: z.string().startsWith('/'),
        actions: z.array(CaptureAction).default([]),
        shows: z.string().min(3).max(200), // qué muestra la pantalla, en el idioma de la app
      }),
    )
    .min(1)
    .max(8),
})
export type Flow = z.infer<typeof FlowSchema>

/** Dónde deja capture.mjs la captura del paso `n` (desde 0) de un flujo. */
export const flowScreenPath = (flowId: string, n: number) => `.promo/screens/${flowId}/${n + 1}.png`

export const ManifestSchema = z.object({
  name: z.string().min(1),
  url: z.url(),
  tagline: z.string().min(3).max(120),
  description: z.string().max(1200).optional(),
  category: z.string().optional(),
  audience: z
    .object({
      countries: z.array(z.string().length(2)).default([]),
      age: z.tuple([z.number().int().min(13), z.number().int().max(65)]).default([18, 55]),
      interests: z.array(z.string()).default([]),
      description: z.string().optional(),
    })
    .default({ countries: [], age: [18, 55], interests: [] }),
  languages: z.array(z.string().min(2)).min(1).default(['es']),
  tone: z.string().default('cercano y claro'),
  brand: z.object({
    colors: z.array(hex).min(2).max(5),
    font: z.string().default('Inter'),
    logo: z.string().optional(), // ruta en el repo o URL
    imageStyle: z.string().max(400).optional(), // estilo de las ilustraciones (en inglés)
    photoStyle: z.string().max(400).optional(), // estilo de las fotos realistas (en inglés)
    style: z.string().optional(), // estilo de diseño de las piezas (src/lib/styles.ts); uno desconocido se ignora
  }),
  features: z.array(z.string()).min(1),
  screenshots: z.array(z.string()).default([]),
  pillars: z.array(z.string()).min(1).default(['producto', 'educativo', 'comunidad']),
  hashtags: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
  cta: z.string().default('Link en la bio'),
  location: z.string().optional(),
  music: z.string().optional(), // ruta o URL a un audio libre de derechos para reels
  links: z
    .array(z.object({ label: z.string(), url: z.url() }))
    .default([]),
  contact: z.object({ email: z.email().optional(), whatsapp: z.string().optional() }).optional(),
  sources: z
    .array(
      z.object({
        type: z.enum(['feed', 'url']),
        url: z.url(),
      }),
    )
    .default([]),
  cadence: z
    .object({
      feed: z.number().int().min(0).max(7).default(3),
      reels: z.number().int().min(0).max(3).default(1),
      stories: z.number().int().min(0).max(7).default(2),
    })
    .default({ feed: 3, reels: 1, stories: 2 }),
  /**
   * Edición diaria (apps de noticias): cada día lee `source` (con {fecha} = AAAA-MM-DD en la zona de la app),
   * arma los posts sólo con ese contenido y los programa a `time`. Quedan en revisión y se aprueban solos al llegar la hora.
   */
  daily: z
    .object({
      source: z.string().refine((u) => u.includes('{fecha}') && URL.canParse(u.replaceAll('{fecha}', '2026-01-01')), 'URL con {fecha}, p. ej. https://sitio.com/reportes/{fecha}.md'),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'hora HH:MM').default('08:00'),
      types: z.array(z.enum(['CAROUSEL', 'IMAGE', 'STORY'])).min(1).default(['CAROUSEL', 'STORY']),
    })
    .optional(),
  capture: CaptureSchema.optional(),
  flows: z
    .array(FlowSchema)
    .max(15)
    .default([])
    .refine((fs) => new Set(fs.map((f) => f.id)).size === fs.length, 'hay ids de flujo repetidos'),
})

export type Manifest = z.infer<typeof ManifestSchema>

export type ManifestResult = { ok: true; manifest: Manifest; hash: string } | { ok: false; error: string }

/** Lee y valida el YAML. Devuelve un error legible (campo: problema) si no es válido. */
export function parseManifest(yamlText: string): ManifestResult {
  let raw: unknown
  try {
    raw = parseYaml(yamlText)
  } catch (e) {
    return { ok: false, error: `YAML inválido: ${(e as Error).message}` }
  }
  const r = ManifestSchema.safeParse(raw)
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`).join('; ') }
  return { ok: true, manifest: r.data, hash: createHash('sha256').update(yamlText).digest('hex').slice(0, 16) }
}

export const manifestToYaml = (m: Manifest) => stringify(m, { lineWidth: 0 })

/** Cambia brand.style en el texto del promo.yaml conservando comentarios y orden. */
export function setYamlStyle(yamlText: string, style: string) {
  const doc = parseDocument(yamlText)
  doc.setIn(['brand', 'style'], style)
  return doc.toString({ lineWidth: 0 })
}

/** Cambios de marca para el promo.yaml (sólo los campos presentes). */
export type BrandPatch = { name?: string; tagline?: string; tone?: string; colors?: string[]; font?: string; logo?: string }

/**
 * Aplica la identidad elegida al texto del promo.yaml cambiando sólo el valor de cada campo: el resto del archivo
 * (comentarios, orden, textos largos plegados y formato de listas) queda igual byte a byte.
 * Si un campo no existe, se agrega como una línea más en su bloque.
 */
export function setYamlBrand(yamlText: string, patch: BrandPatch) {
  const values: [string[], unknown][] = []
  if (patch.name) values.push([['name'], patch.name])
  if (patch.tagline) values.push([['tagline'], patch.tagline.slice(0, 120)])
  if (patch.tone) values.push([['tone'], patch.tone])
  if (patch.colors?.length) values.push([['brand', 'colors'], patch.colors.slice(0, 5)])
  if (patch.font) values.push([['brand', 'font'], patch.font])
  if (patch.logo) values.push([['brand', 'logo'], patch.logo])
  const doc = parseDocument(yamlText)
  const inline = (value: unknown) => (Array.isArray(value) ? `[${value.map((v) => JSON.stringify(v)).join(', ')}]` : stringify(value, { lineWidth: 0 }).trimEnd())
  const edits: { from: number; to: number; text: string }[] = []
  for (const [path, value] of values) {
    const node = doc.getIn(path, true) as { range?: [number, number, number] } | undefined
    if (node?.range) {
      // Los textos plegados (>-) terminan en el salto de línea: se conserva.
      const end = yamlText.slice(node.range[0], node.range[1]).endsWith('\n') ? node.range[1] - 1 : node.range[1]
      edits.push({ from: node.range[0], to: end, text: inline(value) })
      continue
    }
    // Campo nuevo: una línea al final de su bloque (brand) o del archivo, con la sangría de sus vecinos.
    const key = path.at(-1)!
    const parent = path.length > 1 ? (doc.getIn(path.slice(0, -1), true) as { range?: [number, number, number]; items?: { key: { range?: [number, number, number] } }[] } | undefined) : undefined
    if (parent?.range && parent.items?.[0]?.key.range) {
      const keyStart = parent.items[0].key.range[0]
      const indent = keyStart - (yamlText.lastIndexOf('\n', keyStart - 1) + 1)
      const at = parent.range[1]
      const nl = yamlText[at - 1] === '\n' ? '' : '\n'
      edits.push({ from: at, to: at, text: `${nl}${' '.repeat(indent)}${key}: ${inline(value)}${nl ? '' : '\n'}` })
    } else if (path.length === 1) {
      edits.push({ from: yamlText.length, to: yamlText.length, text: `${yamlText.endsWith('\n') ? '' : '\n'}${key}: ${inline(value)}\n` })
    }
  }
  let out = yamlText
  for (const e of edits.sort((x, y) => y.from - x.from)) out = out.slice(0, e.from) + e.text + out.slice(e.to)
  return out
}

/** Contenido de una fuente "feed": ideas estructuradas que la app publica (p. ej. ejercicios, guías). */
export const FeedSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      body: z.string().optional(),
      bullets: z.array(z.string()).optional(),
      pillar: z.string().optional(),
      url: z.url().optional(),
      image: z.string().optional(),
    }),
  ),
})
export type Feed = z.infer<typeof FeedSchema>
