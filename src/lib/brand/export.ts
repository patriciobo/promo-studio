// Exporta una alternativa de identidad para construir con ella un sitio institucional: los archivos de marca
// y su especificación sin ambigüedades (marca.json, tokens.css, design-tokens.json y DESIGN.md con las reglas de uso).
import type { App, BrandOption, BrandProject } from '@prisma/client'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { lum } from '@/templates/brand'
import type { Manifest } from '../manifest'
import { mediaPath } from '../media'
import type { ZipEntry } from '../zip'
import { BriefSchema, type Brief } from './brief'
import { concept } from './concepts'
import { OptionSchema, type OptionData } from './generate'

type Role = OptionData['palette'][number]['role']

/** Contraste WCAG entre dos colores (1 a 21). */
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

/** Color para escribir sobre `hex`: uno de la paleta si llega a 4.5:1 (el de más contraste); si no, blanco o negro. */
export function onColor(hex: string, candidates: string[]) {
  const best = (list: string[]) => [...list].sort((a, b) => contrast(hex, b) - contrast(hex, a))[0]
  const own = candidates.filter((c) => contrast(hex, c) >= 4.5)
  return own.length ? best(own) : best([...candidates, '#ffffff', '#000000'])
}

export interface BrandSpec {
  name: string
  tagline: string
  concept: { id: string; name: string; origin: string }
  rationale: string
  colors: Record<Role, string> & { sobrePrincipal: string }
  palette: { role: Role; name: string; hex: string; rgb: number[] }[]
  contrast: { textoSobreFondo: number; principalSobreFondo: number; acentoSobreFondo: number; sobrePrincipal: number }
  fonts: { display: string; text: string }
  voice: OptionData['voice'] | null
  logo: { type: string; idea: string } | null
  pattern: string
}

export function brandSpec(o: OptionData): BrandSpec {
  const role = (r: Role) => o.palette.find((p) => p.role === r)?.hex.toLowerCase()
  const fondo = role('fondo') ?? '#ffffff'
  const texto = role('texto') ?? onColor(fondo, [])
  const principal = role('principal') ?? o.palette[0]?.hex.toLowerCase() ?? texto
  const acento = role('acento') ?? principal
  const apoyo = role('apoyo') ?? acento
  const sobrePrincipal = onColor(principal, [fondo, texto])
  const c = concept(o.conceptId)
  return {
    name: o.brandName,
    tagline: o.tagline,
    concept: { id: o.conceptId, name: c?.name ?? o.conceptId, origin: c?.origin ?? '' },
    rationale: o.rationale,
    colors: { principal, fondo, texto, acento, apoyo, sobrePrincipal },
    palette: o.palette.map((p) => ({ role: p.role, name: p.name, hex: p.hex.toLowerCase(), rgb: rgb(p.hex) })),
    contrast: { textoSobreFondo: contrast(texto, fondo), principalSobreFondo: contrast(principal, fondo), acentoSobreFondo: contrast(acento, fondo), sobrePrincipal: contrast(sobrePrincipal, principal) },
    fonts: { display: o.fonts?.display ?? 'Inter', text: o.fonts?.text ?? 'Inter' },
    voice: o.voice ?? null,
    logo: o.logo ? { type: o.logo.type, idea: o.logo.idea } : null,
    pattern: o.pattern,
  }
}

/** Escala tipográfica fija para la web (rem, fluida entre móvil y escritorio). */
export const TYPE_SCALE = {
  h1: 'clamp(2.5rem, 1.6rem + 3.6vw, 4.5rem)',
  h2: 'clamp(2rem, 1.5rem + 2vw, 3rem)',
  h3: 'clamp(1.5rem, 1.3rem + 0.8vw, 2rem)',
  body: '1.0625rem',
  small: '0.875rem',
} as const

