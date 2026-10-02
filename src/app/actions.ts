'use server'
// Acciones de la interfaz. Todas verifican la sesión; las pesadas se encolan para el worker.
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/auth'
import { db } from '@/lib/db'
import { normalizeRepo } from '@/lib/github'
import { enqueue, QUEUES } from '@/lib/jobs'
import { discoverAccounts, graph, adAccounts, token } from '@/lib/instagram'
import { parseManifest } from '@/lib/manifest'
import { activateAd, createPausedAd, pauseAd, refreshAdMetrics } from '@/lib/meta-ads'
import { explain } from '@/lib/meta-errors'
import { draftManifest, logoFromRepo, proposeManifestPR, repoContext } from '@/lib/onboarding/manifest-wizard'
import { healthCheck, type Check } from '@/lib/onboarding/meta-health'
import { buildProfileKit, type ProfileKit } from '@/lib/onboarding/profile-kit'
import { syncApp } from '@/lib/pipeline'
import { nextMonday } from '@/lib/schedule'
import { setSecret, type SecretKey } from '@/lib/settings'

const str = (f: FormData, k: string) => String(f.get(k) ?? '').replace(/\r\n/g, '\n').trim()

// --- Apps -------------------------------------------------------------------

export async function createApp(f: FormData) {
  await requireUser()
  const repo = normalizeRepo(str(f, 'repo'))
  const slug = (str(f, 'slug') || repo.split('/')[1]).toLowerCase().replace(/[^a-z0-9-]+/g, '-')
  const app = await db.app.create({ data: { slug, repo, name: str(f, 'name') || repo.split('/')[1], branch: str(f, 'branch') || 'main', imageModel: str(f, 'imageModel') || null } })
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
      monthlyBudgetUsd: Number(str(f, 'monthlyBudgetUsd') || 5),
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
  // Un lote fallido de esa semana se rehace (planBatch lo detecta).
  await enqueue(QUEUES.runWeekly, { appId: app.id, weekStart: weekStart.toISOString() })
  revalidatePath(`/apps/${slug}`)
}

// --- Revisión ---------------------------------------------------------------

export async function savePost(postId: string, f: FormData) {
  await requireUser()
  const slides = JSON.parse(str(f, 'slides') || '[]')
  const post = await db.post.update({ where: { id: postId }, data: { caption: str(f, 'caption'), altText: str(f, 'altText'), slides, imagePrompt: str(f, 'imagePrompt') || undefined }, include: { app: true } })
  await enqueue(QUEUES.renderPost, { postId, regenerateImage: f.get('regenerateImage') === 'on' })
  revalidatePath(`/apps/${post.app.slug}/revision`)
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
