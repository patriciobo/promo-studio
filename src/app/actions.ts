'use server'
// Acciones de la interfaz. Todas verifican la sesión; las pesadas se encolan para el worker.
import { Prisma, type PostType } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/auth'
import { db } from '@/lib/db'
import { normalizeRepo } from '@/lib/github'
import { addImages, imageFiles, inOrder } from '@/lib/images'
import { enqueue, QUEUES } from '@/lib/jobs'
import { actId, adAccounts, discoverAccounts, graph, token, type AdAccount } from '@/lib/instagram'
import { parseManifest, type Manifest } from '@/lib/manifest'
import { parseImageChoice, parseImageKind } from '@/lib/models'
import { estimateSuggestion, suggestCampaign, type SuggestInput } from '@/lib/ad-suggest'
import { activateCampaign, campaignLink, deleteCampaign, estimateAudience, friendly, pauseCampaign, searchPlaces, searchTargeting, syncCampaign, DETAIL_TYPES, EDUCATION, type Detail, type DetailType, type GeoPlace, type Objective, type Targeting } from '@/lib/meta-ads'
import { explain } from '@/lib/meta-errors'
import { draftManifest, logoFromRepo, proposeManifestPR, proposeStyleChange, repoContext } from '@/lib/onboarding/manifest-wizard'
import { healthCheck, type Check } from '@/lib/onboarding/meta-health'
import { buildProfileKit, type ProfileKit } from '@/lib/onboarding/profile-kit'
import { syncApp } from '@/lib/pipeline'
import { fromLocalInput, nextMonday } from '@/lib/schedule'
import { setSecret, type SecretKey } from '@/lib/settings'
import { designStyle, parseDesignStyle, SAMPLE_MODEL, SAMPLE_QUALITIES } from '@/lib/styles'
import { allItems, parseSampleItems, setSamplesState } from '@/lib/style-samples'
import { suggestStyles } from '@/lib/style-suggest'
import { rm } from 'node:fs/promises'
import { BriefSchema, missingElements, parseBriefForm, parseElements, projectDir, type ElementId, type Found } from '@/lib/brand/brief'
import { readRepoBrand } from '@/lib/brand/repo'
import { saveBrandToRepo, YAML_FIELDS, type YamlField } from '@/lib/brand/save'
import { mediaPath, saveMedia } from '@/lib/media'
import { TEXT_MODELS } from '@/lib/models'
import { digits, sendForReview } from '@/lib/whatsapp'

const str = (f: FormData, k: string) => String(f.get(k) ?? '').replace(/\r\n/g, '\n').trim()

/** Imágenes en las que se basa un pedido: las subidas en el formulario (quedan en la biblioteca) y las elegidas de la biblioteca. */
async function requestImages(app: { id: string; slug: string }, f: FormData) {
  const uploaded = await addImages(app, imageFiles(f.getAll('images')), str(f, 'imageNote').slice(0, 500))
  const picked = f.getAll('imageIds').map(String).filter(Boolean)
  const known = picked.length ? await db.appImage.findMany({ where: { appId: app.id, id: { in: picked } }, select: { id: true } }) : []
  return [...uploaded.map((i) => i.id), ...inOrder(picked, known).map((i) => i.id)]
}

// --- Apps -------------------------------------------------------------------

export async function createApp(f: FormData) {
  await requireUser()
  const repo = normalizeRepo(str(f, 'repo'))
  const slug = (str(f, 'slug') || repo.split('/')[1]).toLowerCase().replace(/[^a-z0-9-]+/g, '-')
  const app = await db.app.create({ data: { slug, repo, name: str(f, 'name') || repo.split('/')[1], branch: str(f, 'branch') || 'main', imageModel: str(f, 'imageModel') || null, imageQuality: str(f, 'imageQuality') || null, imageKind: parseImageKind(str(f, 'imageKind')) ?? null, designStyle: parseDesignStyle(str(f, 'designStyle')) ?? null } })
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
      designStyle: parseDesignStyle(str(f, 'designStyle')) ?? null,
      monthlyBudgetUsd: Number(str(f, 'monthlyBudgetUsd') || 7),
      adMonthlyBudget: str(f, 'adMonthlyBudget') ? Number(str(f, 'adMonthlyBudget')) : null,
      timezone: str(f, 'timezone'),
      postTime: str(f, 'postTime') || '10:00',
      autoApproveHours: Number(str(f, 'autoApproveHours') || 48),
      dryRun: f.get('dryRun') === 'on',
      paused: f.get('paused') === 'on',
      whatsapp: digits(str(f, 'whatsapp')) || null,
    },
  })
  revalidatePath(`/apps/${slug}`, 'layout')
  // Estilo al promo.yaml del repo, si se pidió y es distinto del que ya tiene.
  const style = parseDesignStyle(str(f, 'designStyle'))
  if (f.get('styleToYaml') !== 'on' || !style) return
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  if ((app.manifest as unknown as Manifest | null)?.brand.style === style) return
  let to: string
  try {
    const r = await proposeStyleChange(app, style, designStyle(style).label)
    to = r.url ? `pr=${encodeURIComponent(r.url)}` : r.written ? 'aviso=yaml-escrito' : 'aviso=yaml-igual'
    if (r.written) await syncApp(app.id)
  } catch (e) {
    to = `error=${encodeURIComponent(`El estilo se guardó, pero no se pudo actualizar el promo.yaml: ${(e as Error).message}`)}`
  }
  redirect(`/apps/${slug}/ajustes?${to}`)
}

