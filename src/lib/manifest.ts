// Esquema de promo.yaml: lo que cada app le cuenta al servicio sobre sí misma.
import { createHash } from 'node:crypto'
import { parse as parseYaml, stringify } from 'yaml'
import { z } from 'zod'

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color en formato #rrggbb')

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
