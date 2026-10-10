// Cola de trabajos (pg-boss sobre Postgres). La web sólo encola; el worker ejecuta.
import { PgBoss } from 'pg-boss'
import { env } from './env'

export const QUEUES = {
  tick: 'tick', // cada minuto: aprobar, publicar
  insights: 'insights', // cada hora: métricas
  daily: 'daily', // cada 10 minutos: edición diaria de las apps que la tienen
  weekly: 'weekly', // domingo: lote de cada app
  runWeekly: 'run-weekly', // { appId, weekStart, image?, imageIds? }
  renderPost: 'render-post', // { postId, regenerateImage?, image? }
  syncApp: 'sync-app', // { appId }
  createPost: 'create-post', // { postId, topic, image?, imageIds? }: publicación a pedido
  describeImage: 'describe-image', // { imageId }: descripción de una imagen subida
  pushCampaign: 'push-campaign', // { campaignId }: crear (o completar) la campaña en Meta, en pausa
  syncAds: 'sync-ads', // cada 3 horas: estado y resultados de las campañas
  styleSamples: 'style-samples', // { appId: string | null, styles, qualities }: muestras de estilo (null = genéricas)
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
