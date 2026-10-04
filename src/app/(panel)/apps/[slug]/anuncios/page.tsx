import Link from 'next/link'
import { campaignAction } from '@/app/actions'
import { AutoRefresh, ConfirmButton, SubmitButton } from '@/components/client'
import { db } from '@/lib/db'
import { mediaSrc } from '@/lib/media'
import { campaignDays, committedThisMonth, OBJECTIVES, plannedSpend, type Targeting } from '@/lib/meta-ads'
import { fmtDate, TYPE } from '@/lib/view'

const STATUS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: 'Borrador', tone: '' },
  PAUSED: { label: 'En pausa', tone: 'warn' },
  ACTIVE: { label: 'Activa', tone: 'ok' },
  COMPLETED: { label: 'Terminada', tone: 'info' },
}
const money = (cents: number, cur: string | null) => `${(cents / 100).toFixed(2)} ${cur ?? ''}`.trim()
const results = (m: Record<string, unknown> | null) =>
  m && m.spend ? `Gasto ${m.spend} · alcance ${m.reach ?? 0} · ${m.clicks ?? 0} clics · CTR ${Number(m.ctr ?? 0).toFixed(2)}% · CPC ${Number(m.cpc ?? 0).toFixed(2)}` : 'Sin resultados todavía'

export default async function Ads({ params }: PageProps<'/apps/[slug]/anuncios'>) {
  const { slug } = await params
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const campaigns = await db.adCampaign.findMany({
    where: { appId: app.id },
    orderBy: { createdAt: 'desc' },
    include: { ads: { include: { post: { include: { assets: { where: { kind: 'SLIDE' }, orderBy: { position: 'asc' }, take: 1 } } } } } },
  })
  const committed = await committedThisMonth(app.id)
  // Mientras Meta crea la campaña (en segundo plano) o se genera una pieza, la página se actualiza sola.
  const recent = new Date(new Date().getTime() - 5 * 60e3)
  const working = campaigns.some((c) => c.ads.some((a) => a.post.status === 'DRAFT') || (c.status === 'DRAFT' && !c.error && c.updatedAt > recent))
  return (
    <div className="stack" style={{ gap: 24 }}>
      {working && <AutoRefresh every={6000} />}
      <section className="card stack">
        <div className="row between">
          <div className="stack-sm">
            <h2>Campañas</h2>
            <p className="small muted">
              Promocioná una o varias publicaciones, o una pieza hecha sólo para el anuncio, con presupuesto total o diario. Todo se crea en pausa; sólo gasta cuando tocás Activar.
              {app.adMonthlyBudget != null && ` Comprometido este mes: ${money(committed, campaigns[0]?.currency ?? null)} de ${app.adMonthlyBudget} (tope en Ajustes).`}
            </p>
          </div>
          <Link href={`/apps/${slug}/anuncios/nueva`} className="btn primary">
            Nueva campaña
          </Link>
        </div>
      </section>
      {!campaigns.length && <div className="card empty">Todavía no hay campañas. Desde Rendimiento podés impulsar una publicación con un toque.</div>}
      {campaigns.map((c) => {
        const t = c.targeting as unknown as Partial<Targeting>
        const st = STATUS[c.status] ?? { label: c.status, tone: '' }
        const generating = c.ads.some((a) => a.post.status === 'DRAFT')
        const failedPiece = c.ads.find((a) => a.post.status === 'FAILED')
        const max = plannedSpend(c)
        return (
          <section key={c.id} id={c.id} className="card stack">
            <div className="row between">
              <div className="stack-sm">
                <h3>{c.name}</h3>
                <p className="small muted">
                  {OBJECTIVES.find((o) => o.id === c.objective)?.label ?? c.objective} · {c.budgetType === 'DAILY' ? `${money(c.budget, c.currency)} por día` : `${money(c.budget, c.currency)} en total`} · {campaignDays(c)} días ({fmtDate(c.startAt, app.timezone)} → {fmtDate(c.endAt, app.timezone)}) · máximo {money(max, c.currency)}
                  {c.spendCap ? ` · tope ${money(c.spendCap, c.currency)}` : ''}
                </p>
                <p className="xs muted">
                  {(t.countries ?? []).join(', ') || 'AR'} · {t.ageMin ?? 18}–{t.ageMax ?? 65} años{t.interests?.length ? ` · ${t.interests.map((i) => i.name).join(', ')}` : ''}
                  {t.advantage ? ' · Advantage+' : ''} · {c.placements === 'instagram_facebook' ? 'Instagram y Facebook' : 'Instagram'}
                </p>
              </div>
              <span className="row" style={{ gap: 6 }}>
                {c.simulated && <span className="badge info">Simulación</span>}
                {c.effectiveStatus && c.effectiveStatus !== c.status && <span className="badge">Meta: {c.effectiveStatus}</span>}
                <span className={`badge ${st.tone}`}>{st.label}</span>
              </span>
            </div>
            <p className="small num">{results(c.metrics as Record<string, unknown> | null)}</p>
            {c.error && <p className="notice bad small">{c.error}</p>}
            {generating && <p className="notice info small">Generando la pieza nueva… Cuando esté, revisala en Revisión y tocá &quot;Crear en Meta&quot;.</p>}
            {failedPiece && <p className="notice bad small">La pieza nueva no se pudo generar: {failedPiece.post.error}</p>}
            <div className="campaign-ads">
              {c.ads.map((a) => (
                <div key={a.id} className="campaign-ad">
                  {a.post.assets[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaSrc(a.post.assets[0].path)} alt="" loading="lazy" />
                  ) : (
                    <span className="campaign-post-empty xs muted">{a.post.status === 'DRAFT' ? 'generando…' : 'sin pieza'}</span>
                  )}
                  <div className="stack-sm" style={{ flex: 1 }}>
                    <span className="small">
                      <strong>{TYPE[a.post.type]}</strong> {a.post.hook}
                      {a.post.adOnly && <span className="badge info" style={{ marginLeft: 6 }}>Sólo anuncio</span>}
                    </span>
                    <span className="xs muted">
                      {a.adId ? `Anuncio ${a.effectiveStatus ?? 'creado'}` : 'Sin crear en Meta'} · {results(a.metrics as Record<string, unknown> | null)}
                    </span>
                    {a.issues && <span className="xs" style={{ color: 'var(--danger)' }}>Meta: {a.issues}</span>}
                    {a.error && <span className="xs" style={{ color: 'var(--danger)' }}>{a.error}</span>}
                    {a.post.adOnly && (
                      <Link href={`/apps/${slug}/revision#${a.post.id}`} className="xs" style={{ textDecoration: 'underline' }}>
                        Revisar o editar la pieza
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="row">
              {(c.status === 'DRAFT' || c.error || c.ads.some((a) => !a.adId)) && c.status !== 'COMPLETED' && !generating && (
                <form action={campaignAction.bind(null, c.id, 'push')}>
                  <SubmitButton className="btn sm" pendingText="Encolando…">
                    {c.campaignId ? 'Completar en Meta' : 'Crear en Meta (en pausa)'}
                  </SubmitButton>
                </form>
              )}
              {c.status === 'PAUSED' && c.ads.some((a) => a.adId) && (
                <ConfirmButton
                  action={campaignAction.bind(null, c.id, 'activate')}
                  label="Activar"
                  className="btn sm primary"
                  confirm={`${c.simulated ? 'Simulación: no gasta. ' : ''}Puede gastar hasta ${money(max, c.currency)} hasta el ${fmtDate(c.endAt, app.timezone)}.`}
                />
              )}
              {c.status === 'ACTIVE' && (
                <form action={campaignAction.bind(null, c.id, 'pause')}>
                  <SubmitButton className="btn sm">Pausar</SubmitButton>
                </form>
              )}
              {c.campaignId && (
                <form action={campaignAction.bind(null, c.id, 'sync')}>
                  <SubmitButton className="btn sm ghost" pendingText="Consultando…">
                    Actualizar
                  </SubmitButton>
                </form>
              )}
              {c.status !== 'ACTIVE' && (
                <ConfirmButton action={campaignAction.bind(null, c.id, 'delete')} label="Eliminar" className="btn sm ghost danger" confirm={c.campaignId ? 'Se elimina también en Meta.' : 'Se borra el borrador.'} />
              )}
              {c.syncedAt && <span className="xs muted">Actualizada {fmtDate(c.syncedAt, app.timezone)}</span>}
            </div>
          </section>
        )
      })}
    </div>
  )
}
