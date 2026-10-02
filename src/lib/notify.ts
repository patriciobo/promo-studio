// Avisos al dueño: WhatsApp por WAHA si está configurado; si no, sólo al log.
import { getSecret } from './settings'

export async function notify(text: string) {
  const [url, apiKey, chatId] = await Promise.all([getSecret('WAHA_URL'), getSecret('WAHA_API_KEY'), getSecret('WAHA_CHAT_ID')])
  console.log(`[aviso] ${text}`)
  if (!url || !chatId) return
  try {
    await fetch(`${url.replace(/\/$/, '')}/api/sendText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'X-Api-Key': apiKey } : {}) },
      body: JSON.stringify({ session: 'default', chatId, text }),
    })
  } catch (e) {
    console.error('[aviso] WAHA no respondió:', (e as Error).message)
  }
}
