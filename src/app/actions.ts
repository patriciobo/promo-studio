'use server'
// Acciones de la interfaz. Todas verifican la sesión; las pesadas se encolan para el worker.
import type { PostType } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/auth'
import { db } from '@/lib/db'
import { normalizeRepo } from '@/lib/github'
import { addImages, imageFiles } from '@/lib/images'
import { enqueue, QUEUES } from '@/lib/jobs'
import { discoverAccounts, graph, adAccounts, token } from '@/lib/instagram'
import { parseManifest } from '@/lib/manifest'
import { parseImageChoice, parseImageKind } from '@/lib/models'
import { activateAd, createPausedAd, pauseAd, refreshAdMetrics } from '@/lib/meta-ads'
import { explain } from '@/lib/meta-errors'
import { draftManifest, logoFromRepo, proposeManifestPR, repoContext } from '@/lib/onboarding/manifest-wizard'
import { healthCheck, type Check } from '@/lib/onboarding/meta-health'
import { buildProfileKit, type ProfileKit } from '@/lib/onboarding/profile-kit'
import { syncApp } from '@/lib/pipeline'
import { fromLocalInput, nextMonday } from '@/lib/schedule'
import { setSecret, type SecretKey } from '@/lib/settings'

const str = (f: FormData, k: string) => String(f.get(k) ?? '').replace(/\r\n/g, '\n').trim()

/** Imágenes en las que se basa un pedido: las subidas en el formulario (quedan en la biblioteca) y las elegidas de la biblioteca. */
async function requestImages(app: { id: string; slug: string }, f: FormData) {
  const uploaded = await addImages(app, imageFiles(f.getAll('images')), str(f, 'imageNote').slice(0, 500))
  const picked = f.getAll('imageIds').map(String).filter(Boolean)
  const known = picked.length ? await db.appImage.findMany({ where: { appId: app.id, id: { in: picked } }, select: { id: true } }) : []
  return [...uploaded.map((i) => i.id), ...known.map((i) => i.id)]
}

// --- Apps -------------------------------------------------------------------

export async function createApp(f: FormData) {
  await requireUser()
  const repo = normalizeRepo(str(f, 'repo'))
  const slug = (str(f, 'slug') || repo.split('/')[1]).toLowerCase().replace(/[^a-z0-9-]+/g, '-')
  const app = await db.app.create({ data: { slug, repo, name: str(f, 'name') || repo.split('/')[1], branch: str(f, 'branch') || 'main', imageModel: str(f, 'imageModel') || null, imageQuality: str(f, 'imageQuality') || null, imageKind: parseImageKind(str(f, 'imageKind')) ?? null } })
  await syncApp(app.id).catch(() => null)
  redirect(`/apps/${app.slug}/manifiesto`)
}

export async function updateSettings(slug: string, f: FormData) {
  await requireUser()
  await db.app.update({
    where: { slug },
    data: {
      name: str(f, 'name'),
      repo: normalizeRepo(str(f, 'repo')),
      branch: str(f, 'branch') || 'main',
      textModel: str(f, 'textModel'),
      imageModel: str(f, 'imageModel') || null,
      imageQuality: str(f, 'imageQuality') || null,
      imageKind: parseImageKind(str(f, 'imageKind')) ?? null,
      monthlyBudgetUsd: Number(str(f, 'monthlyBudgetUsd') || 7),
      timezone: str(f, 'timezone'),
      postTime: str(f, 'postTime') || '10:00',
      autoApproveHours: Number(str(f, 'autoApproveHours') || 48),
      dryRun: f.get('dryRun') === 'on',
      paused: f.get('paused') === 'on',
    },
  })
  revalidatePath(`/apps/${slug}`, 'layout')
}

export async function syncNow(slug: string) {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  await syncApp(app.id)
  revalidatePath(`/apps/${slug}`, 'layout')
}

export async function generateWeek(slug: string, f: FormData) {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const week = str(f, 'week')
  const weekStart = week ? new Date(`${week}T00:00:00Z`) : nextMonday()
  const day = weekStart.toISOString().slice(0, 10)
  const existing = await db.batch.findUnique({ where: { appId_weekStart: { appId: app.id, weekStart } } })
  if (existing?.status === 'READY' && !existing.error) redirect(`/apps/${slug}?aviso=ya-generada&semana=${day}`)
  // El lote aparece enseguida en el Calendario ("Planificando") aunque el worker tarde unos segundos en tomarlo.
  if (!existing) await db.batch.create({ data: { appId: app.id, weekStart, status: 'PLANNING' } })
  const imageIds = await requestImages(app, f)
  // Un lote fallido de esa semana se retoma (planBatch lo detecta).
  await enqueue(QUEUES.runWeekly, { appId: app.id, weekStart: weekStart.toISOString(), image: parseImageChoice(str(f, 'imageChoice'), str(f, 'imageKind')), imageIds }, { singletonKey: `${app.id}-${weekStart.toISOString()}` })
  revalidatePath(`/apps/${slug}`)
  redirect(`/apps/${slug}?aviso=generando&semana=${day}`)
}