const familyParam = (f: string) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}`

/**
 * URL de Google Fonts que carga sin error: prueba los pesos de más a menos (si una familia no tiene uno,
 * Google rechaza todo el pedido). Sin red, devuelve la de 400 y 700.
 */
export async function googleFontsUrl(fonts: string[], fetcher: typeof fetch = fetch) {
  const parts: string[] = []
  for (const f of [...new Set(fonts)]) {
    let pick = `${familyParam(f)}:wght@400;700`
    for (const w of [':wght@400;500;600;700', ':wght@400;700', '']) {
      const ok = await fetcher(`https://fonts.googleapis.com/css2?${familyParam(f)}${w}&display=swap`, { signal: AbortSignal.timeout(4000) })
        .then((r) => r.ok)
        .catch(() => null)
      if (ok === null) break
      if (ok) {
        pick = `${familyParam(f)}${w}`
        break
      }
    }
    parts.push(pick)
  }
  return `https://fonts.googleapis.com/css2?${parts.join('&')}&display=swap`
}

const fallback = (f: string) => (/serif|garamond|playfair|lora|merriweather|fraunces|baskerville|caslon|bodoni|crimson|cormorant/i.test(f) && !/sans/i.test(f) ? 'serif' : 'sans-serif')

export function tokensCss(s: BrandSpec, fontsUrl: string) {
  const vars = [
    ...Object.entries(s.colors).map(([k, v]) => `  --color-${k === 'sobrePrincipal' ? 'sobre-principal' : k}: ${v};`),
    `  --font-display: "${s.fonts.display}", ${fallback(s.fonts.display)};`,
    `  --font-text: "${s.fonts.text}", ${fallback(s.fonts.text)};`,
    ...Object.entries(TYPE_SCALE).map(([k, v]) => `  --text-${k}: ${v};`),
    '  --leading-body: 1.6;',
    '  --leading-heading: 1.1;',
  ]
  return `/* ${s.name}: tokens de marca generados por Promo Studio. Usar estas variables; no inventar colores ni tipografías. */
@import url("${fontsUrl}");

:root {
${vars.join('\n')}
}

body { background: var(--color-fondo); color: var(--color-texto); font-family: var(--font-text); font-size: var(--text-body); line-height: var(--leading-body); }
h1, h2, h3 { font-family: var(--font-display); line-height: var(--leading-heading); }
h1 { font-size: var(--text-h1); }
h2 { font-size: var(--text-h2); }
h3 { font-size: var(--text-h3); }
.btn-primary { background: var(--color-principal); color: var(--color-sobre-principal); }
`
}

/** Mismos valores en el formato de Design Tokens (W3C DTCG), para Figma, Style Dictionary o Tailwind. */
export function designTokens(s: BrandSpec) {
  return {
    color: Object.fromEntries(Object.entries(s.colors).map(([k, v]) => [k, { $type: 'color', $value: v }])),
    font: {
      display: { $type: 'fontFamily', $value: [s.fonts.display, fallback(s.fonts.display)] },
      text: { $type: 'fontFamily', $value: [s.fonts.text, fallback(s.fonts.text)] },
    },
    size: Object.fromEntries(Object.entries(TYPE_SCALE).map(([k, v]) => [k, { $type: 'dimension', $value: v }])),
  }
}

/** Archivos de la alternativa que existen en disco, con su nombre dentro del ZIP. */
export function assetList(option: Pick<BrandOption, 'logoPath' | 'vectorPath' | 'iconPath' | 'iconVector' | 'iconFiles' | 'boardPath'>) {
  const out: { zip: string; rel: string; what: string }[] = []
  const add = (zip: string, rel: string | null | undefined, what: string) => rel && existsSync(mediaPath(rel)) && out.push({ zip, rel, what })
  add('logo/logo.svg', option.vectorPath, 'Logo vectorial: el que va en el sitio (header y footer).')
  if (option.logoPath && !option.logoPath.endsWith('.svg')) add(`logo/logo${extname(option.logoPath) || '.png'}`, option.logoPath, 'Logo en alta (imagen): para redes y para cuando no se pueda usar el SVG.')
  else add('logo/logo.svg', option.logoPath, 'Logo vectorial: el que va en el sitio (header y footer).')
  add(`logo/simbolo${extname(option.iconPath ?? '') || '.png'}`, option.iconPath, 'Símbolo cuadrado, sin el nombre.')
  add('favicon/favicon.svg', option.iconVector, 'Favicon vectorial.')
  const icons = (option.iconFiles as Record<string, string> | null) ?? {}
  if (icons.ico) add('favicon/favicon.ico', icons.ico, 'Favicon para navegadores viejos (16, 32 y 48 px).')
  for (const [size, rel] of Object.entries(icons)) if (size !== 'ico') add(size === '180' ? 'favicon/apple-touch-icon.png' : `favicon/icon-${size}.png`, rel, `Ícono ${size}×${size} px.`)
  add('lamina.png', option.boardPath, 'Lámina con toda la identidad, para presentar.')
  return out.filter((a, i, all) => all.findIndex((b) => b.zip === a.zip) === i)
}

