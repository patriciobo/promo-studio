import { inflateRawSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('../db', () => ({ db: {} }))

import { emptyBrief } from '../brand/brief'
import { mergeBrief } from '../brand/describe'
import { brandSpec, businessInfo, contrast, designMd, designTokens, googleFontsUrl, onColor, tokensCss } from '../brand/export'
import { OptionSchema } from '../brand/generate'
import { zip } from '../zip'

/** Lee un ZIP con el directorio central: nombre y contenido de cada archivo. */
function unzip(b: Buffer) {
  const end = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const count = b.readUInt16LE(end + 10)
  let at = b.readUInt32LE(end + 16)
  const out: Record<string, string> = {}
  for (let i = 0; i < count; i++) {
    const method = b.readUInt16LE(at + 10)
    const size = b.readUInt32LE(at + 20)
    const nameLen = b.readUInt16LE(at + 28)
    const extra = b.readUInt16LE(at + 30) + b.readUInt16LE(at + 32)
    const local = b.readUInt32LE(at + 42)
    const name = b.subarray(at + 46, at + 46 + nameLen).toString()
    const dataAt = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28)
    const data = b.subarray(dataAt, dataAt + size)
    out[name] = (method === 8 ? inflateRawSync(data) : data).toString()
    at += 46 + nameLen + extra
  }
  return out
}

const option = OptionSchema.parse({
  conceptId: 'suizo',
  brandName: 'Lupa',
  tagline: 'Pan de verdad',
  palette: [
    { hex: '#1C6A4E', name: 'Verde', role: 'principal' },
    { hex: '#F6F5F1', name: 'Hueso', role: 'fondo' },
    { hex: '#17191B', name: 'Tinta', role: 'texto' },
    { hex: '#E8B04A', name: 'Miel', role: 'acento' },
  ],
  fonts: { display: 'Fraunces', text: 'Inter' },
  voice: { tone: 'Cercano', do: ['Hablar claro'], dont: ['Exagerar'], sample: 'Hoy hay pan.' },
  pattern: 'puntos',
})

describe('zip', () => {
  it('arma un ZIP que se vuelve a leer igual (comprimido y sin comprimir)', () => {
    const files = { 'DESIGN.md': '# Hola\n'.repeat(50), 'logo/ñ.txt': 'x' }
    const read = unzip(zip(Object.entries(files).map(([path, data]) => ({ path, data }))))
    expect(read).toEqual(files)
  })
})

describe('exportar marca', () => {
  it('calcula contraste WCAG y el color para escribir sobre el principal', () => {
    expect(contrast('#000000', '#ffffff')).toBe(21)
    expect(onColor('#1c6a4e', ['#f6f5f1', '#17191b'])).toBe('#f6f5f1')
  })

  it('la especificación tiene los roles, en minúscula, y el texto contrasta con el fondo', () => {
    const s = brandSpec(option)
    expect(s.colors).toMatchObject({ principal: '#1c6a4e', fondo: '#f6f5f1', texto: '#17191b', acento: '#e8b04a', apoyo: '#e8b04a' })
    expect(s.contrast.textoSobreFondo).toBeGreaterThan(7)
    expect(s.palette[0].rgb).toEqual([28, 106, 78])
  })

  it('tokens.css y design-tokens.json llevan los mismos valores', () => {
    const s = brandSpec(option)
    const css = tokensCss(s, 'https://fonts.googleapis.com/css2?family=Inter&display=swap')
    expect(css).toContain('--color-principal: #1c6a4e;')
    expect(css).toContain('--font-display: "Fraunces", serif;')
    expect(css).toContain('@import url("https://fonts.googleapis.com/css2?family=Inter&display=swap");')
    expect(designTokens(s).color.principal).toEqual({ $type: 'color', $value: '#1c6a4e' })
  })

  it('DESIGN.md avisa cuando el acento no sirve para texto y trae los favicons que hay', () => {
    const md = designMd(brandSpec(option), [{ zip: 'favicon/favicon.svg', what: 'Favicon' }], { rubro: 'Panadería' })
    expect(md).toContain('No usarlo para texto chico')
    expect(md).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">')
    expect(md).not.toContain('apple-touch-icon')
    expect(md).toContain('"rubro": "Panadería"')
  })

  it('los datos del negocio sólo traen lo que se sabe', () => {
    const info = businessInfo({ brief: { ...emptyBrief(), industry: 'Panadería', location: 'Palermo' }, manifest: null })
    expect(info).toEqual({ rubro: 'Panadería', ubicacion: 'Palermo' })
  })

  it('Google Fonts: se queda con los pesos que la familia tiene', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => ({ ok: !String(url).includes('500') }) as Response)
    const url = await googleFontsUrl(['Fraunces', 'Inter'], fetcher as typeof fetch)
    expect(url).toBe('https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=Inter:wght@400;700&display=swap')
  })
})

describe('brief desde texto', () => {
  it('lo que trae el texto pisa al brief y lo que no dice o no es válido no lo toca', () => {
    const base = { ...emptyBrief(), name: 'Lupa', industry: 'Panadería' }
    const next = mergeBrief(base, { name: '', industry: 'Panadería de masa madre', personalities: ['artesanal', 'inventada', 'cálida'], axes: { modern: 0.5, playful: 0.8 }, uses: ['Sitio web o app', 'Otra'], audience: 'x'.repeat(900) })
    expect(next.name).toBe('Lupa')
    expect(next.industry).toBe('Panadería de masa madre')
    expect(next.personalities).toEqual(['artesanal', 'cálida'])
    expect(next.axes).toMatchObject({ modern: 0.5, playful: 0.8 })
    expect(next.uses).toEqual(['Sitio web o app'])
    expect(next.audience).toHaveLength(600)
  })
})
