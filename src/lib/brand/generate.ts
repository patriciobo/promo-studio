// Genera rondas de 3 alternativas de identidad: el modelo de texto arma cada alternativa a partir de un concepto
// del catálogo (concepts.ts), el modelo de imagen dibuja el logo y Chrome arma la lámina con todo.
import type { BrandOption, BrandProject } from '@prisma/client'
import { existsSync } from 'node:fs'
import { extname } from 'node:path'
import { z } from 'zod'
import { lum } from '@/templates/brand'
import { BOARD, brandBoardHtml } from '@/templates/brand-board'
import { renderIconSet } from './icons'
import { closeBrowser, renderHtml } from '@/render/renderer'
import { db } from '../db'
import { bufferDataUri, dataUri, mediaPath, saveMedia } from '../media'
import { IMAGE_MODELS, imagePrice } from '../models'
import { completeJson, generateImage, vectorizeImage, VECTOR_MODEL } from '../openrouter'
import { BriefSchema, ELEMENTS, FoundSchema, projectDir, rankConcepts, type Brief, type ElementId, type Found } from './brief'
import { CATALOG_FONTS, CONCEPTS, concept, LOGO_TYPES, PATTERNS, type BrandConcept } from './concepts'

export const OPTIONS_PER_ROUND = 3
/** Cuántos conceptos candidatos ve el modelo de texto (elige 3 distintos). */
const CANDIDATES = 6

// --- Modelos para el logo -------------------------------------------------------------------------

export interface LogoModel {
  id: string
  quality: string | null
  label: string
  note: string
  recommended?: boolean
}

/**
 * Modelos de OpenRouter para logos, de los ya usados en Promo Studio. Recraft V4.1 Flash es la opción del
 * proveedor especializado en diseño y marca (buen texto y formas limpias) al costo de Sunburst en calidad baja.
 */
export const LOGO_MODELS: LogoModel[] = [
  { id: 'recraft/recraft-v4.1-flash', quality: null, label: 'Recraft V4.1 Flash', note: 'Especializado en diseño y marca: formas limpias y buen texto', recommended: true },
  { id: 'openai/gpt-image-2.5-sunburst', quality: 'low', label: 'GPT Image 2.5 Sunburst (baja)', note: 'El más barato; borradores' },
  { id: 'openai/gpt-image-2.5-sunburst', quality: 'medium', label: 'GPT Image 2.5 Sunburst (media)', note: 'Más detalle y mejor tipografía' },
  { id: 'google/gemini-3.1-flash-image', quality: null, label: 'Nano Banana 2', note: 'Bueno para mascotas e ilustración' },
]

export const logoPrice = (m: Pick<LogoModel, 'id' | 'quality'>) => {
  const info = IMAGE_MODELS.find((x) => x.id === m.id)
  return info ? imagePrice(info, m.quality) : 0.05
}
export const encodeLogoModel = (m: Pick<LogoModel, 'id' | 'quality'>) => `${m.id}|${m.quality ?? ''}`
export function parseLogoModel(v: string | null | undefined): Pick<LogoModel, 'id' | 'quality'> {
  const hit = LOGO_MODELS.find((m) => encodeLogoModel(m) === v)
  return hit ?? LOGO_MODELS[0]
}

/** Precio aproximado de vectorizar una imagen con Recraft V4.1 Vector. */
export const VECTOR_EACH = 0.08
/** Logo e ícono juntos. */
export const VECTOR_PRICE = 2 * VECTOR_EACH
/** Texto de las 3 alternativas: unos 6 a 10 mil tokens con Gemini Flash. */
export const TEXT_ESTIMATE = 0.01

/** Con logo: 2 imágenes por alternativa (logo e ícono). */
export function roundCost(elements: ElementId[], logo: Pick<LogoModel, 'id' | 'quality'>) {
  return TEXT_ESTIMATE + (elements.includes('logo') ? OPTIONS_PER_ROUND * 2 * logoPrice(logo) : 0)
}

// --- Lo que devuelve el modelo de texto ---------------------------------------------------------------