export async function suggestStylesAction(slug: string, back: 'ajustes' | 'muestras' = 'ajustes') {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  let to = 'aviso=sugeridos#estilo'
  try {
    await suggestStyles(app)
  } catch (e) {
    to = `error=${encodeURIComponent(`No se pudieron sugerir estilos: ${(e as Error).message}`)}#estilo`
  }
  revalidatePath(`/apps/${slug}/${back}`)
  redirect(`/apps/${slug}/${back}?${to}`)
}

/**
 * Muestras de estilo: las combinaciones tildadas con la marca de la app, o todas las genéricas con la app de ejemplo.
 * Las genera el worker.
 */
export async function styleSamplesAction(slug: string, generic: boolean, f: FormData) {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const items = generic ? allItems() : parseSampleItems(f.getAll('sample').map(String))
  if (!items.length) redirect(`/apps/${slug}/muestras?error=${encodeURIComponent('Tildá al menos una calidad de un estilo para probar.')}`)
  await setSamplesState(generic ? undefined : app.slug, { status: 'running', started: new Date().toISOString(), done: 0, total: items.length })
  await enqueue(QUEUES.styleSamples, { appId: generic ? null : app.id, items, force: generic && f.get('force') === '1' }, { singletonKey: `muestras-${generic ? 'genericas' : app.id}` })
  redirect(`/apps/${slug}/muestras?aviso=muestras`)
}

