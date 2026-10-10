// Qué archivos se escriben en el repo al guardar una identidad. Sin dependencias de servidor: lo usa también
// el formulario para mostrar, mientras marcás, la lista exacta de archivos que se crean o reemplazan.
import type { BrandOption } from '@prisma/client'
import type { Found } from './brief'
import type { SiteIcon } from './icons'

const extname = (p: string) => p.slice(p.lastIndexOf('.'))

/** Carpeta del repo donde quedan los archivos de la marca. */
export const REPO_DIR = '.promo/marca'

/** Qué del promo.yaml se puede actualizar con la alternativa. */
export const YAML_FIELDS = [
  { id: 'colors', label: 'Colores', hint: 'brand.colors: principal, fondo, texto y acento' },
  { id: 'font', label: 'Tipografía', hint: 'brand.font: la de las piezas de Instagram' },
  { id: 'logo', label: 'Logo', hint: `brand.logo: escribe ${REPO_DIR}/logo` },
  { id: 'tagline', label: 'Frase', hint: 'tagline' },
  { id: 'tone', label: 'Tono de voz', hint: 'tone' },
  { id: 'name', label: 'Nombre', hint: 'name (sólo si se propusieron nombres)' },
] as const
export type YamlField = (typeof YAML_FIELDS)[number]['id']

export type PlannedFile = { path: string; action: 'crea' | 'reemplaza'; why: string }
export type BlockedFile = { path: string; why: string }
type IconSource = Pick<BrandOption, 'iconVector' | 'iconFiles'>

/** De qué archivo generado sale el reemplazo de un ícono del sitio (mismo formato y tamaño), o por qué no se puede. */
export function iconSource(icon: SiteIcon, option: IconSource): { rel: string } | { why: string } {
  const files = (option.iconFiles as Record<string, string> | null) ?? {}
  if (icon.format === 'svg') return option.iconVector ? { rel: option.iconVector } : { why: 'hace falta vectorizar el ícono para el SVG' }
  if (icon.format === 'ico') return files.ico ? { rel: files.ico } : { why: 'la alternativa no tiene ícono generado' }
  if (!icon.size) return { why: 'no pude leer el tamaño del PNG actual' }
  return files[String(icon.size)] ? { rel: files[String(icon.size)] } : { why: `no hay versión de ${icon.size} px (generá otra ronda)` }
}

/**
 * Qué se va a escribir en el repo, sin leer nada: sólo archivos con un uso concreto.
 * - El logo, sólo si el promo.yaml lo va a referenciar.
 * - Los íconos que el sitio ya usa, en la misma ruta, formato y tamaño.
 * - El promo.yaml, con sólo los campos elegidos.
 * - La guía MARCA.md, sólo si se pide.
 * Nada más del repo cambia (la lámina se descarga desde Promo Studio).
 */
export function planFiles(app: { manifestPath: string }, found: Found | null, option: Pick<BrandOption, 'logoPath' | 'vectorPath'> & IconSource, opts: { fields: YamlField[]; icons: string[]; guide: boolean }, hasYaml = true) {
  const files: PlannedFile[] = []
  const blocked: BlockedFile[] = []
  const logoSrc = option.vectorPath ?? option.logoPath
  const logoRepoPath = opts.fields.includes('logo') && logoSrc ? `${REPO_DIR}/logo${extname(logoSrc)}` : null
  if (logoRepoPath) files.push({ path: logoRepoPath, action: found?.logo === logoRepoPath ? 'reemplaza' : 'crea', why: 'brand.logo del promo.yaml: lo usan las piezas de Instagram' })
  for (const path of opts.icons) {
    const icon = found?.icons.find((i) => i.path === path)
    if (!icon) continue
    const src = iconSource(icon, option)
    if ('why' in src) blocked.push({ path, why: src.why })
    else files.push({ path, action: 'reemplaza', why: `ícono del sitio (${icon.format}${icon.size ? `, ${icon.size} px` : ''})` })
  }
  const yamlFields = opts.fields.filter((f) => f !== 'logo' || logoRepoPath)
  if (hasYaml && yamlFields.length) files.push({ path: app.manifestPath, action: 'reemplaza', why: `sólo ${yamlFields.map((f) => YAML_FIELDS.find((y) => y.id === f)!.hint.split(':')[0]).join(', ')}` })
  if (opts.guide) files.push({ path: `${REPO_DIR}/MARCA.md`, action: 'crea', why: 'guía de marca para el equipo' })
  return { files, blocked, logoRepoPath }
}