const FAVICON_HTML = (files: string[]) =>
  [
    files.includes('favicon/favicon.svg') && '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    files.includes('favicon/favicon.ico') && '<link rel="icon" href="/favicon.ico" sizes="48x48">',
    files.includes('favicon/apple-touch-icon.png') && '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
  ]
    .filter(Boolean)
    .join('\n')

type Business = { brief: Brief; manifest: Manifest | null }

/** Lo que se sabe del negocio (del promo.yaml y del brief), para escribir el sitio sin inventar. */
export function businessInfo({ brief, manifest: m }: Business) {
  const info = {
    rubro: m?.category || brief.industry || undefined,
    descripcion: m?.description || brief.offer || undefined,
    proposito: brief.purpose || undefined,
    diferencial: brief.differentiator || undefined,
    publico: m?.audience.description || brief.audience || undefined,
    ubicacion: m?.location || brief.location || undefined,
    servicios: m?.features.length ? m.features : undefined,
    llamadoALaAccion: m?.cta,
    sitio: m?.url,
    contacto: m?.contact,
    links: m?.links.length ? m.links : undefined,
  }
  return Object.fromEntries(Object.entries(info).filter(([, v]) => v !== undefined))
}

export function designMd(s: BrandSpec, files: { zip: string; what: string }[], business: Record<string, unknown>) {
  const pct = (n: number) => `${n}:1`
  const linkColor = s.contrast.principalSobreFondo >= 4.5 ? 'principal' : 'texto'
  const accentText = s.contrast.acentoSobreFondo >= 4.5
  const lines = [
    `# ${s.name}: sistema de diseño para el sitio`,
    '',
    'Especificación para construir el sitio institucional. Los valores exactos están en `marca.json`, `tokens.css` y `design-tokens.json`: son la fuente de verdad. No agregues colores, tipografías ni logos que no estén acá.',
    '',
    ...(s.tagline ? [`**Frase de marca:** ${s.tagline}`, ''] : []),
    `**Concepto:** ${s.concept.name}${s.concept.origin ? ` (${s.concept.origin})` : ''}. ${s.rationale}`,
    '',
    '## Colores',
    '',
    '| Rol | Hex | Uso en el sitio |',
    '|---|---|---|',
    `| fondo | \`${s.colors.fondo}\` | Fondo de todas las páginas. |`,
    `| texto | \`${s.colors.texto}\` | Todo el texto corrido y los títulos. Contraste sobre fondo: ${pct(s.contrast.textoSobreFondo)}. |`,
    `| principal | \`${s.colors.principal}\` | Botón principal, elementos de marca${linkColor === 'principal' ? ' y links' : ''}. Contraste sobre fondo: ${pct(s.contrast.principalSobreFondo)}. |`,
    `| sobre-principal | \`${s.colors.sobrePrincipal}\` | Texto sobre el color principal (botones, bandas). Contraste: ${pct(s.contrast.sobrePrincipal)}. |`,
    `| acento | \`${s.colors.acento}\` | Detalles: íconos, subrayados, etiquetas, el gráfico de apoyo.${accentText ? '' : ' No usarlo para texto chico (no llega a 4.5:1 sobre el fondo).'} |`,
    `| apoyo | \`${s.colors.apoyo}\` | Fondos de secciones alternas, tarjetas y bordes. |`,
    '',
    `Links: color ${linkColor}${linkColor === 'texto' ? ', subrayados (el principal no llega a 4.5:1 sobre el fondo)' : ''}.`,
    '',
    '## Tipografías (Google Fonts)',
    '',
    `- Títulos (h1 a h3, cifras destacadas): **${s.fonts.display}**.`,
    `- Texto, botones, menú y formularios: **${s.fonts.text}**.`,
    '- Se cargan con el `@import` de `tokens.css`.',
    '',
    '| Elemento | Tamaño | Interlineado |',
    '|---|---|---|',
    `| h1 | \`${TYPE_SCALE.h1}\` | 1.1 |`,
    `| h2 | \`${TYPE_SCALE.h2}\` | 1.1 |`,
    `| h3 | \`${TYPE_SCALE.h3}\` | 1.1 |`,
    `| texto | \`${TYPE_SCALE.body}\` | 1.6 |`,
    `| chico | \`${TYPE_SCALE.small}\` | 1.6 |`,
    '',
    '## Logo',
    '',
    ...(s.logo ? [`Tipo: ${s.logo.type}. ${s.logo.idea}`, ''] : []),
    '- En el header, a la izquierda, entre 32 y 48 px de alto. Nunca menos de 24 px.',
    '- Margen libre alrededor: como mínimo la mitad de su alto.',
    '- Sobre el fondo de la marca o sobre blanco. No deformarlo, rotarlo, recolorearlo ni ponerle sombras.',
    '- Si no hay logo en el paquete, el nombre en la tipografía de títulos hace de logo.',
    '',
    '## Favicon',
    '',
    'Copiar los archivos de `favicon/` a la raíz pública del sitio y agregar en el `<head>`:',
    '',
    '```html',
    FAVICON_HTML(files.map((f) => f.zip)) || '<!-- Este paquete no trae favicon: generá una ronda con logo. -->',
    '```',
    '',
    ...(s.voice
      ? ['## Tono de voz (para los textos del sitio)', '', s.voice.tone, '', ...(s.voice.do.length ? ['Sí:', ...s.voice.do.map((x) => `- ${x}`), ''] : []), ...(s.voice.dont.length ? ['No:', ...s.voice.dont.map((x) => `- ${x}`), ''] : []), `Ejemplo: "${s.voice.sample}"`, '']
      : []),
    ...(s.pattern !== 'ninguno' ? ['## Gráfico de apoyo', '', `Patrón de ${s.pattern} en color acento sobre el fondo o el apoyo. Sólo como fondo de una sección o detrás del hero, nunca detrás de texto largo.`, ''] : []),
    '## Lo que se sabe del negocio',
    '',
    'Usar sólo estos datos para los textos. Lo que falte (precios, equipo, testimonios, fotos) se pide; no se inventa.',
    '',
    '```json',
    JSON.stringify(business, null, 2),
    '```',
    '',
    '## Archivos',
    '',
    ...files.map((f) => `- \`${f.zip}\`: ${f.what}`),
    '- `marca.json`: todo lo anterior en un solo JSON.',
    '- `tokens.css`: variables CSS listas para importar.',
    '- `design-tokens.json`: los mismos valores en formato W3C Design Tokens.',
  ]
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')
}

/** Todos los archivos del paquete de una alternativa. */
export async function brandExport(project: BrandProject & { app: App }, option: BrandOption, fetcher: typeof fetch = fetch): Promise<ZipEntry[]> {
  const o = OptionSchema.parse(option.data)
  const spec = brandSpec(o)
  const files = assetList(option)
  const business = businessInfo({ brief: BriefSchema.parse(project.brief), manifest: project.app.manifest as unknown as Manifest | null })
  const fontsUrl = await googleFontsUrl([spec.fonts.display, spec.fonts.text], fetcher)
  const json = { ...spec, fontsUrl, typeScale: TYPE_SCALE, business, files: files.map((f) => f.zip), generatedBy: 'Promo Studio', generatedAt: new Date().toISOString() }
  return [
    { path: 'DESIGN.md', data: designMd(spec, files, business) },
    { path: 'marca.json', data: JSON.stringify(json, null, 2) },
    { path: 'tokens.css', data: tokensCss(spec, fontsUrl) },
    { path: 'design-tokens.json', data: JSON.stringify(designTokens(spec), null, 2) },
    ...(await Promise.all(files.map(async (f) => ({ path: f.zip, data: await readFile(mediaPath(f.rel)) })))),
  ]
}