/** Elegir una muestra: el estilo, el modelo de las muestras y esa calidad quedan como los de la app. */
export async function chooseSampleAction(slug: string, style: string, quality: string) {
  await requireUser()
  const id = parseDesignStyle(style)
  const q = SAMPLE_QUALITIES.find((x) => x === quality)
  if (!id || !q) throw new Error('Muestra inválida')
  await db.app.update({ where: { slug }, data: { designStyle: id, imageModel: SAMPLE_MODEL, imageQuality: q } })
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
  // La consigna queda en el lote: si hay que retomarlo, se planifica con la misma.
  const brief = str(f, 'brief').slice(0, 1000) || null
  if (!existing) await db.batch.create({ data: { appId: app.id, weekStart, status: 'PLANNING', brief } })
  else if (brief) await db.batch.update({ where: { id: existing.id }, data: { brief } })
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

/** Post paso a paso sobre un flujo del promo.yaml, con sus capturas en orden. */
export async function createFlowPost(slug: string, flowId: string, f: FormData) {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const flow = (app.manifest as unknown as Manifest | null)?.flows.find((x) => x.id === flowId)
  const type = str(f, 'type') as PostType
  if (!flow || !['CAROUSEL', 'REEL'].includes(type)) return
  const shots = await db.appImage.findMany({ where: { appId: app.id, flowId, archived: false }, orderBy: { step: 'asc' }, select: { id: true } })
  if (!shots.length) return
  const topic = `Cómo ${flow.name.charAt(0).toLowerCase()}${flow.name.slice(1)}${flow.description ? `: ${flow.description}` : ''}. Paso a paso, una captura por paso en este orden.`
  const extra = str(f, 'topic').slice(0, 300)
  const post = await db.post.create({ data: { appId: app.id, type, status: 'DRAFT', hook: flow.name.slice(0, 200), pillar: flow.pillar ?? null } })
  await enqueue(QUEUES.createPost, { postId: post.id, topic: extra ? `${topic} ${extra}` : topic, image: parseImageChoice(str(f, 'imageChoice'), str(f, 'imageKind')), imageIds: shots.map((x) => x.id) })
  redirect(`/apps/${slug}/crear`)
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
  // Las piezas sólo para anuncios nunca van al feed.
  if (!post._count.assets || post.adOnly || !['PENDING_REVIEW', 'APPROVED'].includes(post.status)) return
  await db.post.update({ where: { id: postId }, data: { status: 'APPROVED', scheduledAt: new Date(), reviewDueAt: null, attempts: 0, error: null } })
  await enqueue(QUEUES.tick, {})
  revalidatePath(`/apps/${post.app.slug}`, 'layout')
}

// --- Revisión ---------------------------------------------------------------

export async function savePost(postId: string, f: FormData) {
  await requireUser()
  const slides = JSON.parse(str(f, 'slides') || '[]')
  const before = await db.post.findUniqueOrThrow({ where: { id: postId }, select: { status: true, waNumber: true } })
  // Si el cliente ya la vio y sigue en revisión, al terminar de renderizar se le manda de nuevo con otro número.
  const resend = before.status === 'PENDING_REVIEW' && before.waNumber !== null
  const post = await db.post.update({ where: { id: postId }, data: { caption: str(f, 'caption'), altText: str(f, 'altText'), slides, imagePrompt: str(f, 'imagePrompt') || undefined, ...(resend ? { waNumber: null, error: null } : {}) }, include: { app: true } })
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

export type DiscoverResult = { ok: true; accounts: Awaited<ReturnType<typeof discoverAccounts>>; ads: AdAccount[]; adErrors: string[] } | { ok: false; title: string; cause: string; fix: string }

export async function discover(): Promise<DiscoverResult> {
  await requireUser()
  try {
    const g = graph(await token())
    const [accounts, ads] = await Promise.all([discoverAccounts(g), adAccounts(g)])
    return { ok: true, accounts, ads: ads.accounts, adErrors: ads.errors }
  } catch (e) {
    const x = explain(e)
    return { ok: false, ...x }
  }
}

export async function saveConnection(slug: string, f: FormData) {
  await requireUser()
  const [pageId, igUserId, igUsername] = str(f, 'account').split('|')
  await db.app.update({ where: { slug }, data: { pageId: pageId || null, igUserId: igUserId || null, igUsername: igUsername || null, adAccountId: (str(f, 'adAccountManual') || str(f, 'adAccountId')).replace(/\s/g, '') ? actId((str(f, 'adAccountManual') || str(f, 'adAccountId')).replace(/\s/g, '')) : null } })
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

/** Marcar una parte del kit como aplicada en Instagram (queda guardado). */
export async function profileKitDoneAction(slug: string, done: Record<string, boolean>) {
  await requireUser()
  const clean = Object.fromEntries(Object.entries(done).filter(([k, v]) => ['photo', 'name', 'bio', 'link', 'highlights'].includes(k) && v === true))
  await db.app.update({ where: { slug }, data: { profileKitDone: clean } })
}

// --- Anuncios -----------------------------------------------------------------

const AD_POST_TYPES: PostType[] = ['IMAGE', 'CAROUSEL', 'REEL']
const OBJECTIVE_IDS: Objective[] = ['TRAFFIC', 'AWARENESS', 'ENGAGEMENT', 'WHATSAPP']

/** Monto del formulario (unidades de la moneda, admite coma) → centavos. */
const cents = (v: string) => Math.round(Number(v.replace(',', '.')) * 100)

const json = <T>(v: string, fallback: T): T => {
  try {
    return JSON.parse(v) as T
  } catch {
    return fallback
  }
}

function targetingFrom(f: FormData): Targeting {
  const types = DETAIL_TYPES.map((d) => d.id) as string[]
  const groups = json<Detail[][]>(str(f, 'groups') || '[]', [])
    .map((g) => g.filter((d) => d.id && d.name && types.includes(d.type)).slice(0, 50))
    .filter((g) => g.length)
    .slice(0, 5)
  const places = json<GeoPlace[]>(str(f, 'places') || '[]', [])
    .filter((p) => p.key && p.name && (p.type === 'city' || p.type === 'region'))
    .map((p) => ({ ...p, radius: p.type === 'city' ? Math.min(80, Math.max(0, Number(p.radius ?? 17))) : undefined }))
    .slice(0, 50)
  const gender = str(f, 'gender')
  return {
    countries: str(f, 'countries').toUpperCase().split(/[\s,]+/).filter((c) => /^[A-Z]{2}$/.test(c)),
    places,
    ageMin: Math.max(18, Number(str(f, 'ageMin') || 18)),
    ageMax: Math.min(65, Number(str(f, 'ageMax') || 65)),
    genders: gender === '1' || gender === '2' ? [Number(gender)] : [],
    education: f
      .getAll('education')
      .map(Number)
      .filter((n) => EDUCATION.some((e) => e.id === n)),
    groups,
    interests: [],
    advantage: f.get('advantage') === 'on',
  }
}

/**
 * Nueva campaña con publicaciones ya publicadas, piezas sólo para anuncios y/o una pieza nueva que se genera ahora.
 * Queda como borrador; si no hay que esperar ninguna pieza, se crea en Meta (en pausa) en segundo plano.
 */
export async function createCampaign(slug: string, _prev: { error?: string } | null, f: FormData): Promise<{ error?: string }> {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const objective = (OBJECTIVE_IDS as string[]).includes(str(f, 'objective')) ? str(f, 'objective') : 'TRAFFIC'
  const startAt = fromLocalInput(str(f, 'startAt'), app.timezone) ?? new Date(Date.now() + 3600e3)
  const endAt = fromLocalInput(str(f, 'endAt'), app.timezone) ?? new Date(startAt.getTime() + 7 * 864e5)
  const budget = cents(str(f, 'budget'))
  if (!(budget > 0)) return { error: 'Poné un presupuesto mayor a 0.' }
  if (endAt <= startAt) return { error: 'La fecha de fin tiene que ser posterior al inicio.' }
  const picked = f.getAll('postIds').map(String).filter(Boolean)
  const posts = picked.length ? await db.post.findMany({ where: { appId: app.id, id: { in: picked }, type: { in: AD_POST_TYPES } }, select: { id: true } }) : []
  // Pieza nueva sólo para la campaña: se genera como cualquier post a pedido, pero nunca se publica en el feed.
  const newType = str(f, 'newPostType') as PostType
  const topic = str(f, 'newPostTopic').slice(0, 500)
  let fresh: string | null = null
  if (AD_POST_TYPES.includes(newType) && topic && app.manifest) {
    const post = await db.post.create({ data: { appId: app.id, type: newType, status: 'DRAFT', hook: topic.slice(0, 200), adOnly: true } })
    await enqueue(QUEUES.createPost, { postId: post.id, topic: `${topic}. Es un anuncio pago: una sola idea clara y un llamado a la acción concreto.`, image: parseImageChoice(str(f, 'imageChoice'), str(f, 'imageKind')), imageIds: [] })
    fresh = post.id
  }
  const ids = [...posts.map((p) => p.id), ...(fresh ? [fresh] : [])]
  if (!ids.length) return { error: 'Elegí al menos una publicación o describí la pieza nueva.' }
  const spendCap = str(f, 'spendCap') ? cents(str(f, 'spendCap')) : null
  const campaign = await db.adCampaign.create({
    data: {
      appId: app.id,
      name: (str(f, 'name') || `${app.name} · ${startAt.toISOString().slice(0, 10)}`).slice(0, 120),
      objective,
      budgetType: str(f, 'budgetType') === 'DAILY' ? 'DAILY' : 'LIFETIME',
      budget,
      spendCap: spendCap && spendCap > 0 ? spendCap : null,
      startAt,
      endAt,
      targeting: targetingFrom(f) as object,
      placements: str(f, 'placements') === 'instagram_facebook' ? 'instagram_facebook' : 'instagram',
      cta: str(f, 'cta') || 'LEARN_MORE',
      link: str(f, 'link') || null,
      ads: { create: ids.map((postId) => ({ postId })) },
    },
  })
  // El link con UTM usa el id de la campaña, que recién ahora existe.
  if (campaign.link || objective === 'TRAFFIC') {
    const base = campaign.link ?? (app.manifest as unknown as Manifest | null)?.url
    if (base) await db.adCampaign.update({ where: { id: campaign.id }, data: { link: campaignLink(base, campaign.id) } })
  }
  if (!fresh) await enqueue(QUEUES.pushCampaign, { campaignId: campaign.id })
  redirect(`/apps/${slug}/anuncios#${campaign.id}`)
}

export async function campaignAction(campaignId: string, action: 'push' | 'activate' | 'pause' | 'sync' | 'delete') {
  await requireUser()
  const c = await db.adCampaign.findUniqueOrThrow({ where: { id: campaignId }, include: { app: true } })
  try {
    if (action === 'push') {
      await db.adCampaign.update({ where: { id: c.id }, data: { error: null } })
      await enqueue(QUEUES.pushCampaign, { campaignId })
    } else if (action === 'activate') await activateCampaign(campaignId)
    else if (action === 'pause') await pauseCampaign(campaignId)
    else if (action === 'sync') await syncCampaign(campaignId)
    else await deleteCampaign(campaignId)
  } catch (e) {
    if (action !== 'delete') await db.adCampaign.update({ where: { id: c.id }, data: { error: friendly(e) } })
  }
  revalidatePath(`/apps/${c.app.slug}`, 'layout')
}

export async function targetingSearchAction(slug: string, type: DetailType, q: string) {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  try {
    return { ok: true as const, items: await searchTargeting(app, type, q) }
  } catch (e) {
    return { ok: false as const, error: friendly(e) }
  }
}

export async function placesAction(slug: string, q: string) {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  try {
    return { ok: true as const, items: await searchPlaces(app, q) }
  } catch (e) {
    return { ok: false as const, error: friendly(e) }
  }
}

/** Costo estimado de pedir sugerencias al modelo de texto (se muestra antes de generarlas). */
export async function suggestEstimateAction(slug: string, input: SuggestInput) {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  try {
    return { ok: true as const, ...(await estimateSuggestion(app, input)) }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
}

export async function suggestAction(slug: string, input: SuggestInput) {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  try {
    return { ok: true as const, suggestion: await suggestCampaign(app, { ...input, postIds: input.postIds.slice(0, 10), newPostTopic: input.newPostTopic?.slice(0, 500) }) }
  } catch (e) {
    return { ok: false as const, error: friendly(e) }
  }
}

export async function estimateAction(slug: string, t: Targeting, placements: string, objective: string) {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  try {
    return { ok: true as const, ...(await estimateAudience(app, t, placements, objective)) }
  } catch (e) {
    return { ok: false as const, error: friendly(e) }
  }
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

// --- Identidad de marca (pestaña Marca de cada app) ----------------------------

const REFERENCE_TYPES: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }

/** Logo de referencia subido en el formulario (si vino uno válido). */
async function saveReference(slug: string, f: FormData) {
  const file = imageFiles(f.getAll('reference'))[0]
  if (!file || !(file.type in REFERENCE_TYPES)) return undefined
  return saveMedia(`${projectDir(slug)}/referencia${REFERENCE_TYPES[file.type]}`, Buffer.from(await file.arrayBuffer()))
}

const textModelOf = (f: FormData, fallback: string) => {
  const m = str(f, 'textModel')
  return m && TEXT_MODELS.some((t) => t.id === m) ? m : fallback
}

const brandBack = (slug: string, q = '') => `/apps/${slug}/marca${q ? `?${q}` : ''}`

/** Arranca la identidad de la app: brief con lo que dice el promo.yaml y lo que se encuentra en el repo. */
export async function startBrand(slug: string, f: FormData) {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const m = app.manifest as unknown as Manifest | null
  const fresh = str(f, 'mode') === 'cero'
  const brief = BriefSchema.parse({
    name: m?.name ?? app.name,
    industry: m?.category ?? '',
    offer: m?.description ?? m?.tagline ?? '',
    audience: m?.audience.description ?? '',
    tagline: fresh ? '' : (m?.tagline ?? ''),
    language: m?.languages[0] ?? 'es',
  })
  let found: Found | null = null
  let error: string | null = null
  if (!fresh) {
    try {
      found = (await readRepoBrand(app.repo, app.branch, slug)).found
    } catch (e) {
      error = `No pude leer el repo: ${(e as Error).message}`
    }
  }
  const elements: ElementId[] = found ? missingElements(found) : ['logo', 'paleta', 'tipografia', 'voz', 'tagline', 'patron']
  await db.brandProject.upsert({
    where: { appId: app.id },
    create: { appId: app.id, brief, found: found ?? undefined, elements, textModel: app.textModel, error },
    update: { brief, found: found ?? Prisma.DbNull, elements, error },
  })
  redirect(brandBack(slug, fresh ? 'aviso=cero' : 'aviso=repo'))
}

export async function updateBrandProject(slug: string, f: FormData) {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug }, include: { brand: true } })
  const reference = await saveReference(slug, f)
  await db.brandProject.update({
    where: { appId: app.id },
    data: { brief: parseBriefForm(f), textModel: textModelOf(f, app.brand?.textModel ?? app.textModel), ...(reference ? { referencePath: reference } : {}) },
  })
  revalidatePath(brandBack(slug))
  redirect(brandBack(slug, 'aviso=guardado'))
}

export async function generateBrandRound(slug: string, f: FormData) {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug }, include: { brand: true } })
  const p = app.brand
  if (!p || p.status === 'running') redirect(brandBack(slug))
  const elements = parseElements(f.getAll('elements').map(String))
  await db.brandProject.update({ where: { id: p.id }, data: { elements: elements.length ? elements : p.elements, status: 'running', error: null, progress: { started: new Date().toISOString(), done: 0, total: 1 } } })
  await enqueue(QUEUES.brandRound, { projectId: p.id, logoModel: str(f, 'logoModel') || undefined, notes: str(f, 'notes').slice(0, 500) || undefined })
  revalidatePath(brandBack(slug))
  redirect(brandBack(slug, 'aviso=generando'))
}

