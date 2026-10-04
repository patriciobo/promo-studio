// API de Instagram (Graph API con login de Facebook y token de usuario de sistema).
// Flujo de publicación: contenedor → esperar FINISHED → media_publish (igual que el piloto de Mi Tenis).
import { env } from './env'
import { MetaError } from './meta-errors'
import { getSecret } from './settings'

export type Params = Record<string, string | number | boolean | undefined>

export interface GraphClient {
  get<T = Record<string, unknown>>(path: string, params?: Params): Promise<T>
  post<T = Record<string, unknown>>(path: string, params?: Params): Promise<T>
}

export async function token() {
  const t = await getSecret('META_TOKEN')
  if (!t) throw new MetaError(190, undefined, 'Falta el token de Meta (Configuración → Claves).', 'token')
  return t
}

/** Cliente real. */
export function graph(accessToken: string, base = env.metaGraph): GraphClient {
  const req = async (method: 'GET' | 'POST', path: string, params: Params = {}) => {
    const body = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v !== undefined) body.set(k, String(v))
    body.set('access_token', accessToken)
    const url = `${base}/${path}`
    const res = method === 'GET' ? await fetch(`${url}?${body}`) : await fetch(url, { method, body })
    const json = (await res.json().catch(() => ({}))) as { error?: { code?: number; error_subcode?: number; message?: string; error_user_msg?: string } }
    if (!res.ok || json.error) throw new MetaError(json.error?.code, json.error?.error_subcode, json.error?.error_user_msg ?? json.error?.message ?? `HTTP ${res.status}`, path)
    return json
  }
  return { get: (p, q) => req('GET', p, q) as never, post: (p, q) => req('POST', p, q) as never }
}

/** Cliente de simulación: registra los pedidos y devuelve IDs falsos. */
export function dryGraph(log: (line: string) => void): GraphClient {
  let n = 0
  return {
    async get(path) {
      log(`GET ${path}`)
      if (path.endsWith('content_publishing_limit')) return { data: [{ quota_usage: 0, config: { quota_total: 100 } }] } as never
      return { status_code: 'FINISHED', permalink: 'https://www.instagram.com/p/simulado/' } as never
    },
    async post(path, params) {
      log(`POST ${path} ${JSON.stringify(params)}`)
      return { id: `sim-${++n}` } as never
    },
  }
}

export type PublishKind = 'IMAGE' | 'CAROUSEL' | 'REEL' | 'STORY'

export interface PublishInput {
  igUserId: string
  kind: PublishKind
  caption: string
  /** URLs públicas: imágenes JPEG (IMAGE, CAROUSEL, STORY) o un video MP4 (REEL, STORY en video). */
  media: { url: string; video?: boolean }[]
  altText?: string
  collaborators?: string[]
  locationId?: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function waitReady(g: GraphClient, containerId: string, opts = { tries: 60, everyMs: 5000 }) {
  for (let i = 0; i < opts.tries; i++) {
    const { status_code } = await g.get<{ status_code: string }>(containerId, { fields: 'status_code' })
    if (status_code === 'FINISHED') return
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new MetaError(undefined, undefined, `contenedor en estado ${status_code}`, containerId)
    await sleep(opts.everyMs)
  }
  throw new MetaError(9007, undefined, 'media not ready (tiempo agotado)', containerId)
}

/** Arma los pedidos de creación de contenedores (separado para poder testearlo). */
export function containerRequests(p: PublishInput): { children: Params[]; main: Params } {
  const common: Params = { caption: p.caption || undefined, collaborators: p.collaborators?.length ? JSON.stringify(p.collaborators) : undefined, location_id: p.locationId }
  if (p.kind === 'CAROUSEL') {
    const children = p.media.slice(0, 10).map((m): Params => (m.video ? { media_type: 'VIDEO', video_url: m.url, is_carousel_item: true } : { image_url: m.url, is_carousel_item: true }))
    return { children, main: { media_type: 'CAROUSEL', ...common } }
  }
  const m = p.media[0]
  if (p.kind === 'REEL') return { children: [], main: { media_type: 'REELS', video_url: m.url, share_to_feed: true, ...common } }
  if (p.kind === 'STORY') return { children: [], main: m.video ? { media_type: 'STORIES', video_url: m.url } : { media_type: 'STORIES', image_url: m.url } }
  return { children: [], main: { image_url: m.url, alt_text: p.altText, ...common } }
}

export async function publish(g: GraphClient, p: PublishInput, wait = { tries: 60, everyMs: 5000 }): Promise<{ mediaId: string; permalink?: string }> {
  const { children, main } = containerRequests(p)
  if (children.length) {
    const ids: string[] = []
    for (const c of children) ids.push((await g.post<{ id: string }>(`${p.igUserId}/media`, c)).id)
    for (const id of ids) await waitReady(g, id, wait)
    main.children = ids.join(',')
  }
  const container = await g.post<{ id: string }>(`${p.igUserId}/media`, main)
  await waitReady(g, container.id, wait)
  const published = await g.post<{ id: string }>(`${p.igUserId}/media_publish`, { creation_id: container.id })
  const { permalink } = await g.get<{ permalink?: string }>(published.id, { fields: 'permalink' }).catch(() => ({ permalink: undefined }))
  return { mediaId: published.id, permalink }
}

export async function publishingQuota(g: GraphClient, igUserId: string) {
  const r = await g.get<{ data: { quota_usage: number; config?: { quota_total: number } }[] }>(`${igUserId}/content_publishing_limit`, { fields: 'config,quota_usage' })
  const d = r.data?.[0]
  return { used: d?.quota_usage ?? 0, total: d?.config?.quota_total ?? 100 }
}

/** Métricas por tipo de publicación (pedir una métrica no soportada hace fallar todo el pedido). */
const METRICS: Record<PublishKind, string[]> = {
  IMAGE: ['reach', 'likes', 'comments', 'saved', 'shares', 'views', 'profile_visits'],
  CAROUSEL: ['reach', 'likes', 'comments', 'saved', 'shares', 'views', 'profile_visits'],
  REEL: ['reach', 'likes', 'comments', 'saved', 'shares', 'views'],
  STORY: ['reach', 'views', 'replies', 'shares'],
}

export async function mediaInsights(g: GraphClient, mediaId: string, kind: PublishKind): Promise<Record<string, number>> {
  const read = async (metrics: string[]) => {
    const r = await g.get<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(`${mediaId}/insights`, { metric: metrics.join(',') })
    return Object.fromEntries(r.data.map((m) => [m.name, m.total_value?.value ?? m.values?.[0]?.value ?? 0]))
  }
  try {
    return await read(METRICS[kind])
  } catch (e) {
    if (e instanceof MetaError && e.code === 100) return read(['reach', 'likes', 'comments'].filter((m) => METRICS[kind].includes(m)))
    throw e
  }
}

// ---------------------------------------------------------------------------
// Descubrimiento y control de salud
// ---------------------------------------------------------------------------

export const REQUIRED_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_insights',
  'instagram_manage_comments',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
  'ads_management',
  'ads_read',
]

