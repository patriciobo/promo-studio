// WhatsApp por WAHA: el número de origen (WAHA_CHAT_ID) es el que manda los mensajes a los clientes y recibe sus respuestas.
// Cada app puede tener el WhatsApp de su cliente: ahí van las publicaciones para aprobar, y se aprueban respondiendo.
import { createHmac } from 'node:crypto'
import { db } from './db'
import { env } from './env'
import { mediaUrl } from './media'
import { getSecret } from './settings'

/** Sólo los dígitos de un número o chat id ("+54 9 351…", "549351…@c.us" → "549351…"). */
export const digits = (v: string | null | undefined) => (v ?? '').split('@')[0].replace(/\D/g, '')
export const chatOf = (phone: string) => `${digits(phone)}@c.us`

interface Waha {
  url: string
  apiKey: string | null
  origin: string
}

async function config(): Promise<Waha | null> {
  const [url, apiKey, origin] = await Promise.all([getSecret('WAHA_URL'), getSecret('WAHA_API_KEY'), getSecret('WAHA_CHAT_ID')])
  if (!url) return null
  return { url: url.replace(/\/$/, ''), apiKey, origin: digits(origin) }
}

async function call<T>(w: Waha, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${w.url}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(w.apiKey ? { 'X-Api-Key': w.apiKey } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  })
  if (!r.ok) throw new Error(`WAHA ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`)
  return (r.headers.get('content-type') ?? '').includes('json') ? ((await r.json()) as T) : (undefined as T)
}

let cached: { at: number; name: string } | null = null

/** La sesión de WAHA conectada con el número de origen; si no aparece, la primera que funcione, o "default". */
async function session(w: Waha): Promise<string> {
  if (cached && Date.now() - cached.at < 5 * 60e3) return cached.name
  let name = 'default'
  try {
    const list = await call<{ name: string; status?: string; me?: { id?: string } | null }[]>(w, 'GET', '/api/sessions')
    const mine = w.origin ? list.find((s) => digits(s.me?.id) === w.origin) : undefined
    name = (mine ?? list.find((s) => s.status === 'WORKING') ?? list[0])?.name ?? name
  } catch {
    // WAHA viejo o sin permiso para listar: queda "default".
  }
  cached = { at: Date.now(), name }
  return name
}

export async function sendText(to: string, text: string) {
  const w = await config()
  if (!w) return false
  await call(w, 'POST', '/api/sendText', { session: await session(w), chatId: to.includes('@') ? to : chatOf(to), text })
  return true
}

/** Imagen con epígrafe; si el WAHA no manda imágenes (versión Core), va el link. */
async function sendImage(w: Waha, chatId: string, url: string, caption: string) {
  const s = await session(w)
  try {
    await call(w, 'POST', '/api/sendImage', { session: s, chatId, file: { url, mimetype: url.endsWith('.png') ? 'image/png' : 'image/jpeg', filename: url.split('/').pop() }, caption })
  } catch {
    await call(w, 'POST', '/api/sendText', { session: s, chatId, text: `${caption}\n${url}`.trim() })
  }
}

/** Avisos al dueño: van al chat propio del número de origen. */
export async function notifyOwner(text: string) {
  const w = await config()
  if (!w?.origin) return
  await call(w, 'POST', '/api/sendText', { session: await session(w), chatId: chatOf(w.origin), text })
}

// ---------------------------------------------------------------------------
// Aprobación por WhatsApp
// ---------------------------------------------------------------------------

const TYPE_LABEL = { IMAGE: 'Imagen', CAROUSEL: 'Carrusel', REEL: 'Reel', STORY: 'Historia' } as const

const fmt = (d: Date, tz: string) => new Intl.DateTimeFormat('es-AR', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d)

export const REPLY_HELP = 'Respondé:\n• *ok* para aprobar todas\n• *ok 1 3* para aprobar sólo esas\n• *cambios 2: …* para pedir cambios en una\n• *no 2* para descartarla'

/**
 * Manda al cliente las publicaciones en revisión que todavía no vio, numeradas a continuación de las que tiene pendientes.
 * Devuelve cuántas mandó, o por qué no pudo.
 */
