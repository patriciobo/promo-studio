// OpenRouter: texto (planificación) e imágenes (fondos). Cada llamada registra su costo real.
import { assertBudget } from './budget'
import { db } from './db'
import { imageModel, type ImageKind } from './models'
import { getSecret } from './settings'

const API = 'https://openrouter.ai/api/v1'

async function key() {
  const k = await getSecret('OPENROUTER_API_KEY')
  if (!k) throw new Error('Falta la API key de OpenRouter (Configuración → Claves).')
  return k
}

async function call(path: string, body: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await key()}`, 'Content-Type': 'application/json', 'X-Title': 'Promo Studio' },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } }
  if (!res.ok || json.error) throw new OpenRouterError(res.status, json.error?.message ?? `HTTP ${res.status}`)
  return json
}

export class OpenRouterError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(`OpenRouter: ${message}`)
  }
}

const imagePart = (url: string) => ({ type: 'image_url', image_url: { url } })

async function record(appId: string | null, kind: 'text' | 'image', model: string, cost: number, tokens: number | undefined, purpose: string) {
  await db.usageLedger.create({ data: { appId, kind, model, costUsd: cost, tokens, purpose } })
}

/** Pide una respuesta JSON al modelo de texto. `images` (data URIs) se le muestran junto al pedido. */
export async function completeJson<T = unknown>(opts: { appId: string | null; model: string; system: string; user: string; purpose: string; maxTokens?: number; images?: string[]; onCost?: (usd: number) => void }): Promise<T> {
  await assertBudget(opts.appId, 0.05)
  const r = (await call('/chat/completions', {
    model: opts.model,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.images?.length ? [{ type: 'text', text: opts.user }, ...opts.images.map(imagePart)] : opts.user },
    ],
    response_format: { type: 'json_object' },
    max_tokens: opts.maxTokens ?? 6000,
    usage: { include: true },
  })) as { choices: { message: { content: string }; finish_reason?: string }[]; usage?: { cost?: number; total_tokens?: number } }
  await record(opts.appId, 'text', opts.model, r.usage?.cost ?? 0, r.usage?.total_tokens, opts.purpose)
  opts.onCost?.(r.usage?.cost ?? 0)
  const content = r.choices?.[0]?.message?.content ?? ''
  if (r.choices?.[0]?.finish_reason === 'length') throw new OpenRouterError(200, `la respuesta de ${opts.model} se cortó por el límite de tokens (${opts.maxTokens ?? 6000}); probá con otro modelo de texto (Ajustes > Modelos de OpenRouter > Modelo de texto)`)
  try {
    return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, '')) as T
  } catch {
    throw new OpenRouterError(200, `la respuesta no es JSON válido: ${content.slice(0, 200)}`)
  }
}

export type AspectRatio = '4:5' | '3:4' | '9:16' | '1:1'

/** Aspecto a pedir: algunos modelos no aceptan 4:5 para el feed (la plantilla recorta con object-fit: cover). */
export const aspectFor = (model: string, aspect: AspectRatio): AspectRatio => (aspect === '4:5' && imageModel(model)?.feedAspect === '3:4' ? '3:4' : aspect)

/**
 * Genera una imagen. Usa el endpoint de imágenes y, si el modelo no lo soporta,
 * el de chat con salida de imagen (modelos tipo Gemini Image).
 * `references` (data URIs) sirve para mantener el estilo entre las piezas de un post.
 */
export async function generateImage(opts: { appId: string | null; model: string; prompt: string; aspectRatio: AspectRatio; purpose: string; quality?: string | null; references?: string[]; kind?: ImageKind }): Promise<{ data: Buffer; mime: string; cost: number }> {
  await assertBudget(opts.appId, 0.1)
  const info = imageModel(opts.model)
  const refs = info?.references ? (opts.references ?? []).slice(0, 4) : []
  let aspect = aspectFor(opts.model, opts.aspectRatio)
  if (info?.api !== 'chat') {
    const quality = info?.qualities ? (opts.quality ?? info.defaultQuality) : undefined
    const body = () => ({ model: opts.model, prompt: opts.prompt, aspect_ratio: aspect, n: 1, output_format: 'jpeg', resolution: '1K', ...(quality ? { quality } : {}), ...(refs.length ? { input_references: refs.map(imagePart) } : {}) })
    try {
      let r
      try {
        r = await call('/images', body())
      } catch (e) {
        // Modelos fuera del catálogo que no aceptan 4:5: se reintenta con 3:4.
        if (!(e instanceof OpenRouterError) || e.status !== 400 || aspect !== '4:5' || info) throw e
        aspect = '3:4'
        r = await call('/images', body())
      }
      const img = r as { data: { b64_json: string; media_type?: string }[]; usage?: { cost?: number } }
      const cost = img.usage?.cost ?? 0
      await record(opts.appId, 'image', opts.model, cost, undefined, opts.purpose)
      return { data: Buffer.from(img.data[0].b64_json, 'base64'), mime: img.data[0].media_type ?? 'image/jpeg', cost }
    } catch (e) {
      if (!(e instanceof OpenRouterError) || ![400, 404, 405].includes(e.status)) throw e
    }
  }
  const text = `${opts.prompt}\n\nAspect ratio ${aspect}. No text, no letters, no logos.${refs.length ? ` Keep exactly the same ${opts.kind === 'photo' ? 'photographic look, lighting and people' : 'illustration style, palette and characters'} as the reference images.` : ''}`
  const r = (await call('/chat/completions', {
    model: opts.model,
    modalities: ['image', 'text'],
    messages: [{ role: 'user', content: refs.length ? [{ type: 'text', text }, ...refs.map(imagePart)] : text }],
    image_config: { aspect_ratio: aspect },
    usage: { include: true },
  })) as { choices: { message: { images?: { image_url: { url: string } }[] } }[]; usage?: { cost?: number; total_tokens?: number } }
  const url = r.choices?.[0]?.message?.images?.[0]?.image_url?.url
  if (!url?.startsWith('data:')) throw new OpenRouterError(200, 'el modelo no devolvió una imagen')
  const [meta, b64] = url.split(',')
  const cost = r.usage?.cost ?? 0
  await record(opts.appId, 'image', opts.model, cost, r.usage?.total_tokens, opts.purpose)
  return { data: Buffer.from(b64, 'base64'), mime: meta.slice(5, meta.indexOf(';')), cost }
}

export type ModelInfo = { id: string; name: string; price?: string }

/** Modelos de OpenRouter que generan imágenes (para el selector de la web y para saber qué modelos del catálogo siguen disponibles). */
export async function imageModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${API}/models?output_modalities=image`)
  const j = (await res.json()) as { data: { id: string; name: string; pricing?: Record<string, string> }[] }
  return j.data.map((m) => ({ id: m.id, name: m.name, price: m.pricing?.image && Number(m.pricing.image) > 0 ? `US$ ${Number(m.pricing.image).toFixed(3)}/img` : undefined }))
}

