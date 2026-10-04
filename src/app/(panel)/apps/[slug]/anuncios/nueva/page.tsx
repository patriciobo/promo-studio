import Link from 'next/link'
import { CampaignForm, type CampaignPost } from '@/components/CampaignForm'
import { ModelSelect } from '@/components/ModelSelect'
import { db } from '@/lib/db'
import type { Manifest } from '@/lib/manifest'
import { mediaSrc } from '@/lib/media'
import { accountInfo, friendly } from '@/lib/meta-ads'
import { adCandidates } from '@/lib/score'
import { TYPE } from '@/lib/view'

export default async function NewCampaign({ params, searchParams }: PageProps<'/apps/[slug]/anuncios/nueva'>) {
  const { slug } = await params
  const { posts: pre } = (await searchParams) as { posts?: string }
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const m = app.manifest as unknown as Manifest | null
  const include = { assets: { where: { kind: 'SLIDE' as const }, orderBy: { position: 'asc' as const }, take: 1 } }
  // Publicadas en Instagram (se promocionan tal cual) y piezas sólo para anuncios ya generadas.
  const [published, adOnly] = await Promise.all([
    db.post.findMany({ where: { appId: app.id, status: 'PUBLISHED', igMediaId: { not: null }, type: { not: 'STORY' } }, orderBy: { publishedAt: 'desc' }, take: 40, include }),
    db.post.findMany({ where: { appId: app.id, adOnly: true, status: { in: ['PENDING_REVIEW', 'APPROVED'] } }, orderBy: { createdAt: 'desc' }, take: 20, include }),
  ])
  const suggested = new Set(adCandidates(published).map((p) => p.id))
  const posts: CampaignPost[] = [...adOnly, ...published].map((p) => ({
    id: p.id,
    type: TYPE[p.type],
    hook: p.hook,
    thumb: p.assets[0] ? mediaSrc(p.assets[0].path) : null,
    score: p.score,
    suggested: suggested.has(p.id),
    adOnly: p.adOnly,
    note: p.adOnly ? '' : p.publishedAt ? `Publicada el ${p.publishedAt.toLocaleDateString('es-AR', { timeZone: app.timezone })}` : '',
  }))
  posts.sort((a, b) => Number(b.suggested) - Number(a.suggested))
  const account = await accountInfo(app).catch((e) => ({ error: friendly(e) }))
  const ready = app.adAccountId && app.pageId && app.igUserId
  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="row between">
        <h2>Nueva campaña</h2>
        <Link href={`/apps/${slug}/anuncios`} className="btn ghost sm">
          Volver a Anuncios
        </Link>
      </div>
      {app.dryRun && <p className="notice info small">Simulación activa: la campaña se arma pero no se crea en Meta ni gasta nada.</p>}
      {!ready ? (
        <p className="notice bad">
          Falta conectar Instagram, la página y la cuenta publicitaria. Hacelo en la pestaña <Link href={`/apps/${slug}/conexion`}>Instagram</Link>.
        </p>
      ) : (
        <CampaignForm
          slug={slug}
          posts={posts}
          preselected={(pre ?? '').split(',').filter((id) => posts.some((p) => p.id === id))}
          defaults={{
            name: `${app.name} · ${new Date().toLocaleDateString('es-AR', { timeZone: app.timezone })}`,
            countries: m?.audience.countries ?? [],
            ageMin: Math.max(18, m?.audience.age[0] ?? 18),
            ageMax: Math.min(65, m?.audience.age[1] ?? 65),
            link: m?.url ?? '',
            whatsapp: !!m?.contact?.whatsapp,
          }}
          account={account}
          modelSelect={<ModelSelect app={app} label="Modelo de imagen de la pieza" />}
        />
      )}
    </div>
  )
}