export async function sendForReview(appId: string): Promise<{ sent: number; error?: string }> {
  const app = await db.app.findUniqueOrThrow({ where: { id: appId } })
  if (!app.whatsapp) return { sent: 0, error: 'La app no tiene WhatsApp del cliente' }
  const w = await config()
  if (!w) return { sent: 0, error: 'Falta configurar WAHA (Configuración)' }
  const todo = await db.post.findMany({ where: { appId, status: 'PENDING_REVIEW', adOnly: false, waNumber: null }, include: { assets: true }, orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }] })
  if (!todo.length) return { sent: 0 }
  // La numeración es por cliente (un cliente puede tener varias apps) y vuelve a 1 cuando no le queda nada pendiente.
  const last = await db.post.aggregate({ where: { status: 'PENDING_REVIEW', waNumber: { not: null }, app: { whatsapp: app.whatsapp } }, _max: { waNumber: true } })
  let n = last._max.waNumber ?? 0
  const chatId = chatOf(app.whatsapp)
  const s = await session(w)
  await call(w, 'POST', '/api/sendText', { session: s, chatId, text: `📸 *${app.name}*: ${todo.length === 1 ? 'una publicación nueva' : `${todo.length} publicaciones nuevas`} para aprobar.` })
  for (const p of todo) {
    n++
    const slides = p.assets.filter((a) => a.kind === 'SLIDE').sort((a, b) => a.position - b.position)
    const video = p.assets.find((a) => a.kind === 'VIDEO')
    const when = p.scheduledAt ? ` · ${fmt(p.scheduledAt, app.timezone)}` : ''
    const head = `*${n}.* ${TYPE_LABEL[p.type]}${when}${slides.length > 1 ? ` · ${slides.length} imágenes` : ''}`
    const caption = `${head}\n\n${p.caption}`.slice(0, 1000)
    const media = p.type === 'REEL' && video ? [mediaUrl(video.path)] : slides.map((a) => mediaUrl(a.path))
    if (!media.length) await call(w, 'POST', '/api/sendText', { session: s, chatId, text: caption })
    else if (p.type === 'REEL' && video) await call(w, 'POST', '/api/sendText', { session: s, chatId, text: `${caption}\n\n🎬 ${media[0]}` })
    else for (const [i, url] of media.entries()) await sendImage(w, chatId, url, i ? `${n}.${i + 1}` : caption)
    await db.post.update({ where: { id: p.id }, data: { waNumber: n, waSentAt: new Date() } })
  }
  const due = todo.map((p) => p.reviewDueAt).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0]
  const auto = due ? `\n\nSi no respondés, se aprueban solas a partir del ${fmt(due, app.timezone)}.` : ''
  await call(w, 'POST', '/api/sendText', { session: s, chatId, text: `${REPLY_HELP}${auto}` })
  return { sent: todo.length }
}

export type Reply = { kind: 'approve' | 'changes' | 'reject'; nums: number[] | null; note: string } | { kind: 'other' }

const APPROVE = /^(?:(?:ok|okey|okay|oka|si|dale|apruebo|aprobad[oa]s?|listo|perfecto|joya|genial)(?![a-z])|👍|👌|✅)/u
const CHANGES = /^(cambios?|cambiar|corregir|ajustar|modificar)\b/
const REJECT = /^(no|descartar|descarto|rechazo|rechazar|rechazada)\b/

