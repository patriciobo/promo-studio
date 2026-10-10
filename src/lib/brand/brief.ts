// Brief de identidad de marca: qué se le pregunta al cliente, qué se genera y qué conceptos encajan.
// Las preguntas siguen los cuestionarios de branding más usados (historia y propósito, público, competencia,
// personalidad con adjetivos y ejes, referencias, aplicaciones y restricciones).
import { z } from 'zod'
import { AXES, CONCEPTS, LOGO_TYPES, PERSONALITIES, type Axes, type BrandConcept, type LogoType } from './concepts'

/** Carpeta de media de la identidad de una app. */
export const projectDir = (appSlug: string) => `apps/${appSlug}/marca`

/** Piezas que se pueden generar. Desde un repo se marcan por defecto sólo las que faltan. */
export const ELEMENTS = [
  { id: 'logo', label: 'Logo', hint: 'Una versión por alternativa, generada con el modelo de imagen.' },
  { id: 'paleta', label: 'Paleta de color', hint: '4 a 6 colores con su rol (principal, fondo, texto, acento).' },
  { id: 'tipografia', label: 'Tipografías', hint: 'Una para títulos y otra para textos, de Google Fonts.' },
  { id: 'voz', label: 'Tono de voz', hint: 'Cómo habla la marca, qué sí y qué no, con un ejemplo.' },
  { id: 'tagline', label: 'Frase de marca', hint: 'Una línea que resume la promesa.' },
  { id: 'patron', label: 'Gráfico de apoyo', hint: 'Un patrón para fondos y piezas.' },
  { id: 'nombre', label: 'Nombre', hint: 'Sólo si todavía no tiene nombre: 3 propuestas.' },
] as const
export type ElementId = (typeof ELEMENTS)[number]['id']
export const ELEMENT_IDS = ELEMENTS.map((e) => e.id) as ElementId[]
export const parseElements = (v: string[]) => ELEMENT_IDS.filter((id) => v.includes(id))

/** Dónde se va a usar la marca: define qué aplicaciones muestra la lámina y qué tan simple tiene que ser el logo. */
export const USES = ['Redes sociales', 'Sitio web o app', 'Cartelería y vidriera', 'Packaging o etiquetas', 'Papelería y tarjetas', 'Uniformes y merchandising', 'Vehículos'] as const

const axis = z.coerce.number().min(0).max(1).catch(0.5)

export const BriefSchema = z.object({
  // Sobre el negocio
  name: z.string().max(80).default(''),
  needsName: z.boolean().default(false),
  industry: z.string().max(120).default(''),
  offer: z.string().max(800).default(''),
  purpose: z.string().max(600).default(''),
  differentiator: z.string().max(600).default(''),
  // Público y mercado
  audience: z.string().max(600).default(''),
  location: z.string().max(120).default(''),
  competitors: z.string().max(600).default(''),
  // Personalidad
  personalities: z.array(z.enum(PERSONALITIES)).max(5).default([]),
  axes: z.object({ modern: axis, playful: axis, expressive: axis, exclusive: axis }).default({ modern: 0.5, playful: 0.5, expressive: 0.5, exclusive: 0.5 }),
  // Gustos y referencias
  likedColors: z.string().max(200).default(''),
  avoidColors: z.string().max(200).default(''),
  admiredBrands: z.string().max(400).default(''),
  logoTypes: z.array(z.enum(LOGO_TYPES.map((l) => l.id) as [LogoType, ...LogoType[]])).default([]),
  uses: z.array(z.string()).default([]),
  tagline: z.string().max(140).default(''),
  constraints: z.string().max(600).default(''),
  language: z.string().max(20).default('es'),
})
export type Brief = z.infer<typeof BriefSchema>

export const emptyBrief = (): Brief => BriefSchema.parse({})

const str = (f: FormData, k: string) => String(f.get(k) ?? '').replace(/\r\n/g, '\n').trim()

/** El formulario del brief a un Brief válido (lo que no se completó queda vacío). */
export function parseBriefForm(f: FormData): Brief {
  return BriefSchema.parse({
    name: str(f, 'name'),
    needsName: f.get('needsName') === 'on',
    industry: str(f, 'industry'),
    offer: str(f, 'offer'),
    purpose: str(f, 'purpose'),
    differentiator: str(f, 'differentiator'),
    audience: str(f, 'audience'),
    location: str(f, 'location'),
    competitors: str(f, 'competitors'),
    personalities: f.getAll('personalities').map(String).filter((p) => (PERSONALITIES as readonly string[]).includes(p)).slice(0, 5),
    axes: Object.fromEntries(AXES.map((a) => [a.id, Number(str(f, `axis_${a.id}`) || 50) / 100])),
    likedColors: str(f, 'likedColors'),
    avoidColors: str(f, 'avoidColors'),
    admiredBrands: str(f, 'admiredBrands'),
    logoTypes: f.getAll('logoTypes').map(String).filter((t) => LOGO_TYPES.some((l) => l.id === t)),
    uses: f.getAll('uses').map(String).filter((u) => (USES as readonly string[]).includes(u)),
    tagline: str(f, 'tagline'),
    constraints: str(f, 'constraints'),
    language: str(f, 'language') || 'es',
  })
}

