// Worker: tareas programadas y en cola. Se corre con `npm run worker`.
import type { Job } from 'pg-boss'
import { db } from '@/lib/db'
import type { ImageChoice } from '@/lib/models'
import { getBoss, QUEUES } from '@/lib/jobs'
import { autoApprove, collectInsights, publishDue } from '@/lib/publisher'
import { createOnDemand, renderPost, runDaily, runWeekly, syncApp } from '@/lib/pipeline'
import { nextMonday } from '@/lib/schedule'
import { closeBrowser, renderHtml } from '@/render/renderer'
import { mediaPath, saveMedia } from '@/lib/media'
import { existsSync } from 'node:fs'

const TZ = process.env.WORKER_TZ ?? 'America/Argentina/Buenos_Aires'

/** Imagen fija que usa el control de salud para verificar que Instagram puede descargar desde PUBLIC_URL. */
async function ensureHealthImage() {
  if (existsSync(mediaPath('_health.jpg'))) return
  const html = '<html><body style="margin:0;width:1080px;height:1080px;background:#3b5bdb;display:grid;place-items:center;font:700 96px system-ui;color:#fff">Promo Studio</body></html>'
  await saveMedia('_health.jpg', await renderHtml(html, 1080, 1080))
}

async function main() {
  await ensureHealthImage().catch((e) => console.error('[worker] imagen de control:', e.message))
  const boss = await getBoss()

  await boss.schedule(QUEUES.tick, '* * * * *', {}, { tz: TZ })
  await boss.schedule(QUEUES.insights, '15 * * * *', {}, { tz: TZ })
  await boss.schedule(QUEUES.daily, '*/10 * * * *', {}, { tz: TZ })
  // Domingo 18:00: se arma el lote de la semana siguiente de cada app.
  await boss.schedule(QUEUES.weekly, '0 18 * * 0', {}, { tz: TZ })

  await boss.work(QUEUES.tick, async () => {
    const approved = await autoApprove()
    const published = await publishDue()
    if (approved || published) console.log(`[tick] aprobados ${approved}, publicados ${published}`)
  })

  await boss.work(QUEUES.insights, async () => {
    const n = await collectInsights().catch((e) => (console.error('[métricas]', e.message), 0))
    if (n) console.log(`[métricas] ${n} snapshots`)
  })

  await boss.work(QUEUES.daily, async () => {
    const apps = await db.app.findMany({ where: { paused: false, manifest: { not: undefined } }, select: { id: true, slug: true, manifest: true } })
    for (const a of apps) {
      if (!(a.manifest as { daily?: unknown } | null)?.daily) continue
      const r = await runDaily(a.id).catch((e) => `error: ${e.message}`)
      if (!['todavía no', 'ya hecha', 'reporte sin publicar'].includes(r)) console.log(`[diaria] ${a.slug}: ${r}`)
      await closeBrowser()
    }
  })

  await boss.work(QUEUES.weekly, async () => {
    const apps = await db.app.findMany({ where: { paused: false } })
    const weekStart = nextMonday()
    for (const a of apps) await boss.send(QUEUES.runWeekly, { appId: a.id, weekStart: weekStart.toISOString() }, { singletonKey: `${a.id}-${weekStart.toISOString()}` })
  })

  // `image`: modelo elegido junto al botón; el lote automático del domingo no lo trae y usa el de Ajustes.
  await boss.work<{ appId: string; weekStart: string; image?: ImageChoice }>(QUEUES.runWeekly, async (jobs: Job<{ appId: string; weekStart: string; image?: ImageChoice }>[]) => {
    for (const j of jobs) {
      console.log(`[lote] ${j.data.appId} semana ${j.data.weekStart.slice(0, 10)}`)
      await runWeekly(j.data.appId, new Date(j.data.weekStart), j.data.image)
      await closeBrowser()
    }
  })

  await boss.work<{ postId: string; regenerateImage?: boolean; image?: ImageChoice }>(QUEUES.renderPost, async (jobs: Job<{ postId: string; regenerateImage?: boolean; image?: ImageChoice }>[]) => {
    for (const j of jobs) await renderPost(j.data.postId, { regenerateImage: j.data.regenerateImage, image: j.data.image })
  })

  await boss.work<{ postId: string; topic: string; image?: ImageChoice }>(QUEUES.createPost, async (jobs: Job<{ postId: string; topic: string; image?: ImageChoice }>[]) => {
    for (const j of jobs) {
      console.log(`[a pedido] ${j.data.postId}: ${j.data.topic}`)
      await createOnDemand(j.data.postId, j.data.topic, j.data.image)
      await closeBrowser()
    }
  })

  await boss.work<{ appId: string }>(QUEUES.syncApp, async (jobs: Job<{ appId: string }>[]) => {
    for (const j of jobs) await syncApp(j.data.appId)
  })

  console.log('[worker] listo')
  const stop = async () => {
    await boss.stop()
    await closeBrowser(true)
    process.exit(0)
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
