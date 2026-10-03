// Tareas periódicas: aprobar lo vencido, publicar lo programado, juntar métricas y puntuar.
import type { Asset, Post, PostType } from '@prisma/client'
import { db } from './db'
import { dryGraph, graph, mediaInsights, publish, token, type GraphClient, type PublishInput } from './instagram'
import { mediaUrl } from './media'
import { explain } from './meta-errors'
import { notify } from './notify'
import { engagement, median, relativeScore } from './score'

const MAX_ATTEMPTS = 3

export async function autoApprove(now = new Date()) {
  const r = await db.post.updateMany({ where: { status: 'PENDING_REVIEW', reviewDueAt: { lte: now } }, data: { status: 'APPROVED' } })
  return r.count
}

export function publishInput(post: Post & { assets: Asset[] }, igUserId: string): PublishInput {
  const slides = post.assets.filter((a) => a.kind === 'SLIDE').sort((a, b) => a.position - b.position)
  const video = post.assets.find((a) => a.kind === 'VIDEO')
  const media = post.type === 'REEL' ? (video ? [{ url: mediaUrl(video.path), video: true }] : []) : slides.map((s) => ({ url: mediaUrl(s.path) }))
  if (!media.length) throw new Error('El post no tiene piezas renderizadas')
  return { igUserId, kind: post.type as PostType, caption: post.caption, media: post.type === 'CAROUSEL' ? media : media.slice(0, 1), altText: post.altText ?? undefined }
}

export async function publishDue(now = new Date(), log: (s: string) => void = console.log) {
  const due = await db.post.findMany({ where: { status: 'APPROVED', scheduledAt: { lte: now } }, include: { app: true, assets: true }, orderBy: { scheduledAt: 'asc' }, take: 10 })
  let realToken: string | null = null
  for (const post of due) {
    const app = post.app
    if (app.paused) continue
    const claimed = await db.post.updateMany({ where: { id: post.id, status: 'APPROVED' }, data: { status: 'PUBLISHING', attempts: { increment: 1 } } })
    if (!claimed.count) continue
    try {
      let g: GraphClient
      if (app.dryRun) g = dryGraph((l) => log(`[simulación ${app.slug}] ${l}`))
      else {
        if (!app.igUserId) throw new Error('La app no tiene cuenta de Instagram conectada')
        realToken ??= await token()
        g = graph(realToken)
      }
      const r = await publish(g, publishInput(post, app.igUserId ?? 'sim'), app.dryRun ? { tries: 1, everyMs: 0 } : undefined)
      await db.post.update({ where: { id: post.id }, data: { status: 'PUBLISHED', igMediaId: app.dryRun ? null : r.mediaId, permalink: app.dryRun ? null : r.permalink, publishedAt: new Date(), error: app.dryRun ? 'Simulación: no se publicó en Instagram' : null } })
      if (!app.dryRun && post.type !== 'STORY') await notify(`✅ ${app.name}: publicado ${r.permalink ?? ''}\nRespondé los comentarios en la primera hora: es cuando más se distribuye.`)
    } catch (e) {
      const x = explain(e)
      const attempts = post.attempts + 1
      if (x.retry && attempts < MAX_ATTEMPTS) {
        await db.post.update({ where: { id: post.id }, data: { status: 'APPROVED', scheduledAt: new Date(Date.now() + 10 * 60e3 * 2 ** attempts), error: `${x.title}: ${x.cause} (reintento ${attempts})` } })
      } else {
        await db.post.update({ where: { id: post.id }, data: { status: 'FAILED', error: `${x.title}: ${x.cause} → ${x.fix}` } })
        await notify(`⚠️ ${app.name}: no se pudo publicar. ${x.title}: ${x.cause}. ${x.fix}`)
      }
    }
  }
  return due.length
}

const SNAPSHOTS = [24, 72, 168]

export async function collectInsights(now = new Date()) {
  const posts = await db.post.findMany({
    where: { status: 'PUBLISHED', igMediaId: { not: null }, publishedAt: { gte: new Date(now.getTime() - 9 * 864e5) } },
    include: { insights: true, app: true },
  })
  if (!posts.length) return 0
  const g = graph(await token())
  let n = 0
  for (const p of posts) {
    const age = (now.getTime() - p.publishedAt!.getTime()) / 3600e3
    for (const h of SNAPSHOTS) {
      if (age < h || p.insights.some((s) => s.hoursAfter === h)) continue
      if (p.type === 'STORY' && h > 24) continue // las stories duran 24 h
      try {
        const m = await mediaInsights(g, p.igMediaId!, p.type)
        await db.insightSnapshot.create({
          data: { postId: p.id, hoursAfter: h, reach: m.reach, views: m.views, likes: m.likes, comments: m.comments, saves: m.saved, shares: m.shares, profileVisits: m.profile_visits, raw: m },
        })
        n++
      } catch (e) {
        console.error(`[métricas] ${p.id}:`, explain(e).title)
      }
    }
  }
  for (const appId of new Set(posts.map((p) => p.appId))) await rescore(appId)
  return n
}

/** Puntaje relativo de cada post publicado de la app (con su última métrica). */
export async function rescore(appId: string) {
  const posts = await db.post.findMany({ where: { appId, status: 'PUBLISHED', type: { not: 'STORY' } }, include: { insights: { orderBy: { hoursAfter: 'desc' }, take: 1 } } })
  const values = posts.filter((p) => p.insights[0]).map((p) => ({ id: p.id, v: engagement(p.insights[0]) }))
  const med = median(values.map((x) => x.v))
  for (const x of values) await db.post.update({ where: { id: x.id }, data: { score: relativeScore(x.v, med) } })
}
