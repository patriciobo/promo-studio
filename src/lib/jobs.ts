// Cola de trabajos (pg-boss sobre Postgres). La web sólo encola; el worker ejecuta.
import { PgBoss } from 'pg-boss'
import { env } from './env'

export const QUEUES = {
  tick: 'tick', // cada minuto: aprobar, publicar
  insights: 'insights', // cada hora: métricas
  weekly: 'weekly', // domingo: lote de cada app
  runWeekly: 'run-weekly', // { appId, weekStart }
  renderPost: 'render-post', // { postId, regenerateImage? }
  syncApp: 'sync-app', // { appId }
} as const

let boss: Promise<PgBoss> | null = null

export function getBoss() {
  boss ??= (async () => {
    const b = new PgBoss(env.databaseUrl)
    b.on('error', (e) => console.error('[pg-boss]', e))
    await b.start()
    for (const q of Object.values(QUEUES)) await b.createQueue(q).catch(() => {})
    return b
  })()
  return boss
}

export async function enqueue(name: string, data: object, options: { singletonKey?: string } = {}) {
  return (await getBoss()).send(name, data, { retryLimit: 1, ...options })
}
