// Sugerencia de estilos de diseño según el negocio: una llamada barata al modelo de texto con el promo.yaml y el catálogo.
import type { App, Prisma } from '@prisma/client'
import { db } from './db'
import type { Manifest } from './manifest'
import { completeJson } from './openrouter'
import { manifestOf } from './pipeline'
import { DESIGN_STYLES, parseDesignStyle, type StyleSuggestion } from './styles'

export function buildStylePrompt(m: Manifest) {
  const system = `You are a senior social media art director. From the style catalog, pick the 3 design styles that best fit this business on Instagram, best first. Weigh its industry, audience, tone, brand colors and what its competitors' audiences respond to. Avoid styles that clash with the business (e.g. playful styles for serious finance or health, dark tech for kids).
Answer only with JSON: {"picks":[{"id":string,"reason":string}]}. "id" must be a catalog id. "reason" in Spanish (voseo rioplatense), max 140 characters, specific to this business, not generic.`
  const user = JSON.stringify({
    business: { name: m.name, category: m.category, tagline: m.tagline, description: m.description?.slice(0, 600), audience: m.audience, tone: m.tone, colors: m.brand.colors, pillars: m.pillars, location: m.location },
    catalog: DESIGN_STYLES.map((s) => ({ id: s.id, name: s.label, looks: s.hint })),
  })
  return { system, user }
}

/** Ids del catálogo, sin repetidos, como mucho 3 (lo que el modelo invente se descarta). */
export function cleanSuggestions(raw: unknown): StyleSuggestion[] {
  const picks = (raw as { picks?: { id?: string; reason?: string }[] } | null)?.picks ?? []
  const out: StyleSuggestion[] = []
  for (const p of picks) {
    const id = parseDesignStyle(p.id)
    if (id && !out.some((o) => o.id === id)) out.push({ id, reason: String(p.reason ?? '').slice(0, 160) })
  }
  return out.slice(0, 3)
}

export async function suggestStyles(app: App) {
  const m = manifestOf(app)
  const { system, user } = buildStylePrompt(m)
  const raw =
    process.env.OPENROUTER_MOCK === '1'
      ? { picks: [{ id: 'papel', reason: 'Modo demo: limpio y legible.' }, { id: 'editorial', reason: 'Modo demo: transmite autoridad.' }, { id: 'clasico', reason: 'Modo demo: el de siempre.' }] }
      : await completeJson({ appId: app.id, model: app.textModel, system, user, maxTokens: 3000, purpose: 'sugerir estilos' })
  const picks = cleanSuggestions(raw)
  if (!picks.length) throw new Error('El modelo no sugirió ningún estilo del catálogo')
  await db.app.update({ where: { id: app.id }, data: { styleSuggestions: picks as unknown as Prisma.InputJsonValue } })
  return picks
}