const HEX = /^#[0-9a-fA-F]{6}$/
const ROLES = ['principal', 'fondo', 'texto', 'acento', 'apoyo'] as const

export const OptionSchema = z.object({
  conceptId: z.string(),
  title: z.string().max(80).catch(''),
  rationale: z.string().max(800).catch(''),
  brandName: z.string().max(60).catch(''),
  names: z.array(z.string().max(40)).max(3).catch([]),
  tagline: z.string().max(160).catch(''),
  palette: z
    .array(z.object({ hex: z.string().regex(HEX), name: z.string().max(40).catch(''), role: z.enum(ROLES).catch('apoyo') }))
    .max(6)
    .catch([]),
  fonts: z.object({ display: z.string().max(60), text: z.string().max(60) }).optional().catch(undefined),
  voice: z
    .object({ tone: z.string().max(400).catch(''), do: z.array(z.string().max(120)).max(4).catch([]), dont: z.array(z.string().max(120)).max(4).catch([]), sample: z.string().max(300).catch('') })
    .optional()
    .catch(undefined),
  logo: z
    .object({ type: z.string().max(30).catch('combination'), idea: z.string().max(500).catch(''), prompt: z.string().max(1500).catch('') })
    .optional()
    .catch(undefined),
  pattern: z.enum(PATTERNS).catch('ninguno'),
  notes: z.string().max(500).optional(),
})
export type OptionData = z.infer<typeof OptionSchema>

export interface RoundContext {
  brief: Brief
  found: Found | null
  elements: ElementId[]
  /** Conceptos usados en rondas anteriores: se prefieren otros para no repetir. */
  usedConcepts: string[]
  /** Pedido para esta ronda ("más minimal", "probá con verde"). */
  notes?: string
  hasReference: boolean
}

/** Conceptos candidatos: los mejor puntuados, dejando para el final los ya usados. */
export function candidates(ctx: Pick<RoundContext, 'brief' | 'usedConcepts'>, n = CANDIDATES): BrandConcept[] {
  const ranked = rankConcepts(ctx.brief).map((r) => r.concept)
  const fresh = ranked.filter((c) => !ctx.usedConcepts.includes(c.id))
  return [...fresh, ...ranked.filter((c) => ctx.usedConcepts.includes(c.id))].slice(0, n)
}

