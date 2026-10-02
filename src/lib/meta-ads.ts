// Anuncios con la Marketing API: siempre se crean en PAUSA. Activarlos es una acción explícita.
import { db } from './db'
import { graph, token, type GraphClient } from './instagram'
import { manifestOf } from './pipeline'

export interface AdInput {
  dailyBudget: number // en la moneda de la cuenta publicitaria, unidades enteras (p. ej. 3 = US$ 3)
  days: number
  objective?: 'OUTCOME_TRAFFIC' | 'OUTCOME_AWARENESS'
}

/** Pedidos a la Marketing API (separado para testearlo). */
export function adRequests(o: { name: string; pageId: string; igUserId: string; mediaId: string; link: string; countries: string[]; ageMin: number; ageMax: number; dailyBudgetCents: number; start: Date; end: Date; objective: string }) {
  const targeting = {
    geo_locations: { countries: o.countries.length ? o.countries : ['AR'] },
    age_min: Math.max(18, o.ageMin),
    age_max: Math.min(65, o.ageMax),
    publisher_platforms: ['instagram'],
    instagram_positions: ['stream', 'story', 'reels', 'explore'],
  }
  return {
    campaign: { name: o.name, objective: o.objective, status: 'PAUSED', special_ad_categories: '[]', is_adset_budget_sharing_enabled: false },
    adset: (campaignId: string) => ({
      name: `${o.name} · conjunto`,
      campaign_id: campaignId,
      daily_budget: o.dailyBudgetCents,
      billing_event: 'IMPRESSIONS',
      optimization_goal: o.objective === 'OUTCOME_TRAFFIC' ? 'LINK_CLICKS' : 'REACH',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      start_time: o.start.toISOString(),
      end_time: o.end.toISOString(),
      targeting: JSON.stringify(targeting),
      status: 'PAUSED',
    }),
    creative: {
      name: `${o.name} · creatividad`,
      object_id: o.pageId,
      instagram_user_id: o.igUserId,
      source_instagram_media_id: o.mediaId,
      call_to_action: JSON.stringify({ type: 'LEARN_MORE', value: { link: o.link } }),
    },
    ad: (adsetId: string, creativeId: string) => ({ name: o.name, adset_id: adsetId, creative: JSON.stringify({ creative_id: creativeId }), status: 'PAUSED' }),
  }
}

export async function createPausedAd(postId: string, input: AdInput, g?: GraphClient) {
  const post = await db.post.findUniqueOrThrow({ where: { id: postId }, include: { app: true } })
  const app = post.app
  if (!post.igMediaId) throw new Error('El post no está publicado en Instagram')
  if (!app.adAccountId || !app.pageId || !app.igUserId) throw new Error('Falta conectar la cuenta publicitaria, la página o Instagram (Conexión)')
  const m = manifestOf(app)
  const client = g ?? graph(await token())
  const act = app.adAccountId.startsWith('act_') ? app.adAccountId : `act_${app.adAccountId}`
  const start = new Date(Date.now() + 3600e3)
  const end = new Date(start.getTime() + input.days * 864e5)
  const link = `${m.url}${m.url.includes('?') ? '&' : '?'}utm_source=instagram&utm_medium=paid&utm_campaign=${post.id}`
  const req = adRequests({
    name: `${app.name} · ${post.hook?.slice(0, 40) ?? post.type} · ${new Date().toISOString().slice(0, 10)}`,
    pageId: app.pageId,
    igUserId: app.igUserId,
    mediaId: post.igMediaId,
    link,
    countries: m.audience.countries,
    ageMin: m.audience.age[0],
    ageMax: m.audience.age[1],
    dailyBudgetCents: Math.round(input.dailyBudget * 100),
    start,
    end,
    objective: input.objective ?? 'OUTCOME_TRAFFIC',
  })
  const draft = await db.adDraft.upsert({
    where: { postId },
    create: { postId, appId: app.id, objective: req.campaign.objective, dailyBudget: req.adset('x').daily_budget, days: input.days },
    update: { error: null, objective: req.campaign.objective, dailyBudget: req.adset('x').daily_budget, days: input.days },
  })
  try {
    const campaign = await client.post<{ id: string }>(`${act}/campaigns`, req.campaign)
    const adset = await client.post<{ id: string }>(`${act}/adsets`, req.adset(campaign.id))
    const creative = await client.post<{ id: string }>(`${act}/adcreatives`, req.creative)
    const ad = await client.post<{ id: string }>(`${act}/ads`, req.ad(adset.id, creative.id))
    return db.adDraft.update({ where: { id: draft.id }, data: { campaignId: campaign.id, adSetId: adset.id, creativeId: creative.id, adId: ad.id, status: 'PAUSED' } })
  } catch (e) {
    await db.adDraft.update({ where: { id: draft.id }, data: { error: (e as Error).message } })
    throw e
  }
}

/** Activa campaña, conjunto y anuncio. Sólo se llama tras la confirmación del usuario en la web. */
export async function activateAd(draftId: string) {
  const d = await db.adDraft.findUniqueOrThrow({ where: { id: draftId } })
  if (!d.campaignId || !d.adSetId || !d.adId) throw new Error('El borrador no se creó completo en Meta')
  const g = graph(await token())
  for (const id of [d.campaignId, d.adSetId, d.adId]) await g.post(id, { status: 'ACTIVE' })
  return db.adDraft.update({ where: { id: draftId }, data: { status: 'ACTIVE' } })
}

export async function pauseAd(draftId: string) {
  const d = await db.adDraft.findUniqueOrThrow({ where: { id: draftId } })
  const g = graph(await token())
  if (d.adId) await g.post(d.adId, { status: 'PAUSED' })
  return db.adDraft.update({ where: { id: draftId }, data: { status: 'PAUSED' } })
}

export async function refreshAdMetrics(draftId: string) {
  const d = await db.adDraft.findUniqueOrThrow({ where: { id: draftId } })
  if (!d.adId) return d
  const g = graph(await token())
  const r = await g.get<{ data: Record<string, string>[] }>(`${d.adId}/insights`, { fields: 'spend,reach,impressions,clicks,cpc,ctr', date_preset: 'maximum' })
  return db.adDraft.update({ where: { id: draftId }, data: { metrics: r.data?.[0] ?? {} } })
}