export async function tokenScopes(accessToken: string) {
  const g = graph(accessToken)
  const r = await g.get<{ data: { is_valid: boolean; scopes?: string[]; expires_at?: number; type?: string } }>('debug_token', { input_token: accessToken })
  const scopes = r.data.scopes ?? []
  return { valid: r.data.is_valid, scopes, missing: REQUIRED_SCOPES.filter((s) => !scopes.includes(s)), expiresAt: r.data.expires_at ? new Date(r.data.expires_at * 1000) : null, type: r.data.type }
}

export interface DiscoveredAccount {
  pageId: string
  pageName: string
  igUserId?: string
  igUsername?: string
  followers?: number
}

export async function discoverAccounts(g: GraphClient): Promise<DiscoveredAccount[]> {
  const r = await g.get<{ data: { id: string; name: string; instagram_business_account?: { id: string; username?: string; followers_count?: number } }[] }>('me/accounts', {
    fields: 'id,name,instagram_business_account{id,username,followers_count}',
    limit: 100,
  })
  return r.data.map((p) => ({ pageId: p.id, pageName: p.name, igUserId: p.instagram_business_account?.id, igUsername: p.instagram_business_account?.username, followers: p.instagram_business_account?.followers_count }))
}

type RawAdAccount = { id: string; name: string; account_status: number; currency: string; business?: { name: string } }
export type AdAccount = RawAdAccount & { active: boolean; via: string }

/**
 * Cuentas publicitarias a las que llega el token: las asignadas al usuario (me/adaccounts) y las del Business
 * (propias y de clientes). Un usuario de sistema sólo ve en me/adaccounts las que le asignaron como activo,
 * así que mirar el Business muestra también las que existen pero falta asignar.
 * `errors`: qué consulta falló y por qué, para mostrarlo en vez de una lista vacía.
 */
export async function adAccounts(g: GraphClient): Promise<{ accounts: AdAccount[]; errors: string[] }> {
  const fields = 'id,name,account_status,currency,business{name}'
  const found = new Map<string, AdAccount>()
  const errors: string[] = []
  const add = (rows: RawAdAccount[], via: string) => rows.forEach((a) => found.has(a.id) || found.set(a.id, { ...a, active: a.account_status === 1, via }))
  try {
    add((await g.get<{ data: RawAdAccount[] }>('me/adaccounts', { fields, limit: 100 })).data ?? [], 'asignada')
  } catch (e) {
    errors.push(`me/adaccounts: ${(e as Error).message}`)
  }
  try {
    const biz = (await g.get<{ data: { id: string; name: string }[] }>('me/businesses', { fields: 'id,name', limit: 50 })).data ?? []
    for (const b of biz)
      for (const edge of ['owned_ad_accounts', 'client_ad_accounts']) {
        try {
          add((await g.get<{ data: RawAdAccount[] }>(`${b.id}/${edge}`, { fields, limit: 100 })).data ?? [], `Business ${b.name}`)
        } catch (e) {
          errors.push(`${b.name} (${edge}): ${(e as Error).message}`)
        }
      }
  } catch (e) {
    errors.push(`me/businesses: ${(e as Error).message}`)
  }
  return { accounts: [...found.values()], errors }
}

export const actId = (id: string) => (id.startsWith('act_') ? id : `act_${id}`)