export function buildIdentityPrompt(ctx: RoundContext) {
  const cands = candidates(ctx)
  const gen = (id: ElementId) => ctx.elements.includes(id)
  const fixed: string[] = []
  if (ctx.found && !gen('paleta') && ctx.found.colors.length) fixed.push(`palette (keep exactly): ${ctx.found.colors.join(', ')}`)
  if (ctx.found && !gen('tipografia') && ctx.found.fonts.length) fixed.push(`fonts (keep): ${ctx.found.fonts.join(', ')}`)
  if (ctx.found?.logo && !gen('logo')) fixed.push('logo: the existing one is kept (shown in the image if attached)')
  if (ctx.found?.tagline && !gen('tagline')) fixed.push(`tagline (keep): ${ctx.found.tagline}`)
  const language = ctx.brief.language || 'es'
  const system = `You are a senior brand identity designer from a studio that follows the best international practice (Swiss, Dutch, Scandinavian, Japanese and Korean schools) and 2026 trends.
Create exactly ${OPTIONS_PER_ROUND} DIFFERENT brand identity alternatives for the client brief. Each alternative must use a different concept from the candidate list below (use its "id" as conceptId) and must be coherent with that concept AND with the brief. Prefer the candidates that fit the brief best; the list is ordered by fit.

Candidate concepts:
${cands.map((c) => `- ${c.id}: ${c.name} (${c.origin}). ${c.summary} Palette: ${c.palette.guide} Example palettes: ${c.palette.examples.map((p) => p.join(' ')).join(' | ')}. Fonts (Google Fonts): display ${c.fonts.display.join(', ')}; text ${c.fonts.text.join(', ')}. Logo types: ${c.logoTypes.join(', ')}. Avoid: ${c.avoid}`).join('\n')}

Elements to create: ${ctx.elements.map((e) => ELEMENTS.find((x) => x.id === e)?.label).join(', ') || 'none'}.
${fixed.length ? `Already decided by the client, do not change: ${fixed.join('; ')}.` : ''}
Rules:
- Faithful to the brief: industry, audience, personality, liked and avoided colors, constraints. Do not invent facts about the business.
- palette: 4-6 colors with roles; exactly one "principal", one "fondo" (light or dark background), one "texto" with strong contrast against "fondo" (WCAG AA), then "acento"/"apoyo". Distinctive, not generic.
- fonts: two real Google Fonts families (display and text), preferably from the concept list.
- logo.prompt (English, for an image model): describe ONE simple, memorable, scalable logo that works in one color and at 32 px; describe the mark and the lettering of the brand name; no mockups, no photos, no gradients unless the concept needs them.
- logo.type one of: ${LOGO_TYPES.map((l) => l.id).join(', ')}${ctx.brief.logoTypes.length ? ` (client prefers: ${ctx.brief.logoTypes.join(', ')})` : ''}.
- voice: tone (how it talks), 3 "do", 3 "dont" and one sample sentence for social media, in ${language}.
- pattern: one of ${PATTERNS.join(', ')}.
- If the brand has no name yet, propose 3 names in "names" (short, easy to say in ${language}, available-sounding) and use the best as brandName.
- title: short name for the alternative (2-4 words). rationale: 2-3 sentences, in ${language}, explaining why it fits this client (audience, personality, differentiation from competitors).
- All user-facing texts in ${language} (rioplatense voseo if Spanish).
Answer only JSON: {"options":[{"conceptId":string,"title":string,"rationale":string,"brandName":string,"names":[string],"tagline":string,"palette":[{"hex":"#rrggbb","name":string,"role":"principal"|"fondo"|"texto"|"acento"|"apoyo"}],"fonts":{"display":string,"text":string},"voice":{"tone":string,"do":[string],"dont":[string],"sample":string},"logo":{"type":string,"idea":string,"prompt":string},"pattern":string}]}`
  const user = JSON.stringify({
    brief: ctx.brief,
    existing: ctx.found ? { name: ctx.found.name, description: ctx.found.description, colors: ctx.found.colors, fonts: ctx.found.fonts, tagline: ctx.found.tagline } : undefined,
    referenceLogo: ctx.hasReference ? 'attached image: a logo the client likes as a reference. Take its spirit (shape language, weight, simplicity), never copy it.' : undefined,
    avoidRepeating: ctx.usedConcepts.length ? `Concepts already shown in previous rounds: ${ctx.usedConcepts.join(', ')}. Prefer others unless they fit much better.` : undefined,
    requestForThisRound: ctx.notes || undefined,
  })
  return { system, user, candidates: cands }
}

/** Roles para una paleta existente: el primero es el principal, el más claro el fondo y el más oscuro el texto. */
export function rolesFor(colors: string[]): OptionData['palette'] {
  const hexes = colors.map((c) => c.toLowerCase())
  const rest = hexes.slice(1)
  const light = [...rest].sort((a, b) => lum(b) - lum(a))[0]
  const dark = [...rest].sort((a, b) => lum(a) - lum(b))[0]
  let accent = false
  return hexes.map((hex, k) => {
    const role = k === 0 ? 'principal' : hex === light && lum(hex) > 0.6 ? 'fondo' : hex === dark && lum(hex) < 0.2 ? 'texto' : accent ? 'apoyo' : ((accent = true), 'acento')
    return { hex, name: '', role }
  })
}

const fontOk = (f: string | undefined, allowed: string[]) => !!f && allowed.some((a) => a.toLowerCase() === f.toLowerCase())

/**
 * Deja las 3 alternativas listas: conceptos distintos y válidos, lo fijo del repo respetado,
 * paleta con roles y tipografías que existan. Completa con el concepto lo que el modelo no trajo.
 */
