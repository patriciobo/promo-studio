// Identidad desde un repositorio: toma colores, tipografías, logo, nombre y frase de lo que ya existe.
// Prioridad: promo.yaml (si lo tiene, ya está curado) > archivos de estilos y configuración > README.
import { extname } from 'node:path'
import { getFile, getRawBytes, getRepo, listTree } from '../github'
import { parseManifest } from '../manifest'
import { saveMedia } from '../media'
import { colorsFromText, fontsFromText, projectDir, type Found } from './brief'

const STYLE_FILES = /(^|\/)(tokens|theme|globals|variables|colors|global|main|styles?|app|index)\.(css|scss)$|(^|\/)tailwind\.config\.(js|ts|cjs|mjs)$|(^|\/)(app\/layout|src\/app\/layout|pages\/_app|pages\/_document|src\/main|src\/layouts\/[^/]+)\.(tsx|jsx|ts|astro)$|(^|\/)index\.html$/
const SKIP = /node_modules|\/dist\/|\/build\/|\.next\/|vendor\//

/** `appSlug`: la copia del logo queda en la carpeta de media de la marca de la app. */
export async function readRepoBrand(repo: string, branch: string | undefined, appSlug: string): Promise<{ found: Found; branch: string; readme: string }> {
  const info = await getRepo(repo)
  const ref = branch || info.default_branch
  const tree = await listTree(repo, ref)
  const found: Found = { colors: [], fonts: [], sources: [] }
  if (info.description) found.description = info.description
  if (info.homepage) found.homepage = info.homepage

  // 1. promo.yaml: marca ya definida para Promo Studio.
  const yaml = await getFile(repo, 'promo.yaml', ref)
  const m = yaml ? parseManifest(yaml.text) : null
  if (m?.ok) {
    found.name = m.manifest.name
    found.description = m.manifest.description ?? m.manifest.tagline
    found.tagline = m.manifest.tagline
    found.colors = m.manifest.brand.colors
    found.fonts = [m.manifest.brand.font]
    if (m.manifest.brand.logo && !/^https?:/.test(m.manifest.brand.logo)) found.logo = m.manifest.brand.logo
    found.sources.push('promo.yaml')
  }

  // 2. Estilos y configuración: colores y tipografías.
  const styleFiles = tree.filter((p) => STYLE_FILES.test(p) && !SKIP.test(p)).slice(0, 10)
  let styles = ''
  for (const p of styleFiles) styles += `\n${(await getFile(repo, p, ref))?.text.slice(0, 40000) ?? ''}`
  const pkg = await getFile(repo, 'package.json', ref)
  if (!found.fonts.length || found.fonts[0] === 'Inter') {
    const fonts = fontsFromText(`${pkg?.text ?? ''}\n${styles}`)
    if (fonts.length) {
      found.fonts = [...new Set([...fonts, ...found.fonts])].slice(0, 4)
      found.sources.push('tipografías de package.json y estilos')
    }
  }
  if (found.colors.length < 2) {
    found.colors = colorsFromText(styles, 6)
    if (found.colors.length) found.sources.push(`colores de ${styleFiles.length} archivos de estilos`)
  }

  // 3. Logo: el del promo.yaml o el ícono más probable del repo.
  if (!found.logo) {
    const icons = tree.filter((p) => /(logo|isotipo|brand|icon|favicon)[^/]*\.(svg|png|webp|jpe?g)$/i.test(p) && !SKIP.test(p))
    icons.sort((a, b) => Number(/logo/i.test(b)) - Number(/logo/i.test(a)) || Number(/\.svg$|512/.test(b)) - Number(/\.svg$|512/.test(a)))
    if (icons[0]) found.logo = icons[0]
  }
  if (found.logo) {
    const bytes = await getRawBytes(repo, found.logo, ref)
    if (bytes) {
      found.logoPath = await saveMedia(`${projectDir(appSlug)}/repo-logo${extname(found.logo).toLowerCase()}`, bytes)
      found.sources.push(`logo: ${found.logo}`)
    } else delete found.logo
  }

  // 4. Nombre y descripción del package.json o del README.
  const readme = (await getFile(repo, tree.find((p) => /^readme\.md$/i.test(p)) ?? 'README.md', ref))?.text ?? ''
  if (!found.name) {
    const title = readme.match(/^#\s+(.+)$/m)?.[1]?.trim()
    const pkgName = pkg ? (JSON.parse(pkg.text) as { name?: string }).name : undefined
    found.name = title ?? pkgName ?? repo.split('/').pop()
  }
  if (!found.description) found.description = readme.replace(/^#.*$/m, '').trim().split('\n\n')[0]?.slice(0, 400) || undefined
  return { found, branch: ref, readme: readme.slice(0, 4000) }
}
