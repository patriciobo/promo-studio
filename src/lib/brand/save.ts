// Guarda la alternativa elegida en el repositorio de la app, sólo con archivos que tienen un uso concreto:
// el logo que referencia el promo.yaml, los íconos que el sitio ya usa, el promo.yaml y, si se pide, la guía.
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
import { FoundSchema, type Found } from './brief'
import { concept } from './concepts'
import { iconSource, planFiles, REPO_DIR, type YamlField } from './plan'

export { REPO_DIR, YAML_FIELDS, planFiles, type YamlField } from './plan'
import { OptionSchema, type OptionData } from './generate'

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
  ]
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')
}

export interface SaveOptions {
  fields: YamlField[]
  font: 'display' | 'text'
  /** pr (por defecto) o commit directo en la rama de la app. Ignorado en repos locales. */
  mode: 'pr' | 'commit'
  /** Íconos del sitio a reemplazar (rutas detectadas en el repo). */
  icons: string[]
  /** Escribir la guía de marca (MARCA.md). */
  guide: boolean
}

/** Contenido de los archivos planeados y el promo.yaml nuevo (si existe y cambia). */
export async function repoFiles(app: Pick<App, 'name' | 'repo' | 'branch' | 'manifestPath'>, found: Found | null, option: BrandOption, opts: SaveOptions) {
  const o = OptionSchema.parse(option.data)
  const yaml = await getFile(app.repo, app.manifestPath, app.branch)
  const plan = planFiles(app, found, option, opts, !!yaml)
  const read = (rel: string) => readFile(mediaPath(rel))
  const out: { path: string; content: Buffer | string }[] = []
  const logoSrc = option.vectorPath ?? option.logoPath
  if (plan.logoRepoPath && logoSrc && existsSync(mediaPath(logoSrc))) out.push({ path: plan.logoRepoPath, content: await read(logoSrc) })
  for (const icon of found?.icons ?? []) {
    if (!plan.files.some((f) => f.path === icon.path)) continue
    const src = iconSource(icon, option)
    if ('rel' in src && existsSync(mediaPath(src.rel))) out.push({ path: icon.path, content: await read(src.rel) })
  }
  const patch = brandPatch(o, opts.fields, plan.logoRepoPath, opts.font)
  let yamlChanged = false
  if (yaml && Object.keys(patch).length) {
    const next = setYamlBrand(yaml.text, patch)
    if (next !== yaml.text) {
      out.push({ path: app.manifestPath, content: next })
      yamlChanged = true
    }
  }
  if (opts.guide) out.push({ path: `${REPO_DIR}/MARCA.md`, content: brandGuide(o, app.name, plan.logoRepoPath ? `logo${extname(plan.logoRepoPath)}` : null) })
  return { files: out, blocked: plan.blocked, patch, yamlChanged, hasYaml: !!yaml, option: o }
}

/** Guarda la alternativa en el repo y deja registrado dónde. Después sincroniza la app si cambió el promo.yaml. */
export async function saveBrandToRepo(project: BrandProject & { app: App }, optionId: string, opts: SaveOptions): Promise<{ url?: string; written?: string; yamlChanged: boolean; hasYaml: boolean; paths: string[] }> {
  const option = await db.brandOption.findFirstOrThrow({ where: { id: optionId, projectId: project.id } })
  const { app } = project
  const found = project.found ? FoundSchema.parse(project.found) : null
  const { files, blocked, yamlChanged, hasYaml, option: o } = await repoFiles(app, found, option, opts)
  if (blocked.length) throw new Error(blocked.map((b) => `${b.path}: ${b.why}`).join('; '))
  if (!files.length) throw new Error('No hay nada para guardar: marcá al menos un campo, un ícono o la guía.')
  const c = concept(o.conceptId)
  const title = `Identidad de marca: ${o.title || c?.name} (Promo Studio)`
  const body = `Identidad elegida en Promo Studio (concepto ${c?.name ?? o.conceptId}, ronda ${option.round}). Archivos:\n\n${files.map((f) => `- \`${f.path}\``).join('\n')}\n\nNingún otro archivo cambia.${yamlChanged ? ` En \`${app.manifestPath}\` sólo cambian los valores elegidos; comentarios y formato quedan igual.` : ''}`
  let url: string | undefined
  let written: string | undefined
  if (isLocalRepo(app.repo)) written = await writeLocalFiles(app.repo, files)
  else if (opts.mode === 'commit') url = await commitFiles(app.repo, app.branch, files, title)
  else url = await openPullRequest(app.repo, app.branch, `promo-studio/marca-${Date.now().toString(36)}`, files, title, body)
  await db.brandProject.update({ where: { id: project.id }, data: { savedOptionId: optionId, savedAt: new Date(), savedUrl: url ?? null, chosenId: optionId } })
  // Con PR el promo.yaml cambia recién al aprobarlo; con commit o repo local, ya.
  if (yamlChanged && (written || opts.mode === 'commit')) await syncApp(app.id).catch(() => null)
  return { url, written, yamlChanged, hasYaml, paths: files.map((f) => f.path) }
}
