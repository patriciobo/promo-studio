// Brief desde una descripción en texto: el modelo de texto completa los campos del brief con lo que el usuario contó
// del negocio (sin inventar). Lo que el texto no dice queda como estaba.
import { completeJson } from '../openrouter'
import { BriefSchema, USES, type Brief } from './brief'
import { AXES, LOGO_TYPES, PERSONALITIES } from './concepts'

export function buildBriefPrompt(text: string, base: Brief) {
  const system = `You fill a brand identity brief from a free-text description of a business written by its owner or agency.
Use ONLY what the description says or clearly implies; leave a field as "" (or [] for lists) when it says nothing about it. Never invent names, figures, competitors or places.
Fields (texts in ${base.language || 'es'}, rioplatense voseo if Spanish):
- name: the brand name ("" if it has none yet; then needsName: true).
- industry (short), offer (what it sells or does), purpose (why it exists), differentiator, audience, location, competitors.
- personalities: up to 5 of exactly these words: ${PERSONALITIES.join(', ')}.
- axes: numbers from 0 to 1 (0.5 if unknown): ${AXES.map((a) => `${a.id} (0 = ${a.from}, 1 = ${a.to})`).join('; ')}.
- likedColors, avoidColors, admiredBrands, tagline, constraints: only if mentioned.
- logoTypes: only if mentioned, from: ${LOGO_TYPES.map((l) => l.id).join(', ')}.
- uses: where the brand will be applied, from: ${USES.join(', ')} (include "Sitio web o app" if a website is mentioned).
Answer only JSON with those keys.`
  const user = JSON.stringify({ description: text, alreadyKnown: base })
  return { system, user }
}

const MAX: Record<string, number> = { name: 80, industry: 120, offer: 800, purpose: 600, differentiator: 600, audience: 600, location: 120, competitors: 600, likedColors: 200, avoidColors: 200, admiredBrands: 400, tagline: 140, constraints: 600 }

/** Lo que devuelve el modelo, recortado a lo que acepta el brief: un valor de más no tira abajo todo lo demás. */
function clean(raw: unknown) {
  if (!raw || typeof raw !== 'object') return {}
  const r = { ...(raw as Record<string, unknown>) }
  for (const [k, max] of Object.entries(MAX)) r[k] = typeof r[k] === 'string' ? (r[k] as string).slice(0, max) : ''
  const pick = (v: unknown, allowed: readonly string[]) => (Array.isArray(v) ? v.map(String).filter((x) => allowed.includes(x)) : [])
  r.personalities = pick(r.personalities, PERSONALITIES).slice(0, 5)
  r.logoTypes = pick(r.logoTypes, LOGO_TYPES.map((l) => l.id))
  r.uses = pick(r.uses, USES)
  r.needsName = r.needsName === true
  delete r.language
  return r
}

/** Mezcla: lo que trajo el texto pisa al brief anterior; lo vacío no. */
export function mergeBrief(base: Brief, raw: unknown): Brief {
  const got = BriefSchema.safeParse(clean(raw))
  if (!got.success) return base
  const next = got.data
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(next)) {
    if (k === 'language') continue
    if (k === 'axes') {
      // 0.5 es "no dice": sólo se toman los ejes que el texto movió.
      const axes = { ...base.axes }
      for (const a of AXES) if (Math.abs(next.axes[a.id] - 0.5) > 0.01) axes[a.id] = next.axes[a.id]
      out.axes = axes
    } else if (k === 'needsName') out.needsName = next.needsName && !next.name && !base.name ? true : base.needsName
    else if (Array.isArray(v) ? v.length : typeof v === 'string' ? v.trim() : false) out[k] = v
  }
  return BriefSchema.parse(out)
}

export async function briefFromText(text: string, base: Brief, opts: { appId: string; textModel: string }): Promise<Brief> {
  // Modo demo (OPENROUTER_MOCK=1): la descripción pasa a "qué ofrece", sin llamar al modelo.
  if (process.env.OPENROUTER_MOCK === '1') return mergeBrief(base, { offer: text, personalities: ['cercana'] })
  const { system, user } = buildBriefPrompt(text, base)
  const raw = await completeJson({ appId: opts.appId, model: opts.textModel, system, user, purpose: 'brief de marca desde texto' })
  return mergeBrief(base, raw)
}