export function normalizeOptions(raw: unknown, ctx: RoundContext, cands: BrandConcept[]): OptionData[] {
  const list = (raw as { options?: unknown[] } | null)?.options ?? []
  const parsed = list.map((o) => OptionSchema.safeParse(o)).flatMap((r) => (r.success ? [r.data] : []))
  const out: OptionData[] = []
  const used = new Set<string>()
  const pool = [...cands, ...CONCEPTS.filter((c) => !cands.includes(c))]
  for (const o of parsed) {
    if (out.length === OPTIONS_PER_ROUND) break
    const c = concept(o.conceptId)
    out.push({ ...o, conceptId: c && !used.has(c.id) ? c.id : pool.find((p) => !used.has(p.id))!.id })
    used.add(out.at(-1)!.conceptId)
  }
  while (out.length < OPTIONS_PER_ROUND) {
    const c = pool.find((p) => !used.has(p.id))!
    used.add(c.id)
    out.push(OptionSchema.parse({ conceptId: c.id, title: c.name, rationale: c.why, pattern: c.pattern }))
  }
  const gen = (id: ElementId) => ctx.elements.includes(id)
  const found = ctx.found
  return out.map((o, i) => {
    const c = concept(o.conceptId)!
    const name = ctx.brief.name || found?.name || o.brandName || o.names[0] || c.name
    let palette = o.palette
    if (found && !gen('paleta') && found.colors.length >= 2) palette = rolesFor(found.colors.slice(0, 6))
    else if (palette.length < 3) {
      const ex = c.palette.examples[i % c.palette.examples.length]
      palette = ex.map((hex, k) => ({ hex, name: '', role: (['principal', 'fondo', 'texto', 'acento', 'apoyo'] as const)[Math.min(k, 4)] }))
    }
    if (!palette.some((p) => p.role === 'principal')) palette = palette.map((p, k) => (k === 0 ? { ...p, role: 'principal' } : p))
    let fonts = o.fonts
    if (found && !gen('tipografia') && found.fonts.length) fonts = { display: found.fonts[0], text: found.fonts[1] ?? found.fonts[0] }
    else {
      const allowed = [...CATALOG_FONTS, ...(found?.fonts ?? [])]
      fonts = { display: fontOk(fonts?.display, allowed) ? fonts!.display : c.fonts.display[0], text: fontOk(fonts?.text, allowed) ? fonts!.text : c.fonts.text[0] }
    }
    const tagline = found?.tagline && !gen('tagline') ? found.tagline : gen('tagline') ? o.tagline || ctx.brief.tagline : ctx.brief.tagline
    return {
      ...o,
      title: o.title || c.name,
      rationale: o.rationale || c.why,
      brandName: name,
      names: gen('nombre') ? o.names : [],
      tagline,
      palette,
      fonts,
      voice: gen('voz') ? o.voice : undefined,
      logo: gen('logo') ? (o.logo ?? { type: c.logoTypes[0], idea: c.summary, prompt: c.logoStyle }) : undefined,
      pattern: gen('patron') ? o.pattern : 'ninguno',
      notes: ctx.notes || undefined,
    }
  })
}

/** Modo demo (OPENROUTER_MOCK=1): alternativas armadas con los 3 mejores conceptos, sin llamar al modelo. */
export function mockOptions(ctx: RoundContext) {
  const cands = candidates(ctx)
  return {
    options: cands.slice(0, OPTIONS_PER_ROUND).map((c, i) => ({
      conceptId: c.id,
      title: c.name,
      rationale: `${c.why} (Modo demo: alternativa armada sin modelo de texto.)`,
      names: ctx.brief.needsName ? ['Nombre uno', 'Nombre dos', 'Nombre tres'] : [],
      tagline: ctx.brief.tagline || 'Tu frase de marca va acá',
      palette: c.palette.examples[i % c.palette.examples.length].map((hex, k) => ({ hex, name: '', role: ['principal', 'fondo', 'texto', 'acento', 'apoyo'][Math.min(k, 4)] })),
      fonts: { display: c.fonts.display[0], text: c.fonts.text[0] },
      voice: { tone: `Habla como ${ctx.brief.personalities.join(', ') || 'una marca cercana'}.`, do: ['Frases cortas'], dont: ['Jerga'], sample: 'Así suena la marca en un posteo.' },
      logo: { type: c.logoTypes[0], idea: c.summary, prompt: c.logoStyle },
      pattern: c.pattern,
    })),
  }
}