/** Modelos de texto, del más barato al más caro. */
export async function textModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${API}/models`)
  const j = (await res.json()) as { data: { id: string; name: string; pricing?: { prompt?: string; completion?: string }; architecture?: { output_modalities?: string[] } }[] }
  return j.data
    .filter((m) => m.architecture?.output_modalities?.includes('text') ?? true)
    .map((m) => ({ id: m.id, name: m.name, cost: Number(m.pricing?.prompt ?? 0) + Number(m.pricing?.completion ?? 0) }))
    .sort((a, b) => a.cost - b.cost)
    .map((m) => ({ id: m.id, name: m.name, price: `US$ ${(m.cost * 1e6).toFixed(2)}/M tokens` }))
}

// Precios por token de los modelos de texto (cambian poco): se piden una vez por hora.
let priceCache: { at: number; prices: Map<string, { prompt: number; completion: number }> } | null = null

/** US$ por token de entrada y de salida de un modelo de texto (null si OpenRouter no lo lista). */
export async function textModelPrice(model: string) {
  if (!priceCache || Date.now() - priceCache.at > 3600e3) {
    const res = await fetch(`${API}/models`)
    const j = (await res.json()) as { data: { id: string; pricing?: { prompt?: string; completion?: string } }[] }
    priceCache = { at: Date.now(), prices: new Map(j.data.map((m) => [m.id, { prompt: Number(m.pricing?.prompt ?? 0), completion: Number(m.pricing?.completion ?? 0) }])) }
  }
  return priceCache.prices.get(model) ?? null
}
