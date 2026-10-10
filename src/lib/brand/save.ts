// Guarda la alternativa elegida en el repositorio de la app: logo, lámina, guía de marca y promo.yaml actualizado.
// GitHub: pull request (por defecto) o commit directo en la rama. Repo local (file:): escribe los archivos en disco.
import type { App, BrandOption, BrandProject } from '@prisma/client'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { db } from '../db'
import { commitFiles, getFile, isLocalRepo, openPullRequest, writeLocalFiles } from '../github'
import { setYamlBrand, type BrandPatch } from '../manifest'
import { mediaPath } from '../media'
import { syncApp } from '../pipeline'
import { concept } from './concepts'
import { OptionSchema, type OptionData } from './generate'

/** Carpeta del repo donde quedan los archivos de la marca. */
export const REPO_DIR = '.promo/marca'

/** Qué del promo.yaml se puede actualizar con la alternativa. */
export const YAML_FIELDS = [
  { id: 'colors', label: 'Colores', hint: 'brand.colors: principal, fondo, texto y acento' },
  { id: 'font', label: 'Tipografía', hint: 'brand.font: la de las piezas de Instagram' },
  { id: 'logo', label: 'Logo', hint: `brand.logo: ${REPO_DIR}/logo` },
  { id: 'tagline', label: 'Frase', hint: 'tagline' },
  { id: 'tone', label: 'Tono de voz', hint: 'tone' },
  { id: 'name', label: 'Nombre', hint: 'name (sólo si se propusieron nombres)' },
] as const
export type YamlField = (typeof YAML_FIELDS)[number]['id']

/** Campos que tiene sentido actualizar con esta alternativa (lo que se generó). */
export function availableFields(o: OptionData, option: Pick<BrandOption, 'logoPath' | 'vectorPath'>, elements: string[]): YamlField[] {
  const out: YamlField[] = []
  if (elements.includes('paleta')) out.push('colors')
  if (elements.includes('tipografia')) out.push('font')
  if (option.logoPath || option.vectorPath) out.push('logo')
  if (elements.includes('tagline') && o.tagline) out.push('tagline')
  if (o.voice?.tone) out.push('tone')
  if (o.names.length) out.push('name')
  return out
}

/** Colores en el orden que usa Promo Studio: principal, fondo, texto, acento y apoyo (máximo 5). */
export function yamlColors(o: OptionData) {
  const order = ['principal', 'fondo', 'texto', 'acento', 'apoyo']
  return [...o.palette].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role)).map((p) => p.hex.toLowerCase()).slice(0, 5)
}

/** Lo que se cambia en el promo.yaml según los campos elegidos. `font`: la de títulos o la de textos. */
export function brandPatch(o: OptionData, fields: YamlField[], logoRepoPath: string | null, font: 'display' | 'text'): BrandPatch {
  const patch: BrandPatch = {}
  if (fields.includes('colors') && o.palette.length >= 2) patch.colors = yamlColors(o)
  if (fields.includes('font') && o.fonts) patch.font = font === 'display' ? o.fonts.display : o.fonts.text
  if (fields.includes('logo') && logoRepoPath) patch.logo = logoRepoPath
  if (fields.includes('tagline') && o.tagline) patch.tagline = o.tagline
  if (fields.includes('tone') && o.voice?.tone) patch.tone = o.voice.tone
  if (fields.includes('name') && o.brandName) patch.name = o.brandName
  return patch
}

/** Guía de marca legible (MARCA.md) para el equipo y para quien diseñe después. */
export function brandGuide(o: OptionData, appName: string, logoFile: string | null) {
  const c = concept(o.conceptId)
  const lines = [
    `# Identidad de marca: ${o.brandName}`,
    '',
    `Generada con Promo Studio para ${appName}. Concepto: **${c?.name ?? o.conceptId}** (${c?.origin ?? ''}).`,
    '',
    o.rationale,
    '',
    ...(o.tagline ? ['## Frase', '', `> ${o.tagline}`, ''] : []),
    ...(logoFile ? ['## Logo', '', `![Logo](${logoFile})`, '', o.logo?.idea ? `${o.logo.idea}` : '', ''] : []),
    '## Paleta',
    '',
    '| Color | Hex | Rol |',
    '|---|---|---|',
    ...o.palette.map((p) => `| ${p.name || '—'} | \`${p.hex}\` | ${p.role} |`),
    '',
    ...(o.fonts ? ['## Tipografías', '', `- Títulos: **${o.fonts.display}** (Google Fonts)`, `- Textos: **${o.fonts.text}** (Google Fonts)`, ''] : []),
    ...(o.voice
      ? ['## Tono de voz', '', o.voice.tone, '', ...(o.voice.do.length ? ['Sí:', ...o.voice.do.map((x) => `- ${x}`), ''] : []), ...(o.voice.dont.length ? ['No:', ...o.voice.dont.map((x) => `- ${x}`), ''] : []), `Ejemplo: "${o.voice.sample}"`, '']
      : []),
    ...(o.pattern !== 'ninguno' ? ['## Gráfico de apoyo', '', `Patrón: ${o.pattern}, con el color de acento sobre el fondo.`, ''] : []),
    '![Lámina](lamina.jpg)',
    '',
  ]
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')
}