/** Prompt final del logo para el modelo de imagen. */
export function logoPrompt(o: OptionData) {
  const c = concept(o.conceptId)!
  const symbolOnly = o.logo?.type === 'symbol'
  const colors = o.palette.filter((p) => p.role !== 'fondo').map((p) => p.hex).join(', ')
  return `${o.logo?.prompt || c.logoStyle}. Concept style: ${c.logoStyle}. ${symbolOnly ? 'Symbol only, no letters.' : `The brand name "${o.brandName}" spelled exactly like that, correct letters only.`} Colors: ${colors}. Professional flat vector logo, centered, generous margin, on a plain white background. No mockup, no photo, no 3D render${c.id === 'sensorial' ? ' except soft volume in the symbol' : ''}, no tagline, no extra words, no watermark.`
}

/**
 * Prompt del ícono: sólo el símbolo o el monograma, cuadrado y a sangre. Es la base del favicon, el avatar y los
 * íconos de la app: un logo con el nombre completo no se lee a 16 px.
 */
export function iconPrompt(o: OptionData) {
  const c = concept(o.conceptId)!
  const main = o.palette.find((p) => p.role === 'principal')?.hex ?? o.palette[0]?.hex
  const light = o.palette.find((p) => p.role === 'fondo')?.hex ?? '#ffffff'
  return `App icon and favicon for the brand "${o.brandName}": ${o.logo?.type === 'symbol' || o.logo?.type === 'combination' ? `only the symbol of this logo idea: ${o.logo?.idea || c.summary}` : `a bold monogram with the initial letter "${o.brandName.trim()[0]?.toUpperCase() ?? 'A'}"`}. Concept style: ${c.logoStyle}. One simple shape that is readable at 16 pixels, centered, filling about 70% of a square ${main} background, mark in ${light}. Flat vector, no text besides the monogram letter, no gradients, no shadows, no mockup, no rounded frame, no watermark.`
}

const initialsOf = (name: string) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()

const PLACEHOLDER_LOGO = (o: OptionData) => {
  const main = o.palette.find((p) => p.role === 'principal')?.hex ?? '#333333'
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#ffffff"/><circle cx="200" cy="170" r="110" fill="${main}"/><text x="200" y="205" font-family="sans-serif" font-size="96" font-weight="700" text-anchor="middle" fill="#ffffff">${initialsOf(o.brandName)}</text><text x="200" y="350" font-family="sans-serif" font-size="40" font-weight="700" text-anchor="middle" fill="${main}">${o.brandName.replace(/[<&]/g, '')}</text></svg>`)
}

const PLACEHOLDER_ICON = (o: OptionData) => {
  const main = o.palette.find((p) => p.role === 'principal')?.hex ?? '#333333'
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${main}"/><text x="32" y="45" font-family="sans-serif" font-size="38" font-weight="700" text-anchor="middle" fill="#ffffff">${initialsOf(o.brandName)[0] ?? 'A'}</text></svg>`)
}

export { projectDir }

async function renderBoard(o: OptionData, label: string, logo: string | undefined, icon: string | undefined) {
  const c = concept(o.conceptId)!
  const html = brandBoardHtml({ brandName: o.brandName, conceptName: c.name, tagline: o.tagline, palette: o.palette, fonts: o.fonts!, voice: o.voice ? { tone: o.voice.tone, sample: o.voice.sample } : undefined, pattern: o.pattern, logo, icon, label })
  return renderHtml(html, BOARD.w, BOARD.h)
}

const setProgress = (id: string, data: { status?: string; error?: string | null; progress?: object | null }) => db.brandProject.update({ where: { id }, data: data as never })

/** Tamaños de los íconos que ya usa el sitio (para generarlos exactos). */
const siteSizes = (found: { icons: { size?: number }[] } | null) => (found?.icons ?? []).flatMap((i) => (i.size ? [i.size] : []))

/**
 * Una ronda: 3 alternativas con su logo, su ícono y los archivos de ícono del sitio (si se pidió el logo)
 * y su lámina. Deja el estado en el proyecto para la web.
 * Sin reintentos: si falla, el error queda en el proyecto y se pide otra vez desde la web.
 */