// --- A pedido ----------------------------------------------------------------

const POST_TYPES: PostType[] = ['IMAGE', 'CAROUSEL', 'REEL', 'STORY']

export async function createPostNow(slug: string, f: FormData) {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const type = str(f, 'type') as PostType
  if (!POST_TYPES.includes(type) || !app.manifest) return
  const imageIds = await requestImages(app, f)
  // Con imágenes el tema es opcional: el post cuenta lo que muestran.
  const topic = str(f, 'topic').slice(0, 500) || (imageIds.length ? 'Lo que muestran las imágenes elegidas' : '')
  if (!topic) return
  const post = await db.post.create({ data: { appId: app.id, type, status: 'DRAFT', hook: topic.slice(0, 200), pillar: str(f, 'pillar') || null } })
  await enqueue(QUEUES.createPost, { postId: post.id, topic, image: parseImageChoice(str(f, 'imageChoice'), str(f, 'imageKind')), imageIds })
  revalidatePath(`/apps/${slug}`, 'layout')
}

// --- Imágenes -----------------------------------------------------------------

export async function uploadImages(slug: string, f: FormData) {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const imgs = await addImages(app, imageFiles(f.getAll('images')), str(f, 'imageNote').slice(0, 500))
  for (const i of imgs) await enqueue(QUEUES.describeImage, { imageId: i.id })
  revalidatePath(`/apps/${slug}`, 'layout')
}

export async function updateImage(imageId: string, f: FormData) {
  await requireUser()
  const img = await db.appImage.update({ where: { id: imageId }, data: { note: str(f, 'note').slice(0, 500) || null, kind: str(f, 'kind') === 'PHOTO' ? 'PHOTO' : 'SCREENSHOT' }, include: { app: true } })
  revalidatePath(`/apps/${img.app.slug}`, 'layout')
}

/** Archivada: el planificador deja de usarla, pero los posts que ya la usan se siguen viendo igual. */
export async function setImageArchived(imageId: string, archived: boolean) {
  await requireUser()
  const img = await db.appImage.update({ where: { id: imageId }, data: { archived }, include: { app: true } })
  revalidatePath(`/apps/${img.app.slug}`, 'layout')
}

/** Aprueba el post y lo publica ya (el worker lo toma en el momento). */
export async function publishNow(postId: string) {
  await requireUser()
  const post = await db.post.findUniqueOrThrow({ where: { id: postId }, include: { app: true, _count: { select: { assets: true } } } })
  if (!post._count.assets || !['PENDING_REVIEW', 'APPROVED'].includes(post.status)) return
  await db.post.update({ where: { id: postId }, data: { status: 'APPROVED', scheduledAt: new Date(), reviewDueAt: null, attempts: 0, error: null } })
  await enqueue(QUEUES.tick, {})
  revalidatePath(`/apps/${post.app.slug}`, 'layout')
}

// --- Revisión ---------------------------------------------------------------

export async function savePost(postId: string, f: FormData) {
  await requireUser()
  const slides = JSON.parse(str(f, 'slides') || '[]')
  const post = await db.post.update({ where: { id: postId }, data: { caption: str(f, 'caption'), altText: str(f, 'altText'), slides, imagePrompt: str(f, 'imagePrompt') || undefined }, include: { app: true } })
  await enqueue(QUEUES.renderPost, { postId, regenerateImage: f.get('regenerateImage') === 'on', image: parseImageChoice(str(f, 'imageChoice'), str(f, 'imageKind')) })
  revalidatePath(`/apps/${post.app.slug}/revision`)
}