/** Lo que falta completar para que las alternativas no salgan genéricas. */
export function missingInBrief(b: Brief): string[] {
  const out: string[] = []
  if (!b.name && !b.needsName) out.push('el nombre (o marcar que hace falta uno)')
  if (!b.industry) out.push('el rubro')
  if (!b.offer) out.push('qué ofrece')
  if (!b.audience) out.push('el público')
  if (!b.personalities.length) out.push('al menos un rasgo de personalidad')
  return out
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Ordena los conceptos según el brief: rasgos de personalidad en común, cercanía en los ejes,
 * palabras del rubro y tipo de logo preferido. El modelo de texto elige 3 entre los primeros.
 */
export function rankConcepts(b: Brief): { concept: BrandConcept; score: number }[] {
  const text = norm([b.industry, b.offer, b.purpose, b.audience, b.admiredBrands].join(' '))
  return CONCEPTS.map((c) => {
    const traits = b.personalities.filter((p) => c.personalities.includes(p)).length * 2
    const distance = AXES.reduce((d, a) => d + Math.abs((b.axes as Axes)[a.id] - c.axes[a.id]), 0) // 0 a 4
    const words = c.keywords.filter((k) => text.includes(norm(k))).length * 1.5
    const logo = b.logoTypes.some((t) => c.logoTypes.includes(t)) ? 1 : 0
    return { concept: c, score: Math.round((traits + words + logo + (4 - distance) * 1.5) * 100) / 100 }
  }).sort((x, y) => y.score - x.score)
}

// --- Desde un repositorio -----------------------------------------------------------------------

/** Lo que se encontró en el repo y se respeta al generar (sólo se generan los elementos marcados). */
export const FoundSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  homepage: z.string().optional(),
  colors: z.array(z.string()).default([]),
  fonts: z.array(z.string()).default([]),
  /** Ruta del logo en el repo y copia local (relativa a MEDIA_DIR). */
  logo: z.string().optional(),
  logoPath: z.string().optional(),
  tagline: z.string().optional(),
  /** De dónde salió cada dato, para mostrarlo. */
  sources: z.array(z.string()).default([]),
})
export type Found = z.infer<typeof FoundSchema>

const GENERIC_FONTS = new Set(['inherit', 'initial', 'system-ui', 'sans-serif', 'serif', 'monospace', 'cursive', 'ui-sans-serif', 'ui-serif', 'ui-monospace', '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'roboto', 'helvetica', 'helvetica neue', 'arial', 'apple color emoji', 'segoe ui emoji', 'noto color emoji', 'var', 'menlo', 'monaco', 'consolas', 'sfmono-regular', 'courier new'])

const titleCaseRaw = (s: string) => s.replace(/(^|[\s-])([a-z])/g, (_, p: string, c: string) => `${p === '-' ? ' ' : p}${c.toUpperCase()}`)
// Siglas que Google Fonts escribe en mayúsculas (IBM Plex, DM Sans, PT Serif…).
const titleCase = (s: string) => titleCaseRaw(s).replace(/\b(Ibm|Dm|Pt|Eb|Im|Ms)\b/g, (w) => w.toUpperCase())

/**
 * Familias tipográficas que usa un archivo: @fontsource, next/font/google, links de Google Fonts y font-family en CSS.
 * Ignora las genéricas del sistema.
 */
export function fontsFromText(text: string): string[] {
  const out: string[] = []
  const add = (f: string) => {
    const name = f.trim().replace(/^['"]|['"]$/g, '').trim()
    if (name && !GENERIC_FONTS.has(name.toLowerCase()) && !name.startsWith('var(') && !name.startsWith('--') && !out.some((o) => o.toLowerCase() === name.toLowerCase())) out.push(name)
  }
  for (const m of text.matchAll(/@fontsource(?:-variable)?\/([a-z0-9-]+)/g)) add(titleCase(m[1]))
  for (const m of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]next\/font\/google['"]/g)) for (const n of m[1].split(',')) add(n.split(' as ')[0].trim().replace(/_/g, ' '))
  for (const m of text.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'\s)]+)/g)) for (const fam of m[1].matchAll(/family=([^:&]+)/g)) add(decodeURIComponent(fam[1].replace(/\+/g, ' ')))
  for (const m of text.matchAll(/font-family\s*:\s*([^;}{]+)/g)) add(m[1].split(',')[0])
  for (const m of text.matchAll(/fontFamily\s*:\s*\{([^}]+)\}/g)) for (const fam of m[1].matchAll(/\[\s*['"]([^'"]+)['"]/g)) add(fam[1])
  return out.slice(0, 6)
}

/** Colores hex de 6 dígitos más repetidos (los de tokens y temas primero, por orden de aparición). */
export function colorsFromText(text: string, max = 8): string[] {
  const counts = new Map<string, number>()
  for (const m of text.matchAll(/#[0-9a-fA-F]{6}\b/g)) counts.set(m[0].toLowerCase(), (counts.get(m[0].toLowerCase()) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, max)
}

/** Elementos que conviene generar según lo que ya hay en el repo. */
export function missingElements(found: Found): ElementId[] {
  const out: ElementId[] = []
  if (!found.logo) out.push('logo')
  if (found.colors.length < 2) out.push('paleta')
  if (!found.fonts.length) out.push('tipografia')
  out.push('voz')
  if (!found.tagline) out.push('tagline')
  out.push('patron')
  return out
}