export async function generateRound(projectId: string, opts: { logoModel?: string; notes?: string } = {}) {
  const p = await db.brandProject.findUniqueOrThrow({ where: { id: projectId }, include: { app: { select: { slug: true, name: true } }, options: { select: { conceptId: true, round: true } } } })
  const started = new Date().toISOString()
  const elements = p.elements as ElementId[]
  const withLogo = elements.includes('logo')
  const total = 1 + OPTIONS_PER_ROUND * (withLogo ? 3 : 1)
  let done = 0
  const step = () => setProgress(p.id, { progress: { started, done: ++done, total } })
  await setProgress(p.id, { status: 'running', error: null, progress: { started, done: 0, total } })
  try {
    const ctx: RoundContext = {
      brief: BriefSchema.parse(p.brief),
      found: p.found ? FoundSchema.parse(p.found) : null,
      elements,
      usedConcepts: [...new Set(p.options.map((o) => o.conceptId))],
      notes: opts.notes,
      hasReference: !!p.referencePath && existsSync(mediaPath(p.referencePath)),
    }
    const { system, user, candidates: cands } = buildIdentityPrompt(ctx)
    const images: string[] = []
    if (ctx.hasReference) images.push(await dataUri(p.referencePath!))
    if (ctx.found?.logoPath && existsSync(mediaPath(ctx.found.logoPath)) && !/\.svg$/i.test(ctx.found.logoPath)) images.push(await dataUri(ctx.found.logoPath))
    let textCost = 0
    const raw = process.env.OPENROUTER_MOCK === '1' ? mockOptions(ctx) : await completeJson({ appId: p.appId, model: p.textModel, system, user, images, purpose: `identidad de marca ${p.app.name}`, onCost: (c) => (textCost = c) })
    const options = normalizeOptions(raw, ctx, cands)
    await step()

    const round = Math.max(0, ...p.options.map((o) => o.round)) + 1
    const dir = projectDir(p.app.slug)
    const logoModel = parseLogoModel(opts.logoModel)
    const repoLogo = !withLogo && ctx.found?.logoPath && existsSync(mediaPath(ctx.found.logoPath)) ? await dataUri(ctx.found.logoPath) : undefined
    const mock = process.env.OPENROUTER_MOCK === '1'
    for (const [i, o] of options.entries()) {
      const base = `${dir}/r${round}-${i + 1}`
      let cost = textCost / OPTIONS_PER_ROUND
      let logoPath: string | undefined
      let iconPath: string | undefined
      let iconFiles: Record<string, string> | undefined
      let logo = repoLogo
      let icon: string | undefined
      if (withLogo) {
        if (mock) {
          logoPath = await saveMedia(`${base}-logo.svg`, PLACEHOLDER_LOGO(o))
          logo = await dataUri(logoPath)
        } else {
          const img = await generateImage({ appId: p.appId, model: logoModel.id, quality: logoModel.quality, prompt: logoPrompt(o), aspectRatio: '1:1', purpose: `logo ${p.app.name} (${o.conceptId})`, withText: true })
          logoPath = await saveMedia(`${base}-logo${img.mime === 'image/png' ? '.png' : '.jpg'}`, img.data)
          logo = bufferDataUri(img.data, img.mime)
          cost += img.cost
        }
        await step()
        if (mock) {
          iconPath = await saveMedia(`${base}-icono.svg`, PLACEHOLDER_ICON(o))
          icon = await dataUri(iconPath)
        } else {
          const img = await generateImage({ appId: p.appId, model: logoModel.id, quality: logoModel.quality, prompt: iconPrompt(o), aspectRatio: '1:1', purpose: `ícono ${p.app.name} (${o.conceptId})`, withText: true })
          iconPath = await saveMedia(`${base}-icono${img.mime === 'image/png' ? '.png' : '.jpg'}`, img.data)
          icon = bufferDataUri(img.data, img.mime)
          cost += img.cost
        }
        iconFiles = await renderIconSet(icon, `${base}-iconos`, siteSizes(ctx.found))
        await step()
      }
      const boardPath = await saveMedia(`${base}.jpg`, await renderBoard(o, `Alternativa ${i + 1} · ronda ${round}`, logo, icon))
      await db.brandOption.create({ data: { projectId: p.id, round, index: i, conceptId: o.conceptId, data: o as object, logoPath, iconPath, iconFiles, logoModel: withLogo ? encodeLogoModel(logoModel) : null, boardPath, costUsd: cost } })
      await step()
    }
    await setProgress(p.id, { status: 'idle', progress: null })
  } catch (e) {
    await setProgress(p.id, { status: 'error', error: (e as Error).message.slice(0, 500), progress: null })
    throw e
  } finally {
    await closeBrowser()
  }
}