export interface SaveOptions {
  fields: YamlField[]
  font: 'display' | 'text'
  /** pr (por defecto) o commit directo en la rama de la app. Ignorado en repos locales. */
  mode: 'pr' | 'commit'
}

/** Archivos a escribir en el repo y el promo.yaml nuevo (si existe). */
export async function repoFiles(app: Pick<App, 'name' | 'repo' | 'branch' | 'manifestPath'>, option: BrandOption, opts: SaveOptions) {
  const o = OptionSchema.parse(option.data)
  const files: { path: string; content: Buffer | string }[] = []
  // Logo: el SVG vectorizado si existe; si no, el generado.
  const logoSrc = option.vectorPath ?? option.logoPath
  let logoRepoPath: string | null = null
  if (logoSrc && existsSync(mediaPath(logoSrc))) {
    logoRepoPath = `${REPO_DIR}/logo${extname(logoSrc)}`
    files.push({ path: logoRepoPath, content: await readFile(mediaPath(logoSrc)) })
    if (option.vectorPath && option.logoPath && existsSync(mediaPath(option.logoPath))) files.push({ path: `${REPO_DIR}/logo-original${extname(option.logoPath)}`, content: await readFile(mediaPath(option.logoPath)) })
  }
  if (option.boardPath && existsSync(mediaPath(option.boardPath))) files.push({ path: `${REPO_DIR}/lamina.jpg`, content: await readFile(mediaPath(option.boardPath)) })
  files.push({ path: `${REPO_DIR}/marca.json`, content: `${JSON.stringify({ generatedBy: 'Promo Studio', concept: o.conceptId, ...o, logo: logoRepoPath ? { ...o.logo, file: logoRepoPath } : o.logo }, null, 2)}\n` })
  files.push({ path: `${REPO_DIR}/MARCA.md`, content: brandGuide(o, app.name, logoRepoPath ? `logo${extname(logoRepoPath)}` : null) })
  // promo.yaml: sólo si existe (si no, se crea con el asistente de la pestaña promo.yaml).
  const yaml = await getFile(app.repo, app.manifestPath, app.branch)
  const patch = brandPatch(o, opts.fields, logoRepoPath, opts.font)
  let yamlChanged = false
  if (yaml && Object.keys(patch).length) {
    const next = setYamlBrand(yaml.text, patch)
    if (next !== yaml.text) {
      files.push({ path: app.manifestPath, content: next })
      yamlChanged = true
    }
  }
  return { files, patch, yamlChanged, hasYaml: !!yaml, option: o }
}

/** Guarda la alternativa en el repo y deja registrado dónde. Después sincroniza la app si cambió el promo.yaml. */
export async function saveBrandToRepo(project: BrandProject & { app: App }, optionId: string, opts: SaveOptions): Promise<{ url?: string; written?: string; yamlChanged: boolean; hasYaml: boolean }> {
  const option = await db.brandOption.findFirstOrThrow({ where: { id: optionId, projectId: project.id } })
  const { app } = project
  const { files, yamlChanged, hasYaml, option: o } = await repoFiles(app, option, opts)
  const c = concept(o.conceptId)
  const title = `Identidad de marca: ${o.title || c?.name} (Promo Studio)`
  const body = `Identidad elegida en Promo Studio (concepto ${c?.name ?? o.conceptId}, ronda ${option.round}).\n\n- \`${REPO_DIR}/\`: logo, lámina, guía (MARCA.md) y datos (marca.json).\n${yamlChanged ? `- \`${app.manifestPath}\`: ${Object.keys(brandPatch(o, opts.fields, 'logo', opts.font)).join(', ')} actualizados con la nueva marca.\n` : ''}`
  let url: string | undefined
  let written: string | undefined
  if (isLocalRepo(app.repo)) written = await writeLocalFiles(app.repo, files)
  else if (opts.mode === 'commit') url = await commitFiles(app.repo, app.branch, files, title)
  else url = await openPullRequest(app.repo, app.branch, `promo-studio/marca-${Date.now().toString(36)}`, files, title, body)
  await db.brandProject.update({ where: { id: project.id }, data: { savedOptionId: optionId, savedAt: new Date(), savedUrl: url ?? null, chosenId: optionId } })
  // Con PR el promo.yaml cambia recién al aprobarlo; con commit o repo local, ya.
  if (yamlChanged && (written || opts.mode === 'commit')) await syncApp(app.id).catch(() => null)
  return { url, written, yamlChanged, hasYaml }
}