/** Interpreta la respuesta del cliente: "ok", "ok 1 3", "cambios 2: otra foto", "no 2". */
export function parseReply(text: string): Reply {
  const raw = text.trim()
  // Sin tildes letra por letra, para que el largo no cambie y la nota se recorte del texto original.
  const t = [...raw].map((c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()).join('')
  const kind = APPROVE.test(t) ? 'approve' : CHANGES.test(t) ? 'changes' : REJECT.test(t) ? 'reject' : null
  if (!kind) return { kind: 'other' }
  const rest = t.replace(kind === 'approve' ? APPROVE : kind === 'changes' ? CHANGES : REJECT, '')
  const m = rest.match(/^[\s,.:#-]*((?:(?:la|las|el|los|nro\.?|n°|numero|y|e)?\s*#?\d+[\s,.y-]*)+)/)
  const nums = m ? [...new Set([...m[1].matchAll(/\d+/g)].map((x) => Number(x[0])))] : null
  const note = raw
    .slice(raw.length - rest.length + (m ? m[0].length : 0))
    .replace(/^[\s,.:;-]+/, '')
    .trim()
  // "no" a secas o "cambios" sin decir cuál: no se adivina.
  if (kind !== 'approve' && !nums) return { kind: 'other' }
  return { kind, nums, note }
}

/** Token del webhook: se deriva de APP_SECRET, así no hay otra clave que guardar. */
export const webhookToken = () => createHmac('sha256', env.appSecret).update('waha-webhook').digest('hex').slice(0, 32)
export const webhookUrl = () => `${env.publicUrl}/api/waha?token=${webhookToken()}`

/** El chat del que vino el mensaje, como número. Los chats nuevos de WhatsApp llegan como @lid: se le pide el número a WAHA. */
export async function senderPhone(payload: { from?: string; _data?: { key?: { remoteJidAlt?: string; senderPn?: string } } }) {
  const from = payload.from ?? ''
  if (!from.endsWith('@lid')) return digits(from)
  const alt = payload._data?.key?.senderPn ?? payload._data?.key?.remoteJidAlt
  if (alt && !alt.endsWith('@lid')) return digits(alt)
  const w = await config()
  if (!w) return ''
  try {
    const r = await call<{ pn?: string | null }>(w, 'GET', `/api/${await session(w)}/lids/${encodeURIComponent(from)}`)
    return digits(r.pn)
  } catch {
    return ''
  }
}

/** Aplica la respuesta del cliente a sus publicaciones pendientes y le contesta. Lo que no se entiende le llega al dueño. */
export async function handleClientMessage(phone: string, text: string, notify: (s: string) => Promise<void>) {
  if (!phone) return
  const apps = await db.app.findMany({ where: { whatsapp: phone } })
  if (!apps.length) return
  const names = apps.map((a) => a.name).join(', ')
  const reply = parseReply(text)
  const pending = await db.post.findMany({ where: { appId: { in: apps.map((a) => a.id) }, status: 'PENDING_REVIEW', waNumber: { not: null } }, orderBy: { waNumber: 'asc' } })
  if (reply.kind === 'other' || !pending.length) {
    await notify(`💬 Cliente de ${names}: ${text}`)
    return
  }
  const picked = reply.nums ? pending.filter((p) => reply.nums!.includes(p.waNumber!)) : pending
  const unknown = reply.nums?.filter((n) => !pending.some((p) => p.waNumber === n)) ?? []
  const ids = picked.map((p) => p.id)
  const list = (ps: { waNumber: number | null }[]) => ps.map((p) => p.waNumber).join(', ')
  let answer: string
  if (reply.kind === 'approve') {
    await db.post.updateMany({ where: { id: { in: ids } }, data: { status: 'APPROVED', error: null } })
    answer = picked.length ? `✅ Aprobada${picked.length > 1 ? 's' : ''}: ${list(picked)}.` : ''
    if (picked.length) await notify(`✅ ${names}: el cliente aprobó ${list(picked)}.`)
  } else if (reply.kind === 'reject') {
    await db.post.updateMany({ where: { id: { in: ids } }, data: { status: 'REJECTED', error: reply.note ? `El cliente la descartó: ${reply.note}` : 'El cliente la descartó' } })
    answer = picked.length ? `🗑️ Descartada${picked.length > 1 ? 's' : ''}: ${list(picked)}.` : ''
    if (picked.length) await notify(`🗑️ ${names}: el cliente descartó ${list(picked)}${reply.note ? `: ${reply.note}` : ''}.`)
  } else {
    // Pide cambios: queda en revisión sin aprobación automática, con el pedido a la vista en Revisión.
    await db.post.updateMany({ where: { id: { in: ids } }, data: { reviewDueAt: null, error: `El cliente pidió cambios: ${reply.note || '(sin detalle)'}` } })
    answer = picked.length ? `✏️ Anotado el pedido de cambios en ${list(picked)}. Te la mando de nuevo cuando esté.` : ''
    if (picked.length) await notify(`✏️ ${names}: el cliente pidió cambios en ${list(picked)}: ${reply.note || '(sin detalle)'}`)
  }
  if (unknown.length) answer = `${answer} No encontré ${unknown.length > 1 ? 'las' : 'la'} ${unknown.join(', ')} entre las pendientes.`.trim()
  const left = await db.post.count({ where: { appId: { in: apps.map((a) => a.id) }, status: 'PENDING_REVIEW', waNumber: { not: null }, error: null } })
  if (left && answer) answer += ` Queda${left > 1 ? 'n' : ''} ${left} por revisar.`
  if (answer) await sendText(chatOf(phone), answer)
}