/** Vuelve a dibujar la lámina (p. ej. tras vectorizar) y devuelve la ruta. */
export async function redrawBoard(option: BrandOption, project: Pick<BrandProject, 'found'> & { app: { slug: string } }) {
  const o = OptionSchema.parse(option.data)
  const found = project.found ? FoundSchema.parse(project.found) : null
  const uri = async (rel: string | null | undefined) => (rel && existsSync(mediaPath(rel)) ? dataUri(rel) : undefined)
  const logo = await uri(option.vectorPath ?? option.logoPath ?? found?.logoPath)
  const icon = await uri(option.iconVector ?? option.iconPath)
  const path = await saveMedia(`${projectDir(project.app.slug)}/r${option.round}-${option.index + 1}.jpg`, await renderBoard(o, `Alternativa ${option.index + 1} · ronda ${option.round}`, logo, icon))
  await closeBrowser()
  return path
}

/** Logo e ícono de una alternativa a SVG con Recraft V4.1 Vector (~US$ 0,08 cada uno). El estado queda en el proyecto. */
export async function vectorizeOption(optionId: string) {
  const option = await db.brandOption.findUniqueOrThrow({ where: { id: optionId }, include: { project: { include: { app: { select: { slug: true, name: true } } } } } })
  try {
    await vectorize(option)
    await setProgress(option.projectId, { status: 'idle', progress: null })
  } catch (e) {
    await setProgress(option.projectId, { status: 'error', error: `No se pudo vectorizar: ${(e as Error).message}`.slice(0, 500), progress: null })
    throw e
  }
}

async function vectorize(option: BrandOption & { project: BrandProject & { app: { slug: string; name: string } } }) {
  if (!option.logoPath || !existsSync(mediaPath(option.logoPath))) throw new Error('La alternativa no tiene logo generado')
  const o = OptionSchema.parse(option.data)
  const base = `${projectDir(option.project.app.slug)}/r${option.round}-${option.index + 1}`
  let cost = 0
  /** Un SVG por imagen: si ya es SVG (modo demo) se copia; si no, Recraft lo redibuja. */
  const toSvg = async (rel: string, what: string, placeholder: Buffer) => {
    if (process.env.OPENROUTER_MOCK === '1' || extname(rel) === '.svg') return placeholder
    const r = await vectorizeImage({ appId: option.project.appId, image: await dataUri(rel), prompt: `Faithful vector redraw of this ${what} for "${o.brandName}": same shapes, same letters, same flat colors, clean geometry.`, purpose: `vectorizar ${what} ${option.project.app.name}` })
    cost += r.cost
    return r.data
  }
  const data: { vectorPath?: string; iconVector?: string } = {}
  if (!option.vectorPath) data.vectorPath = await saveMedia(`${base}-logo.svg`, await toSvg(option.logoPath, 'logo', PLACEHOLDER_LOGO(o)))
  if (!option.iconVector && option.iconPath && existsSync(mediaPath(option.iconPath))) data.iconVector = await saveMedia(`${base}-favicon.svg`, await toSvg(option.iconPath, 'app icon', PLACEHOLDER_ICON(o)))
  const updated = await db.brandOption.update({ where: { id: option.id }, data: { ...data, costUsd: option.costUsd + cost } })
  await db.brandOption.update({ where: { id: option.id }, data: { boardPath: await redrawBoard(updated, option.project) } })
}

export { VECTOR_MODEL }
