import { adAction, createAdAction } from '@/app/actions'
import { ConfirmButton, SubmitButton } from '@/components/client'
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
    include: { insights: { orderBy: { hoursAfter: 'desc' }, take: 1 }, assets: { where: { kind: 'SLIDE', position: 0 }, take: 1 }, adDraft: true },
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
  const drafts = posts.filter((p) => p.adDraft)

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

      {drafts.length > 0 && (
        <section className="card stack">
          <h2>Anuncios</h2>
          <table>
            <thead>
              <tr>
                <th>Post</th>
                <th>Presupuesto</th>
                <th>Estado</th>
                <th>Resultados</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {drafts.map((p) => {
                const d = p.adDraft!
                const m = (d.metrics ?? {}) as Record<string, string>
                return (
                  <tr key={d.id}>
                    <td className="small">{p.hook}</td>
                    <td className="num small">
                      {(d.dailyBudget / 100).toFixed(2)}/día × {d.days} días
                    </td>
                    <td>
                      <span className={`badge ${d.status === 'ACTIVE' ? 'ok' : 'warn'}`}>{d.status === 'ACTIVE' ? 'Activo' : 'En pausa'}</span>
                      {d.error && <p className="xs" style={{ color: 'var(--danger)' }}>{d.error}</p>}
                    </td>
                    <td className="num small">{m.spend ? `Gasto ${m.spend} · ${m.clicks ?? 0} clics · CPC ${Number(m.cpc ?? 0).toFixed(2)}` : '—'}</td>
                    <td>
                      <div className="row">
                        {d.adId && d.status !== 'ACTIVE' && (
                          <ConfirmButton action={adAction.bind(null, d.id, 'activate')} label="Activar" confirm={`Empieza a gastar ${(d.dailyBudget / 100).toFixed(2)} por día durante ${d.days} días.`} className="btn sm primary" />
                        )}
                        {d.status === 'ACTIVE' && (
                          <form action={adAction.bind(null, d.id, 'pause')}>
                            <SubmitButton className="btn sm">Pausar</SubmitButton>
                          </form>
                        )}
                        {d.adId && (
                          <form action={adAction.bind(null, d.id, 'refresh')}>
                            <SubmitButton className="btn sm ghost">Actualizar</SubmitButton>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

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
                <PostMeta post={p} tz={app.timezone} />
                <p className="small">{p.hook}</p>
                <p className="small muted num">
                  {i ? `Alcance ${i.reach ?? 0} · ${i.likes ?? 0} me gusta · ${i.comments ?? 0} comentarios · ${i.saves ?? 0} guardados · ${i.shares ?? 0} compartidos (a las ${i.hoursAfter} h)` : 'Métricas a las 24 h de publicado.'}
                </p>
              </div>
              <div className="stack-sm" style={{ alignItems: 'flex-end' }}>
                <span className={`badge ${candidates.has(p.id) ? 'ok' : ''}`}>{p.score != null ? `Potencial ${p.score.toFixed(2)}` : 'Sin puntaje'}</span>
                {candidates.has(p.id) && !p.adDraft && p.type !== 'STORY' && (
                  <form action={createAdAction.bind(null, p.id)} className="row">
                    <input name="dailyBudget" type="number" min={1} step={1} defaultValue={3} style={{ width: 70 }} aria-label="Presupuesto diario" />
                    <input name="days" type="number" min={1} max={30} defaultValue={5} style={{ width: 60 }} aria-label="Días" />
                    <SubmitButton className="btn sm primary" pendingText="Creando…">
                      Crear anuncio en pausa
                    </SubmitButton>
                  </form>
                )}
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}