export async function chooseBrandOption(slug: string, optionId: string | null) {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  await db.brandProject.update({ where: { appId: app.id }, data: { chosenId: optionId } })
  revalidatePath(brandBack(slug))
}

export async function vectorizeBrandOption(slug: string, optionId: string) {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  await db.brandProject.update({ where: { appId: app.id }, data: { status: 'running', error: null, progress: { started: new Date().toISOString(), vector: optionId } } })
  await enqueue(QUEUES.brandVector, { optionId })
  revalidatePath(brandBack(slug))
}

export async function rereadBrandRepo(slug: string) {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  try {
    const { found } = await readRepoBrand(app.repo, app.branch, slug)
    await db.brandProject.update({ where: { appId: app.id }, data: { found, error: null } })
  } catch (e) {
    await db.brandProject.update({ where: { appId: app.id }, data: { error: `No pude leer el repo: ${(e as Error).message}` } })
  }
  revalidatePath(brandBack(slug))
}

/** Borra el proyecto de identidad de la app (brief, rondas y archivos generados). */
export async function resetBrand(slug: string) {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  await db.brandProject.deleteMany({ where: { appId: app.id } })
  await rm(mediaPath(projectDir(slug)), { recursive: true, force: true })
  revalidatePath(brandBack(slug))
  redirect(brandBack(slug))
}

