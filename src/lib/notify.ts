// Avisos al dueño: WhatsApp por WAHA (al chat propio del número de origen) si está configurado; si no, sólo al log.
import { notifyOwner } from './whatsapp'

export async function notify(text: string) {
  console.log(`[aviso] ${text}`)
  try {
    await notifyOwner(text)
  } catch (e) {
    console.error('[aviso] WAHA no respondió:', (e as Error).message)
  }
}
