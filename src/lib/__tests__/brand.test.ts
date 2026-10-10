import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('../db', () => ({ db: {} }))

import { colorsFromText, emptyBrief, fontsFromText, missingElements, missingInBrief, parseBriefForm, rankConcepts, type Brief } from '../brand/brief'
import { CATALOG_FONTS, CONCEPTS } from '../brand/concepts'
import { buildIdentityPrompt, candidates, rolesFor, logoPrompt, mockOptions, normalizeOptions, OPTIONS_PER_ROUND, parseLogoModel, roundCost, type RoundContext } from '../brand/generate'
import { brandBoardHtml, patternCss } from '@/templates/brand-board'
import { availableFields, brandGuide, brandPatch, yamlColors } from '../brand/save'
import { parseManifest, setYamlBrand } from '../manifest'

const brief = (b: Partial<Brief>): Brief => ({ ...emptyBrief(), ...b })
const ctx = (b: Partial<Brief>, extra: Partial<RoundContext> = {}): RoundContext => ({ brief: brief(b), found: null, elements: ['logo', 'paleta', 'tipografia', 'voz', 'tagline', 'patron'], usedConcepts: [], hasReference: false, ...extra })

describe('catálogo de conceptos', () => {
  it('tiene ids únicos, ejes entre 0 y 1 y paletas hex válidas', () => {
    expect(new Set(CONCEPTS.map((c) => c.id)).size).toBe(CONCEPTS.length)
    for (const c of CONCEPTS) {
      for (const v of Object.values(c.axes)) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
      for (const p of c.palette.examples) for (const hex of p) expect(hex).toMatch(/^#[0-9a-f]{6}$/i)
      expect(c.fonts.display.length).toBeGreaterThan(0)
    }
    expect(CATALOG_FONTS).toContain('Fraunces')
  })
})

describe('rankConcepts', () => {
  it('un consultorio serio y confiable prefiere el clásico o el nórdico', () => {
    const top = rankConcepts(brief({ industry: 'Odontología', offer: 'Consultorio odontológico', personalities: ['confiable', 'serena'], axes: { modern: 0.3, playful: 0.1, expressive: 0.2, exclusive: 0.6 } })).slice(0, 2)
    expect(top.map((r) => r.concept.id)).toContain('clasico')
  })
  it('una heladería lúdica y juvenil prefiere el pop coreano', () => {
    const top = rankConcepts(brief({ industry: 'Helados', personalities: ['lúdica', 'juvenil'], axes: { modern: 0.8, playful: 0.9, expressive: 0.7, exclusive: 0.2 } }))[0]
    expect(top.concept.id).toBe('coreano')
  })
  it('candidates deja al final los conceptos ya usados', () => {
    const c = ctx({ industry: 'Helados', personalities: ['lúdica'] }, { usedConcepts: ['coreano'] })
    expect(candidates(c).map((x) => x.id)).not.toContain('coreano')
  })
})

describe('brief', () => {
  it('lee el formulario: rasgos válidos, ejes en 0..1 y tipos de logo', () => {
    const f = new FormData()
    f.set('name', ' Fogón ')
    f.append('personalities', 'cálida')
    f.append('personalities', 'inventada')
    f.set('axis_modern', '80')
    f.append('logoTypes', 'symbol')
    const b = parseBriefForm(f)
    expect(b.name).toBe('Fogón')
    expect(b.personalities).toEqual(['cálida'])
    expect(b.axes.modern).toBe(0.8)
    expect(b.axes.playful).toBe(0.5)
    expect(b.logoTypes).toEqual(['symbol'])
  })
  it('avisa lo que falta para que no salga genérico', () => {
    expect(missingInBrief(emptyBrief())).toHaveLength(5)
    expect(missingInBrief(brief({ name: 'X', industry: 'a', offer: 'b', audience: 'c', personalities: ['audaz'] }))).toEqual([])
  })
})

describe('lectura de repos', () => {
  it('encuentra tipografías de fontsource, next/font, Google Fonts y CSS, sin las del sistema', () => {
    const text = `"@fontsource-variable/inter-tight": "^5", "@fontsource/ibm-plex-mono": "^5"
import { Fraunces, Space_Grotesk as Grot } from 'next/font/google'
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400&family=Lora&display=swap">
body { font-family: 'Karla', system-ui, sans-serif } code { font-family: ui-monospace, monospace }`
    expect(fontsFromText(text)).toEqual(['Inter Tight', 'IBM Plex Mono', 'Fraunces', 'Space Grotesk', 'DM Sans', 'Lora'])
  })
  it('ordena los colores por frecuencia', () => {
    expect(colorsFromText(':root{--a:#FF5A1F;--b:#0c0b0a} .x{color:#ff5a1f}')).toEqual(['#ff5a1f', '#0c0b0a'])
  })
  it('marca para generar sólo lo que falta', () => {
    expect(missingElements({ colors: ['#111111', '#eeeeee'], fonts: ['Inter'], logo: 'logo.svg', sources: [] })).toEqual(['voz', 'tagline', 'patron'])
    expect(missingElements({ colors: [], fonts: [], sources: [] })).toContain('logo')
  })
})

describe('alternativas', () => {
  it('el prompt incluye los candidatos y lo fijo del repo', () => {
    const c = ctx({ name: 'Obras' }, { found: { colors: ['#123456', '#fafafa'], fonts: ['Inter'], sources: [] }, elements: ['logo', 'voz'] })
    const { system, candidates: cands } = buildIdentityPrompt(c)
    expect(cands).toHaveLength(6)
    expect(system).toContain('#123456, #fafafa')
    expect(system).toContain('fonts (keep): Inter')
  })
  it('normaliza: 3 conceptos distintos, paleta y tipografías del repo, fuentes inválidas reemplazadas', () => {
    const c = ctx({ name: 'Obras' }, { found: { colors: ['#123456', '#fafafa', '#222222'], fonts: ['Inter'], sources: [] }, elements: ['logo', 'voz'] })
    const cands = candidates(c)
    const raw = { options: [{ conceptId: cands[0].id, fonts: { display: 'Fuente Inexistente', text: 'Inter' }, pattern: 'rayas' }, { conceptId: cands[0].id }, { conceptId: 'no-existe' }] }
    const out = normalizeOptions(raw, c, cands)
    expect(out).toHaveLength(OPTIONS_PER_ROUND)
    expect(new Set(out.map((o) => o.conceptId)).size).toBe(3)
    for (const o of out) {
      expect(o.palette.map((p) => p.hex)).toEqual(['#123456', '#fafafa', '#222222'])
      expect(o.fonts).toEqual({ display: 'Inter', text: 'Inter' })
      expect(o.pattern).toBe('ninguno') // no se pidió el gráfico de apoyo
      expect(o.brandName).toBe('Obras')
      expect(o.logo).toBeDefined()
    }
  })
  it('sin respuesta del modelo completa con los conceptos y sus paletas', () => {
    const c = ctx({ name: 'Pan', industry: 'Panadería', personalities: ['artesanal'] })
    const out = normalizeOptions(null, c, candidates(c))
    expect(out).toHaveLength(3)
    expect(out[0].palette.some((p) => p.role === 'principal')).toBe(true)
    expect(CATALOG_FONTS).toContain(out[0].fonts!.display)
  })
  it('modo demo devuelve 3 alternativas válidas', () => {
    const c = ctx({ name: 'Pan', needsName: true }, { elements: ['nombre', 'logo'] })
    const out = normalizeOptions(mockOptions(c), c, candidates(c))
    expect(out[0].names).toHaveLength(3)
  })
  it('el prompt del logo pide el nombre exacto, salvo isotipo', () => {
    const c = ctx({ name: 'Fogón' })
    const [o] = normalizeOptions(mockOptions(c), c, candidates(c))
    expect(logoPrompt(o)).toContain('"Fogón" spelled exactly')
    expect(logoPrompt({ ...o, logo: { type: 'symbol', idea: '', prompt: '' } })).toContain('Symbol only')
  })
  it('asigna roles a una paleta existente por luminancia', () => {
    expect(rolesFor(['#ff5a1f', '#ece6dc', '#0c0b0a', '#7d776e']).map((p) => p.role)).toEqual(['principal', 'fondo', 'texto', 'acento'])
  })
  it('costos y modelos de logo', () => {
    expect(parseLogoModel('cualquiera').id).toBe('recraft/recraft-v4.1-flash')
    expect(roundCost(['voz'], parseLogoModel(null))).toBeLessThan(roundCost(['logo'], parseLogoModel(null)))
    expect(roundCost(['logo'], parseLogoModel('openai/gpt-image-2.5-sunburst|low'))).toBeCloseTo(0.01 + 3 * 0.006)
  })
})

describe('lámina', () => {
  it('arma el HTML con las tipografías, la paleta y el nombre escapado', () => {
    const html = brandBoardHtml({ brandName: 'A & B', conceptName: 'Nórdico', tagline: '', palette: [{ hex: '#4f6b5a', name: 'Monte', role: 'principal' }], fonts: { display: 'DM Sans', text: 'Inter' }, pattern: 'puntos', label: 'Alternativa 1' })
    expect(html).toContain('family=DM+Sans')
    expect(html).toContain('A &amp; B')
    expect(html).toContain('#4F6B5A')
    expect(patternCss('ninguno', '#000000', '#ffffff')).toBe('background:#ffffff')
  })
})

describe('guardar en el repo', () => {
  const c = ctx({ name: 'Fogón' })
  const [o] = normalizeOptions(mockOptions(c), c, candidates(c))
  const opt = { ...o, palette: [{ hex: '#111111', name: 'Tinta', role: 'texto' as const }, { hex: '#FF5A1F', name: 'Brasa', role: 'principal' as const }, { hex: '#f5f0e8', name: 'Hueso', role: 'fondo' as const }, { hex: '#7d776e', name: 'Gris', role: 'acento' as const }], fonts: { display: 'Fraunces', text: 'Inter' } }

  it('ordena los colores como los usa Promo Studio: principal, fondo, texto, acento', () => {
    expect(yamlColors(opt)).toEqual(['#ff5a1f', '#f5f0e8', '#111111', '#7d776e'])
  })
  it('arma el cambio del promo.yaml sólo con los campos elegidos', () => {
    expect(brandPatch(opt, ['colors', 'font', 'logo'], '.promo/marca/logo.svg', 'text')).toEqual({ colors: ['#ff5a1f', '#f5f0e8', '#111111', '#7d776e'], font: 'Inter', logo: '.promo/marca/logo.svg' })
    expect(brandPatch(opt, ['font'], null, 'display')).toEqual({ font: 'Fraunces' })
    expect(brandPatch(opt, ['logo'], null, 'text')).toEqual({})
  })
  it('ofrece actualizar sólo lo que se generó', () => {
    expect(availableFields(opt, { logoPath: 'x.png', vectorPath: null }, ['logo', 'voz'])).toEqual(['logo', 'tone'])
  })
  it('actualiza el promo.yaml conservando comentarios y el resto de los campos', () => {
    const yaml = `# Manifiesto de Fogón\nname: Fogón\nurl: https://fogon.ar\ntagline: Software para negocios\nbrand:\n  colors: ["#000000", "#ffffff"] # principal primero\n  font: Inter\n  style: poster\nfeatures: [Algo]\n`
    const next = setYamlBrand(yaml, { colors: ['#ff5a1f', '#f5f0e8', '#111111'], font: 'Fraunces', logo: '.promo/marca/logo.svg', tagline: 'Nueva frase' })
    expect(next).toContain('# Manifiesto de Fogón')
    expect(next).toContain('  colors: ["#ff5a1f", "#f5f0e8", "#111111"] # principal primero')
    expect(next).toContain('features: [Algo]')
    expect(next).toContain('style: poster')
    const r = parseManifest(next)
    expect(r.ok && r.manifest.brand).toMatchObject({ font: 'Fraunces', logo: '.promo/marca/logo.svg', colors: ['#ff5a1f', '#f5f0e8', '#111111'] })
    expect(r.ok && r.manifest.tagline).toBe('Nueva frase')
  })
  it('no reformatea lo que no cambia: textos plegados, listas y comentarios', () => {
    const yaml = `name: Fogón\nurl: https://fogon.ar\ntagline: Software\ndescription: >-\n  Un texto largo que ocupa\n  dos líneas.\naudience:\n  countries: [AR]\ntone: >-\n  cercano y\n  claro\nbrand:\n  colors: ["#000000", "#ffffff"]\nfeatures: [Algo]\n`
    const next = setYamlBrand(yaml, { tone: 'Directo: frases cortas', colors: ['#ff5a1f', '#ffffff'], logo: '.promo/marca/logo.png' })
    expect(next).toBe(`name: Fogón\nurl: https://fogon.ar\ntagline: Software\ndescription: >-\n  Un texto largo que ocupa\n  dos líneas.\naudience:\n  countries: [AR]\ntone: "Directo: frases cortas"\nbrand:\n  colors: ["#ff5a1f", "#ffffff"]\n  logo: .promo/marca/logo.png\nfeatures: [Algo]\n`)
  })
  it('la guía de marca lista paleta, tipografías y logo', () => {
    const md = brandGuide(opt, 'Fogón', 'logo.svg')
    expect(md).toContain('# Identidad de marca: Fogón')
    expect(md).toContain('| Brasa | `#FF5A1F` | principal |')
    expect(md).toContain('Títulos: **Fraunces**')
    expect(md).toContain('![Logo](logo.svg)')
  })
})