/** Cambia fecha y hora de publicación (en la zona de la app). Vacío = sin fecha: se publica con "Publicar ahora". */
export async function reschedulePost(postId: string, f: FormData) {
  await requireUser()
  const post = await db.post.findUniqueOrThrow({ where: { id: postId }, include: { app: true } })
  if (!['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'FAILED'].includes(post.status)) return
  const value = str(f, 'scheduledAt')
  const parsed = value ? fromLocalInput(value, post.app.timezone) : null
  if (value && !parsed) return
  // Una fecha pasada se toma como "ya": si está aprobado, sale en el próximo minuto.
  const at = parsed ? new Date(Math.max(parsed.getTime(), Date.now())) : null
  // La aprobación automática no puede quedar después de la publicación.
  const reviewDueAt = post.reviewDueAt && at ? new Date(Math.min(post.reviewDueAt.getTime(), at.getTime() - 60e3)) : post.reviewDueAt
  await db.post.update({ where: { id: postId }, data: { scheduledAt: at, reviewDueAt } })
  revalidatePath(`/apps/${post.app.slug}`, 'layout')
}

export async function setPostStatus(postId: string, status: 'APPROVED' | 'REJECTED' | 'PENDING_REVIEW') {
  await requireUser()
  const post = await db.post.update({ where: { id: postId }, data: { status, error: null }, include: { app: true } })
  revalidatePath(`/apps/${post.app.slug}`, 'layout')
}

export async function approveAll(slug: string) {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  await db.post.updateMany({ where: { appId: app.id, status: 'PENDING_REVIEW' }, data: { status: 'APPROVED' } })
  revalidatePath(`/apps/${slug}`, 'layout')
}

export async function retryPost(postId: string) {
  await requireUser()
  const post = await db.post.update({ where: { id: postId }, data: { status: 'APPROVED', attempts: 0, error: null, scheduledAt: new Date() }, include: { app: true } })
  revalidatePath(`/apps/${post.app.slug}`, 'layout')
}

// --- Conexión con Meta -------------------------------------------------------

export type DiscoverResult = { ok: true; accounts: Awaited<ReturnType<typeof discoverAccounts>>; ads: Awaited<ReturnType<typeof adAccounts>> } | { ok: false; title: string; cause: string; fix: string }

export async function discover(): Promise<DiscoverResult> {
  await requireUser()
  try {
    const g = graph(await token())
    const [accounts, ads] = await Promise.all([discoverAccounts(g), adAccounts(g).catch(() => [])])
    return { ok: true, accounts, ads }
  } catch (e) {
    const x = explain(e)
    return { ok: false, ...x }
  }
}

export async function saveConnection(slug: string, f: FormData) {
  await requireUser()
  const [pageId, igUserId, igUsername] = str(f, 'account').split('|')
  await db.app.update({ where: { slug }, data: { pageId: pageId || null, igUserId: igUserId || null, igUsername: igUsername || null, adAccountId: str(f, 'adAccountId') || null } })
  revalidatePath(`/apps/${slug}/conexion`)
}

export async function runHealthCheck(slug: string, withContainer: boolean): Promise<Check[]> {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  return healthCheck(app.id, { createTestContainer: withContainer })
}

// --- Manifiesto ---------------------------------------------------------------

export async function draftManifestAction(slug: string): Promise<{ yaml: string; error?: string }> {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  try {
    const ctx = await repoContext(app.repo)
    const r = await draftManifest(ctx, app.textModel)
    return { yaml: r.yaml, error: r.error }
  } catch (e) {
    return { yaml: '', error: (e as Error).message }
  }
}

export async function validateManifestAction(yaml: string) {
  await requireUser()
  const r = parseManifest(yaml)
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error }
}

export async function openManifestPR(slug: string, yaml: string): Promise<{ url?: string; error?: string }> {
  await requireUser()
  const r = parseManifest(yaml)
  if (!r.ok) return { error: r.error }
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  try {
    const extra = []
    // Si el logo apunta a un archivo del repo fuera de .promo/, se copia ahí.
    const logo = r.manifest.brand.logo
    if (logo && !/^https?:/.test(logo) && !logo.startsWith('.promo/')) {
      const copy = await logoFromRepo(app.repo, logo, app.branch)
      if (copy) extra.push(copy)
    }
    const fixedYaml = extra.length ? yaml.replace(logo!, extra[0].path) : yaml
    return { url: await proposeManifestPR(app.id, fixedYaml, extra) }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// --- Perfil -------------------------------------------------------------------

export async function profileKitAction(slug: string): Promise<{ kit?: ProfileKit; error?: string }> {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  try {
    return { kit: await buildProfileKit(app.id) }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// --- Anuncios -----------------------------------------------------------------

export async function createAdAction(postId: string, f: FormData) {
  await requireUser()
  const post = await db.post.findUniqueOrThrow({ where: { id: postId }, include: { app: true } })
  try {
    await createPausedAd(postId, { dailyBudget: Number(str(f, 'dailyBudget') || 3), days: Number(str(f, 'days') || 5) })
  } catch (e) {
    await db.adDraft.updateMany({ where: { postId }, data: { error: `${explain(e).title}: ${explain(e).fix}` } })
  }
  revalidatePath(`/apps/${post.app.slug}/rendimiento`)
}

export async function adAction(draftId: string, action: 'activate' | 'pause' | 'refresh') {
  await requireUser()
  const d = await db.adDraft.findUniqueOrThrow({ where: { id: draftId }, include: { app: true } })
  try {
    if (action === 'activate') await activateAd(draftId)
    else if (action === 'pause') await pauseAd(draftId)
    else await refreshAdMetrics(draftId)
  } catch (e) {
    await db.adDraft.update({ where: { id: draftId }, data: { error: `${explain(e).title}: ${explain(e).fix}` } })
  }
  revalidatePath(`/apps/${d.app.slug}/rendimiento`)
}

// --- Claves -------------------------------------------------------------------

export async function saveSecrets(f: FormData) {
  await requireUser()
  for (const k of ['META_TOKEN', 'OPENROUTER_API_KEY', 'GITHUB_TOKEN', 'WAHA_URL', 'WAHA_API_KEY', 'WAHA_CHAT_ID'] as SecretKey[]) {
    const v = str(f, k)
    if (v === '__borrar__') await setSecret(k, '')
    else if (v) await setSecret(k, v)
  }
  revalidatePath('/configuracion')
}
