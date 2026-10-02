// Redirige al destino con UTM de Instagram y cuenta el clic. Sólo destinos declarados en el promo.yaml.
import { db } from '@/lib/db'
import type { Manifest } from '@/lib/manifest'

export async function GET(req: Request, ctx: RouteContext<'/l/[slug]/go'>) {
  const { slug } = await ctx.params
  const to = new URL(req.url).searchParams.get('to') ?? ''
  const app = await db.app.findUnique({ where: { slug } })
  const m = app?.manifest as unknown as Manifest | undefined
  const allowed = m ? [m.url, ...m.links.map((l) => l.url)] : []
  if (!app || !allowed.includes(to)) return new Response('Destino no permitido', { status: 400 })
  await db.linkHit.create({ data: { appId: app.id, target: to } })
  const url = new URL(to)
  url.searchParams.set('utm_source', 'instagram')
  url.searchParams.set('utm_medium', 'bio')
  url.searchParams.set('utm_campaign', 'promo-studio')
  return Response.redirect(url.toString(), 302)
}