/** Guarda la alternativa en el repo de la app (PR, commit directo o archivos en un repo local). */
export async function saveBrandAction(slug: string, optionId: string, f: FormData) {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug }, include: { brand: true } })
  if (!app.brand) redirect(brandBack(slug))
  const fields = f.getAll('fields').map(String).filter((x): x is YamlField => YAML_FIELDS.some((y) => y.id === x))
  let to: string
  try {
    const r = await saveBrandToRepo({ ...app.brand, app }, optionId, {
      fields,
      font: str(f, 'font') === 'display' ? 'display' : 'text',
      mode: str(f, 'mode') === 'commit' ? 'commit' : 'pr',
      icons: f.getAll('icons').map(String),
      guide: f.get('guide') === 'on',
    })
    to = `${r.url ? `guardado=${encodeURIComponent(r.url)}` : `aviso=${r.written ? 'escrito' : 'guardado-repo'}`}&archivos=${encodeURIComponent(r.paths.join(','))}`
    if (!r.hasYaml) to += '&sinyaml=1'
  } catch (e) {
    to = `error=${encodeURIComponent(`No se pudo guardar en el repo: ${(e as Error).message}`)}`
  }
  revalidatePath(`/apps/${slug}`, 'layout')
  redirect(brandBack(slug, to))
}

// --- Aprobación por WhatsApp -------------------------------------------------

/** Manda ya al cliente lo que está en revisión y todavía no vio. Con `postId`, vuelve a mandar esa (con número nuevo). */
export async function sendReviewAction(slug: string, postId?: string) {
  await requireUser()
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  if (postId) await db.post.updateMany({ where: { id: postId, appId: app.id, status: 'PENDING_REVIEW' }, data: { waNumber: null, error: null } })
  let r: { sent: number; error?: string }
  try {
    r = await sendForReview(app.id)
  } catch (e) {
    r = { sent: 0, error: (e as Error).message }
  }
  revalidatePath(`/apps/${slug}`, 'layout')
  const q = r.error ? `whatsapp-error=${encodeURIComponent(r.error)}` : `whatsapp=${r.sent}`
  redirect(`/apps/${slug}/revision?${q}`)
}
