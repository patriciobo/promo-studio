// Campañas con la Marketing API: 1 campaña → 1 conjunto (presupuesto, fechas, público) → 1 anuncio por publicación.
// Siempre se crean en PAUSA; activarlas es una acción explícita, con el monto a la vista y el tope mensual de la app.
import type { AdCampaign, App, Asset, Post } from '@prisma/client'
import { readFile } from 'node:fs/promises'
import { db } from './db'
import { actId, dryGraph, graph, token, type GraphClient } from './instagram'
import { mediaPath, mediaUrl } from './media'
import { explain, MetaError } from './meta-errors'
import { OBJECTIVES, type Targeting } from './meta-ads-options'
import { manifestOf } from './pipeline'

export { CTAS, OBJECTIVES, type Objective, type Targeting } from './meta-ads-options'

type CampaignSpec = Pick<AdCampaign, 'name' | 'objective' | 'budgetType' | 'budget' | 'spendCap' | 'startAt' | 'endAt' | 'placements' | 'cta' | 'link'> & { targeting: Targeting }

const objectiveOf = (id: string) => OBJECTIVES.find((o) => o.id === id) ?? OBJECTIVES[0]
export const campaignDays = (c: Pick<AdCampaign, 'startAt' | 'endAt'>) => Math.max(1, Math.round((c.endAt.getTime() - c.startAt.getTime()) / 864e5))

/** Lo máximo que puede gastar la campaña, en centavos: el total, o diario × días; con tope duro si es menor. */
export function plannedSpend(c: Pick<AdCampaign, 'budgetType' | 'budget' | 'spendCap' | 'startAt' | 'endAt'>) {
  const max = c.budgetType === 'DAILY' ? c.budget * campaignDays(c) : c.budget
  return c.spendCap ? Math.min(max, c.spendCap) : max
}

export function targetingSpec(t: Targeting, placements: string) {
  const fb = placements === 'instagram_facebook'
  return {
    geo_locations: { countries: t.countries.length ? t.countries : ['AR'] },
    age_min: Math.max(18, t.ageMin),
    age_max: Math.min(65, t.ageMax),
    ...(t.interests.length ? { flexible_spec: [{ interests: t.interests.map(({ id, name }) => ({ id, name })) }] } : {}),
    targeting_automation: { advantage_audience: t.advantage ? 1 : 0 },
    publisher_platforms: fb ? ['instagram', 'facebook'] : ['instagram'],
    instagram_positions: ['stream', 'story', 'reels', 'explore'],
    ...(fb ? { facebook_positions: ['feed', 'story', 'facebook_reels'] } : {}),
  }
}

/** Pedidos de campaña y conjunto (separado para testearlo). */
export function campaignRequests(c: CampaignSpec, pageId: string) {
  const o = objectiveOf(c.objective)
  return {
    campaign: {
      name: c.name,
      objective: o.meta,
      status: 'PAUSED',
      buying_type: 'AUCTION',
      special_ad_categories: '[]',
      is_adset_budget_sharing_enabled: false,
      ...(c.spendCap ? { spend_cap: c.spendCap } : {}),
    },
    adset: (campaignId: string) => ({
      name: `${c.name} · conjunto`,
      campaign_id: campaignId,
      ...(c.budgetType === 'DAILY' ? { daily_budget: c.budget } : { lifetime_budget: c.budget }),
      billing_event: 'IMPRESSIONS',
      optimization_goal: o.goal,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      start_time: c.startAt.toISOString(),
      end_time: c.endAt.toISOString(),
      targeting: JSON.stringify(targetingSpec(c.targeting, c.placements)),
      ...(c.objective === 'WHATSAPP' ? { destination_type: 'WHATSAPP', promoted_object: JSON.stringify({ page_id: pageId }) } : {}),
      status: 'PAUSED',
    }),
  }
}

