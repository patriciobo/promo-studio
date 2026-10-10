// Webhook de WAHA: las respuestas de los clientes a las publicaciones para aprobar. Se configura con la URL que muestra Configuración.
import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { notify } from '@/lib/notify'
import { handleClientMessage, senderPhone, webhookToken } from '@/lib/whatsapp'

interface Event {
  event?: string
  payload?: { from?: string; fromMe?: boolean; body?: string; _data?: { key?: { remoteJidAlt?: string; senderPn?: string } } }
}

const valid = (token: string | null) => {
  const a = Buffer.from(token ?? '')
  const b = Buffer.from(webhookToken())
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  if (!valid(req.nextUrl.searchParams.get('token'))) return new Response('token inválido', { status: 401 })
  const e = (await req.json().catch(() => ({}))) as Event
  const p = e.payload
  // Sólo mensajes de texto de chats individuales que no mandamos nosotros.
  if (e.event !== 'message' || !p || p.fromMe || !p.body?.trim() || /@(g\.us|newsletter|broadcast)$/.test(p.from ?? '')) return Response.json({ ok: true })
  try {
    await handleClientMessage(await senderPhone(p), p.body, notify)
  } catch (err) {
    console.error('[waha] no se pudo procesar la respuesta:', (err as Error).message)
  }
  return Response.json({ ok: true })
}
