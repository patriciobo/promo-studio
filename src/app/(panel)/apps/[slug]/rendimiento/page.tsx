import Link from 'next/link'
import { PostMeta } from '@/components/PostPreview'
import { db } from '@/lib/db'
import { mediaSrc } from '@/lib/media'
import { adCandidates } from '@/lib/score'
import { TYPE } from '@/lib/view'

export default async function Performance({ params }: PageProps<'/apps/[slug]/rendimiento'>) {
  const { slug } = await params
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const posts = await db.post.findMany({
    where: { appId: app.id, status: 'PUBLISHED' },
    orderBy: { publishedAt: 'desc' },
    take: 60,
    include: { insights: { orderBy: { hoursAfter: 'desc' }, take: 1 }, assets: { where: { kind: 'SLIDE', position: 0 }, take: 1 }, ads: { include: { campaign: { select: { id: true, name: true, status: true } } } } },
  })
  const candidates = new Set(adCandidates(posts.filter((p) => p.type !== 'STORY')).map((p) => p.id))
  const byPillar = new Map<string, { n: number; score: number }>()
  const byType = new Map<string, { n: number; score: number }>()
  for (const p of posts.filter((x) => x.score != null)) {
    for (const [map, k] of [[byPillar, p.pillar ?? '—'], [byType, TYPE[p.type]]] as const) {
      const e = map.get(k) ?? { n: 0, score: 0 }
      map.set(k, { n: e.n + 1, score: e.score + p.score! })
    }
  }
  const ranking = (m: Map<string, { n: number; score: number }>) => [...m.entries()].map(([k, v]) => ({ k, n: v.n, avg: v.score / v.n })).sort((a, b) => b.avg - a.avg)

  return (
    <div className="stack" style={{ gap: 24 }}>
      <p className="muted small">
        Potencial = (guardados×3 + compartidos×3 + comentarios×2 + me gusta) / alcance, comparado con la mediana de la app (1,0 = mediana). Se mide a las 24 h, 72 h y 7 días.
      </p>
      <div className="grid-2">
        {[
          ['Por pilar', ranking(byPillar)],
          ['Por formato', ranking(byType)],
        ].map(([title, rows]) => (
          <section key={title as string} className="card stack">
            <h2>{title as string}</h2>
            {(rows as { k: string; n: number; avg: number }[]).length ? (
              <table>
                <tbody>
                  {(rows as { k: string; n: number; avg: number }[]).map((r) => (
                    <tr key={r.k}>
                      <td>{r.k}</td>
                      <td className="num muted">{r.n} posts</td>
                      <td className="num">
                        <strong>{r.avg.toFixed(2)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="small muted">Sin métricas todavía.</p>
            )}
          </section>
        ))}
      </div>

      <section className="stack">
        <h2>Publicaciones</h2>
        {!posts.length && <div className="card empty">Todavía no hay publicaciones con métricas.</div>}
        {posts.map((p) => {
          const i = p.insights[0]
          return (
            <article key={p.id} className="card row" style={{ alignItems: 'flex-start', gap: 16 }}>
              {p.assets[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaSrc(p.assets[0].path)} alt="" style={{ width: 84, borderRadius: 8, border: '1px solid var(--border)' }} />
              )}
              <div className="stack-sm" style={{ flex: 1, minWidth: 240 }}>
                <PostMeta post={p} tz={app.timezone} showCost={false} />
                <p className="small">{p.hook}</p>
                <p className="small muted num">
                  {i ? `Alcance ${i.reach ?? 0} · ${i.likes ?? 0} me gusta · ${i.comments ?? 0} comentarios · ${i.saves ?? 0} guardados · ${i.shares ?? 0} compartidos (a las ${i.hoursAfter} h)` : 'Métricas a las 24 h de publicado.'}
                </p>
              </div>
              <div className="stack-sm" style={{ alignItems: 'flex-end' }}>
                <span className={`badge ${candidates.has(p.id) ? 'ok' : ''}`}>{p.score != null ? `Potencial ${p.score.toFixed(2)}` : 'Sin puntaje'}</span>
                {p.ads.map((a) => (
                  <Link key={a.campaign.id} href={`/apps/${slug}/anuncios#${a.campaign.id}`} className="xs" style={{ textDecoration: 'underline' }}>
                    En campaña: {a.campaign.name}
                  </Link>
                ))}
                {p.type !== 'STORY' &&
                  (p.igMediaId ? (
                    <Link href={`/apps/${slug}/anuncios/nueva?posts=${p.id}`} className={`btn sm${candidates.has(p.id) ? ' primary' : ''}`}>
                      Impulsar
                    </Link>
                  ) : (
                    <span className="xs muted">Publicada en simulación: no se puede impulsar</span>
                  ))}
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}