const callToAction = (c: Pick<CampaignSpec, 'objective' | 'cta' | 'link'>) =>
  c.objective === 'WHATSAPP' ? { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP' } } : c.link ? { type: c.cta, value: { link: c.link } } : undefined

/** Creatividad que promociona una publicación que ya está en Instagram (como "Promocionar" en Business Suite). */
export function boostCreative(c: Pick<CampaignSpec, 'name' | 'objective' | 'cta' | 'link'>, o: { pageId: string; igUserId: string; mediaId: string }) {
  const cta = callToAction(c)
  return {
    name: `${c.name} · creatividad`,
    object_id: o.pageId,
    instagram_user_id: o.igUserId,
    source_instagram_media_id: o.mediaId,
    ...(cta ? { call_to_action: JSON.stringify(cta) } : {}),
  }
}

/** Creatividad de una pieza sólo para anuncios (no está en el feed): imagen, carrusel o video ya subidos a la cuenta. */
export function adOnlyCreative(
  c: Pick<CampaignSpec, 'name' | 'objective' | 'cta' | 'link'>,
  o: { pageId: string; igUserId: string; message: string; headline: string; link: string; images: string[]; videoId?: string },
) {
  const cta = callToAction({ ...c, link: c.link ?? o.link }) ?? { type: 'LEARN_MORE', value: { link: o.link } }
  const story = o.videoId
    ? { video_data: { video_id: o.videoId, image_hash: o.images[0], message: o.message, title: o.headline, call_to_action: cta } }
    : o.images.length > 1
      ? {
          link_data: {
            link: o.link,
            message: o.message,
            child_attachments: o.images.map((h) => ({ link: o.link, image_hash: h, name: o.headline, call_to_action: cta })),
            multi_share_optimized: false,
            multi_share_end_card: false,
            call_to_action: cta,
          },
        }
      : { link_data: { link: o.link, message: o.message, name: o.headline, image_hash: o.images[0], call_to_action: cta } }
  return { name: `${c.name} · creatividad`, object_story_spec: JSON.stringify({ page_id: o.pageId, instagram_user_id: o.igUserId, ...story }) }
}

/** Link con UTM para medir los clics de la campaña. */
export function campaignLink(base: string, campaignId: string) {
  return `${base}${base.includes('?') ? '&' : '?'}utm_source=instagram&utm_medium=paid&utm_campaign=${campaignId}`
}

/** Texto del anuncio: el caption sin la línea de hashtags. */
export const adMessage = (caption: string) =>
  caption
    .split('\n')
    .filter((l) => !/^(#\S+\s*)+$/.test(l.trim()))
    .join('\n')
    .trim()
    .slice(0, 2000)

// ---------------------------------------------------------------------------

type Ctx = { g: GraphClient; act: string; sim: boolean }

async function context(app: App): Promise<Ctx> {
  if (!app.adAccountId || !app.pageId || !app.igUserId) throw new Error('Falta conectar Instagram, la página y la cuenta publicitaria (pestaña Instagram)')
  const sim = app.dryRun
  return { g: sim ? dryGraph((l) => console.log(`[simulación anuncios ${app.slug}] ${l}`)) : graph(await token()), act: actId(app.adAccountId), sim }
}

/** Moneda y presupuesto mínimo diario (en centavos) de la cuenta publicitaria. */
export async function accountInfo(app: App) {
  const { g, act, sim } = await context(app)
  if (sim) return { currency: 'USD', minDaily: 100, name: 'Simulación', active: true }
  const r = await g.get<{ currency: string; min_daily_budget?: number; account_status: number; name: string }>(act, { fields: 'currency,min_daily_budget,account_status,name' })
  return { currency: r.currency, minDaily: Number(r.min_daily_budget ?? 100), name: r.name, active: r.account_status === 1 }
}

/** Valida el presupuesto contra el mínimo de Meta: diario ≥ mínimo, total ≥ mínimo × días. Devuelve el error o null. */
export function budgetError(c: Pick<AdCampaign, 'budgetType' | 'budget' | 'startAt' | 'endAt'>, minDaily: number, currency: string) {
  const days = campaignDays(c)
  const min = c.budgetType === 'DAILY' ? minDaily : minDaily * days
  if (c.budget < min) return `El mínimo de Meta para esta cuenta es ${(min / 100).toFixed(2)} ${currency} ${c.budgetType === 'DAILY' ? 'por día' : `en total para ${days} días`}.`
  return null
}

async function uploadImage({ g, act, sim }: Ctx, rel: string) {
  if (sim) return 'sim-hash'
  const r = await g.post<{ images: Record<string, { hash: string }> }>(`${act}/adimages`, { bytes: (await readFile(mediaPath(rel))).toString('base64') })
  return Object.values(r.images)[0].hash
}

async function uploadVideo({ g, act, sim }: Ctx, rel: string) {
  if (sim) return 'sim-video'
  const { id } = await g.post<{ id: string }>(`${act}/advideos`, { file_url: mediaUrl(rel) })
  // El anuncio no se puede crear hasta que Meta termina de procesar el video.
  for (let i = 0; i < 40; i++) {
    const s = await g.get<{ status?: { video_status?: string } }>(id, { fields: 'status' })
    if (s.status?.video_status === 'ready') return id
    if (s.status?.video_status === 'error') throw new Error('Meta no pudo procesar el video')
    await new Promise((r) => setTimeout(r, 3000))
  }
  throw new Error('Meta tardó demasiado en procesar el video; probá de nuevo en unos minutos')
}

async function creativeFor(ctx: Ctx, app: App, c: CampaignSpec, post: Post & { assets: Asset[] }) {
  const ids = { pageId: app.pageId!, igUserId: app.igUserId! }
  if (!post.adOnly) {
    if (!post.igMediaId) throw new Error('La publicación no está en Instagram (¿se publicó en simulación?)')
    return boostCreative(c, { ...ids, mediaId: post.igMediaId })
  }
  const slides = post.assets.filter((a) => a.kind === 'SLIDE').sort((a, b) => a.position - b.position)
  const video = post.assets.find((a) => a.kind === 'VIDEO')
  if (!slides.length) throw new Error('La publicación todavía no tiene piezas renderizadas')
  const images = []
  for (const s of post.type === 'CAROUSEL' ? slides.slice(0, 10) : slides.slice(0, 1)) images.push(await uploadImage(ctx, s.path))
  const videoId = post.type === 'REEL' && video ? await uploadVideo(ctx, video.path) : undefined
  const link = c.link ?? manifestOf(app).url
  return adOnlyCreative(c, { ...ids, message: adMessage(post.caption), headline: (post.hook ?? app.name).slice(0, 40), link, images, videoId })
}

/**
 * Crea (o completa, si quedó a medias) la campaña en Meta, en pausa. Cada anuncio guarda su error sin frenar a los demás.
 * Con la app en simulación no llama a Meta: inventa ids.
 */
export async function pushCampaign(campaignId: string) {
  const c = await db.adCampaign.findUniqueOrThrow({ where: { id: campaignId }, include: { app: true, ads: { include: { post: { include: { assets: true } } } } } })
  const app = c.app
  const spec = { ...c, targeting: c.targeting as unknown as Targeting }
  try {
    const ctx = await context(app)
    const info = await accountInfo(app)
    if (!info.active) throw new Error(`La cuenta publicitaria ${info.name} no está activa (revisá el medio de pago)`)
    const low = budgetError(c, info.minDaily, info.currency)
    if (low) throw new Error(low)
    const req = campaignRequests(spec, app.pageId!)
    const metaCampaign = c.campaignId ?? (await ctx.g.post<{ id: string }>(`${ctx.act}/campaigns`, req.campaign)).id
    await db.adCampaign.update({ where: { id: c.id }, data: { campaignId: metaCampaign, currency: info.currency, simulated: ctx.sim } })
    const adSet = c.adSetId ?? (await ctx.g.post<{ id: string }>(`${ctx.act}/adsets`, req.adset(metaCampaign))).id
    await db.adCampaign.update({ where: { id: c.id }, data: { adSetId: adSet, status: c.status === 'DRAFT' ? 'PAUSED' : c.status, error: null } })
    let ok = 0
    for (const ad of c.ads) {
      if (ad.adId) {
        ok++
        continue
      }
      try {
        const creative = ad.creativeId ?? (await ctx.g.post<{ id: string }>(`${ctx.act}/adcreatives`, await creativeFor(ctx, app, spec, ad.post))).id
        await db.ad.update({ where: { id: ad.id }, data: { creativeId: creative } })
        const r = await ctx.g.post<{ id: string }>(`${ctx.act}/ads`, { name: `${c.name} · ${ad.post.hook?.slice(0, 40) ?? ad.post.type}`, adset_id: adSet, creative: JSON.stringify({ creative_id: creative }), status: 'PAUSED' })
        await db.ad.update({ where: { id: ad.id }, data: { adId: r.id, error: null } })
        ok++
      } catch (e) {
        await db.ad.update({ where: { id: ad.id }, data: { error: friendly(e) } })
      }
    }
    if (!ok) throw new Error('No se pudo crear ningún anuncio: mirá el error de cada publicación')
  } catch (e) {
    await db.adCampaign.update({ where: { id: c.id }, data: { error: friendly(e) } })
    throw e
  }
}

/** Error legible: para los de Meta, su mensaje textual (dice qué campo rechazó) más el arreglo sugerido. */
export const friendly = (e: unknown) => {
  if (!(e instanceof MetaError)) return (e as Error).message
  const x = explain(e)
  return `${x.title}: ${e.metaMessage} → ${x.fix}`
}

/** Gasto máximo comprometido este mes por las campañas activas de la app (centavos). */
export async function committedThisMonth(appId: string, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const active = await db.adCampaign.findMany({ where: { appId, status: 'ACTIVE', endAt: { gte: start } } })
  return active.reduce((n, c) => n + plannedSpend(c), 0)
}

/** Activa campaña, conjunto y anuncios. Sólo tras la confirmación del usuario; respeta el tope mensual de la app. */
export async function activateCampaign(campaignId: string) {
  const c = await db.adCampaign.findUniqueOrThrow({ where: { id: campaignId }, include: { app: true, ads: true } })
  if (!c.campaignId || !c.adSetId) throw new Error('La campaña todavía no está creada en Meta')
  if (c.endAt < new Date()) throw new Error('La fecha de fin ya pasó: cambiá las fechas')
  if (c.app.adMonthlyBudget != null) {
    const cap = Math.round(c.app.adMonthlyBudget * 100)
    const used = await committedThisMonth(c.appId)
    if (used + plannedSpend(c) > cap) throw new Error(`Supera el tope mensual de anuncios de la app (${(cap / 100).toFixed(2)}; ya comprometido ${(used / 100).toFixed(2)}). Subilo en Ajustes o bajá el presupuesto.`)
  }
  const { g } = await context(c.app)
  for (const id of [c.campaignId, c.adSetId, ...c.ads.flatMap((a) => (a.adId ? [a.adId] : []))]) await g.post(id, { status: 'ACTIVE' })
  return db.adCampaign.update({ where: { id: c.id }, data: { status: 'ACTIVE', error: null } })
}

export async function pauseCampaign(campaignId: string) {
  const c = await db.adCampaign.findUniqueOrThrow({ where: { id: campaignId }, include: { app: true } })
  if (c.campaignId) await (await context(c.app)).g.post(c.campaignId, { status: 'PAUSED' })
  return db.adCampaign.update({ where: { id: c.id }, data: { status: 'PAUSED' } })
}

/** Borra la campaña: en Meta queda eliminada (no se puede reactivar) y acá desaparece. */
export async function deleteCampaign(campaignId: string) {
  const c = await db.adCampaign.findUniqueOrThrow({ where: { id: campaignId }, include: { app: true } })
  if (c.campaignId) await (await context(c.app)).g.post(c.campaignId, { status: 'DELETED' })
  await db.adCampaign.delete({ where: { id: c.id } })
}

const INSIGHT_FIELDS = 'spend,reach,impressions,clicks,cpc,ctr,actions'

/** Estado de entrega, rechazos y resultados desde Meta. Las campañas vencidas pasan a COMPLETED. */
export async function syncCampaign(campaignId: string, now = new Date()) {
  const c = await db.adCampaign.findUniqueOrThrow({ where: { id: campaignId }, include: { app: true, ads: true } })
  const done = c.status === 'ACTIVE' && c.endAt < now ? { status: 'COMPLETED' } : {}
  if (!c.campaignId || c.simulated) return db.adCampaign.update({ where: { id: c.id }, data: { ...done, syncedAt: now } })
  const { g } = await context(c.app)
  const camp = await g.get<{ effective_status?: string }>(c.campaignId, { fields: 'effective_status' })
  const ins = await g.get<{ data: Record<string, unknown>[] }>(`${c.campaignId}/insights`, { fields: INSIGHT_FIELDS, date_preset: 'maximum' })
  for (const ad of c.ads) {
    if (!ad.adId) continue
    const a = await g.get<{ effective_status?: string; issues_info?: { error_message?: string; error_summary?: string }[]; ad_review_feedback?: { global?: Record<string, string> } }>(ad.adId, {
      fields: 'effective_status,issues_info,ad_review_feedback',
    })
    const ai = await g.get<{ data: Record<string, unknown>[] }>(`${ad.adId}/insights`, { fields: INSIGHT_FIELDS, date_preset: 'maximum' })
    const issues = [...(a.issues_info ?? []).map((i) => i.error_summary ?? i.error_message ?? ''), ...Object.values(a.ad_review_feedback?.global ?? {})].filter(Boolean).join(' · ')
    await db.ad.update({ where: { id: ad.id }, data: { effectiveStatus: a.effective_status ?? null, issues: issues || null, metrics: (ai.data?.[0] ?? {}) as object } })
  }
  return db.adCampaign.update({ where: { id: c.id }, data: { ...done, effectiveStatus: camp.effective_status ?? null, metrics: (ins.data?.[0] ?? {}) as object, syncedAt: now } })
}

/** Lo corre el worker: campañas en Meta que no terminaron. */
export async function syncActiveCampaigns(now = new Date()) {
  const list = await db.adCampaign.findMany({ where: { status: { in: ['ACTIVE', 'PAUSED'] }, campaignId: { not: null }, endAt: { gte: new Date(now.getTime() - 3 * 864e5) } } })
  for (const c of list) await syncCampaign(c.id, now).catch((e) => db.adCampaign.update({ where: { id: c.id }, data: { error: friendly(e) } }))
  return list.length
}

/** Intereses de Meta para segmentar (los ids son los que pide la API). */
export async function searchInterests(app: App, q: string) {
  if (q.trim().length < 2) return []
  const { g, sim } = await context(app)
  if (sim) return [{ id: 'sim-1', name: `${q} (simulación)`, size: 0 }]
  const r = await g.get<{ data: { id: string; name: string; audience_size_lower_bound?: number }[] }>('search', { type: 'adinterest', q, limit: 10, locale: 'es_LA' })
  return r.data.map((i) => ({ id: i.id, name: i.name, size: i.audience_size_lower_bound ?? 0 }))
}

/** Tamaño estimado del público (personas activas por mes) para la segmentación y el objetivo. */
export async function estimateAudience(app: App, t: Targeting, placements: string, objective: string) {
  const { g, act, sim } = await context(app)
  if (sim) return { lower: 0, upper: 0 }
  const r = await g.get<{ data: { estimate_mau_lower_bound?: number; estimate_mau_upper_bound?: number }[] }>(`${act}/delivery_estimate`, {
    targeting_spec: JSON.stringify(targetingSpec(t, placements)),
    optimization_goal: objectiveOf(objective).goal,
  })
  return { lower: r.data?.[0]?.estimate_mau_lower_bound ?? 0, upper: r.data?.[0]?.estimate_mau_upper_bound ?? 0 }
}
