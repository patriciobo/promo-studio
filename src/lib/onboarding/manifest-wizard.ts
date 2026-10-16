// Asistente de promo.yaml: lee el repo (o una descripción del negocio, sin repo), le pide al modelo de texto un borrador y lo valida.
import type { App } from '@prisma/client'
import { writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { db } from '../db'
import { getFile, getRawBytes, getRepo, listTree, openPullRequest } from '../github'
import { ManifestSchema, manifestToYaml, setYamlStyle, type Manifest } from '../manifest'
import { completeJson } from '../openrouter'
import type { DesignStyleId } from '../styles'

const CANDIDATE_FILES = ['README.md', 'readme.md', 'package.json', 'public/llms.txt', 'llms.txt', 'public/manifest.json', 'public/manifest.webmanifest', 'app.json', 'capacitor.config.json']

/** Junta lo que sirve del repo para describir la app (sin leer todo el código). */
export async function repoContext(repo: string) {
  const info = await getRepo(repo)
  const branch = info.default_branch
  const tree = await listTree(repo, branch)
  const pick = (re: RegExp) => tree.filter((p) => re.test(p) && !/node_modules|\/dist\//.test(p))
  const files: Record<string, string> = {}
  for (const f of CANDIDATE_FILES.concat(pick(/(^|\/)(README|readme)\.md$/).slice(0, 3))) {
    const hit = tree.find((p) => p === f || p.endsWith(`/${f}`))
    if (hit && !files[hit]) {
      const r = await getFile(repo, hit, branch)
      if (r) files[hit] = r.text.slice(0, 6000)
    }
  }
  // Colores: variables CSS con hex en hojas de estilo de tokens/temas.
  const cssFiles = pick(/(tokens|theme|globals|variables|colors)\.(css|scss)$/).slice(0, 3)
  const colors = new Set<string>()
  for (const f of cssFiles) {
    const r = await getFile(repo, f, branch)
    for (const m of r?.text.matchAll(/#[0-9a-fA-F]{6}\b/g) ?? []) colors.add(m[0].toLowerCase())
  }
  const icons = pick(/(icon|logo|favicon)[^/]*\.(svg|png)$/i).sort((a, b) => Number(/logo/i.test(b)) - Number(/logo/i.test(a)) || Number(/512|svg/.test(b)) - Number(/512|svg/.test(a)))
  const screenshots = pick(/(screenshot|screens?|shots?|landing)[^/]*\/[^/]+\.(png|jpe?g|webp)$/i).slice(0, 6)
  return { repo, branch, homepage: info.homepage, description: info.description, topics: info.topics ?? [], files, colors: [...colors].slice(0, 12), icons: icons.slice(0, 5), screenshots }
}

export type RepoContext = Awaited<ReturnType<typeof repoContext>>

export async function draftManifest(ctx: RepoContext, textModel: string, language = 'es'): Promise<{ manifest: Manifest | null; yaml: string; error?: string }> {
  return draft(ctx, textModel, language, 'repo', ctx.repo)
}

/**
 * Borrador para una cuenta sin repositorio: sale de lo que el usuario escribió sobre el negocio.
 * `igUsername`: para la URL si el negocio no tiene sitio.
 */
export async function draftManifestFromText(description: string, textModel: string, opts: { name?: string; igUsername?: string | null; language?: string } = {}) {
  const fallbackUrl = opts.igUsername ? `https://instagram.com/${opts.igUsername}` : 'https://instagram.com'
  const ctx = { businessName: opts.name || undefined, description, urlIfNoWebsite: fallbackUrl, colors: [] as string[], icons: [] as string[], screenshots: [] as string[] }
  return draft(ctx, textModel, opts.language ?? 'es', 'description', opts.name || 'descripción', fallbackUrl)
}

type DraftContext = { colors: string[]; icons: string[]; screenshots: string[] } & Record<string, unknown>

async function draft(ctx: DraftContext, textModel: string, language: string, from: 'repo' | 'description', label: string, fallbackUrl?: string): Promise<{ manifest: Manifest | null; yaml: string; error?: string }> {
  const faithful =
    from === 'repo'
      ? 'Be concrete and faithful to the repo; do not invent features.'
      : `The input is a free-text description of a business written by its owner or agency (there is no code repository). Be concrete and faithful to it: "features" are the products, services or benefits it mentions; never invent prices, figures, clients or awards. "url": the website if the description gives one, otherwise "${fallbackUrl}". Leave "logo" and "screenshots" empty. If no colors are mentioned, propose 2-3 that fit the business.`
  const system = `You write promo.yaml manifests that describe an app for an Instagram marketing service. Answer only JSON matching this shape:
{"name":string,"url":string,"tagline":string(<=120),"description":string,"category":string,"audience":{"countries":[ISO2],"age":[min,max],"interests":[string],"description":string},"languages":[string],"tone":string,"brand":{"colors":["#rrggbb" x2-5, first is the main brand color],"font":string,"logo":string},"features":[string],"screenshots":[string],"pillars":[string x3-5],"hashtags":[string x5-10],"avoid":[string],"cta":string,"links":[{"label":string,"url":string}]}
User-facing texts in ${language}. ${faithful} Pillars are recurring content themes useful for the audience (education, product, community, news…). "avoid" lists claims that would break ad policies or the brand.`
  // Modo demo (OPENROUTER_MOCK=1) con una descripción: un manifiesto mínimo con el texto, sin llamar al modelo.
  const mock = from === 'description' && process.env.OPENROUTER_MOCK === '1'
  const raw = mock
    ? { name: label, url: fallbackUrl, tagline: String(ctx.description).split(/[.\n]/)[0].slice(0, 120).padEnd(3, '.'), description: String(ctx.description).slice(0, 1200), languages: [language], brand: {}, features: [String(ctx.description).slice(0, 200)] }
    : await completeJson<Record<string, unknown>>({ appId: null, model: textModel, system, user: JSON.stringify(ctx), purpose: `asistente promo.yaml ${label}` })
  if (!raw.brand || typeof raw.brand !== 'object') raw.brand = {}
  const brand = raw.brand as Record<string, unknown>
  if (!Array.isArray(brand.colors) || brand.colors.length < 2) brand.colors = ctx.colors.slice(0, 3).length >= 2 ? ctx.colors.slice(0, 3) : ['#1c6a4e', '#f6f6f3', '#17191b']
  if (!brand.logo && ctx.icons[0]) brand.logo = ctx.icons[0]
  if (!Array.isArray(raw.screenshots) || !raw.screenshots.length) raw.screenshots = ctx.screenshots
  if (fallbackUrl && (typeof raw.url !== 'string' || !URL.canParse(raw.url))) raw.url = fallbackUrl
  const r = ManifestSchema.safeParse(raw)
  if (!r.success) return { manifest: null, yaml: manifestToYaml(raw as never), error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
  return { manifest: r.data, yaml: manifestToYaml(r.data) }
}

/** Abre un PR con promo.yaml y copia el logo a .promo/ si venía de otra ruta. */
export async function proposeManifestPR(appId: string, yaml: string, extra: { path: string; content: Buffer }[] = []) {
  const app = await db.app.findUniqueOrThrow({ where: { id: appId } })
  if (!app.repo) throw new Error('La cuenta no tiene repositorio')
  const branch = `promo-studio/manifest-${Date.now().toString(36)}`
  return openPullRequest(
    app.repo,
    app.branch,
    branch,
    [{ path: app.manifestPath, content: yaml }, ...extra],
    'Agregar promo.yaml para Promo Studio',
    'Manifiesto generado por el asistente de Promo Studio: describe la app, su público, su marca y los temas de contenido para Instagram. Revisalo antes de aprobar.',
  )
}

export async function logoFromRepo(repo: string, path: string, branch?: string) {
  const b = await getRawBytes(repo, path, branch)
  return b ? { path: `.promo/logo${extname(path)}`, content: b } : null
}

/**
 * Guarda el estilo de diseño en el promo.yaml del repo: en un repo local escribe el archivo; en GitHub abre un PR
 * (el resto del yaml queda igual, con sus comentarios).
 */
export async function proposeStyleChange(app: Pick<App, 'id' | 'repo' | 'branch' | 'manifestPath' | 'manifestYaml'>, style: DesignStyleId, label: string): Promise<{ url?: string; written?: string }> {
  // Sin repositorio: se cambia el promo.yaml guardado en la base.
  if (!app.repo) {
    if (!app.manifestYaml) throw new Error('Todavía no hay promo.yaml')
    const yaml = setYamlStyle(app.manifestYaml, style)
    if (yaml === app.manifestYaml) return {}
    await db.app.update({ where: { id: app.id }, data: { manifestYaml: yaml } })
    return { written: 'promo.yaml' }
  }
  const file = await getFile(app.repo, app.manifestPath, app.branch)
  if (!file) throw new Error(`No existe ${app.manifestPath} en el repo`)
  const yaml = setYamlStyle(file.text, style)
  if (yaml === file.text) return {}
  if (app.repo.startsWith('file:')) {
    const path = join(app.repo.slice(5), app.manifestPath)
    await writeFile(path, yaml)
    return { written: path }
  }
  const url = await openPullRequest(app.repo, app.branch, `promo-studio/estilo-${style}-${Date.now().toString(36)}`, [{ path: app.manifestPath, content: yaml }], `promo.yaml: estilo de diseño "${label}"`, `Cambia \`brand.style\` a \`${style}\` (${label}), elegido en Ajustes de Promo Studio. Define la plantilla de las piezas y la estética de las imágenes.`)
  return { url }
}
