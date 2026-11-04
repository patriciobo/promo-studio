import Link from 'next/link'
import { refreshTrendsNow, setAlgoNoteActive, setTrendHidden } from '@/app/actions'
import { AutoRefresh, SubmitButton } from '@/components/client'
import { db } from '@/lib/db'
import type { Manifest } from '@/lib/manifest'
import { describeMarket, KIND_LABEL, marketOf, perRun, SOURCES, STAGE_LABEL, STAGES, type Stage } from '@/lib/trends'
import { daysAgo, fmtDate } from '@/lib/view'

const STAGE_BADGE: Record<Stage, string> = { emerging: 'ok', peak: 'info', saturated: 'warn', dead: '' }

/** Impulso de las últimas pasadas, como barritas (más alta = más impulso). */
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const w = 6
  return (
    <svg width={values.length * (w + 2)} height={22} aria-label={`Impulso: ${values.join(', ')}`} style={{ verticalAlign: 'middle' }}>
      {values.map((v, i) => (
        <rect key={i} x={i * (w + 2)} y={22 - Math.max(2, (v / 100) * 22)} width={w} height={Math.max(2, (v / 100) * 22)} rx={1} fill="currentColor" opacity={0.35 + (0.65 * (i + 1)) / values.length} />
      ))}
    </svg>
  )
}

export default async function Trends({ searchParams }: PageProps<'/tendencias'>) {
  const { aviso, ver } = await searchParams
  const all = ver === 'todas'
  const apps = await db.app.findMany({ where: { paused: false }, select: { slug: true, name: true, manifest: true, useTrends: true } })
  const byMarket = new Map<string, { slug: string; name: string }[]>()
  for (const a of apps) {
    if (!a.manifest || !a.useTrends) continue
    const k = marketOf(a.manifest as unknown as Manifest)
    byMarket.set(k, [...(byMarket.get(k) ?? []), { slug: a.slug, name: a.name }])
  }
  const [trends, notes, lastRun] = await Promise.all([
    db.trend.findMany({
      where: all ? { lastSeen: { gte: daysAgo(30) } } : { stage: { in: ['emerging', 'peak', 'saturated'] } },
      include: { snapshots: { orderBy: { at: 'desc' }, take: 24 }, _count: { select: { posts: true } } },
      orderBy: [{ momentum: 'desc' }],
    }),
    db.algoNote.findMany({ orderBy: [{ active: 'desc' }, { observedAt: 'desc' }, { createdAt: 'desc' }], take: 20 }),
    db.trendSnapshot.findFirst({ orderBy: { at: 'desc' }, select: { at: true } }),
  ])
  const markets = [...new Set([...byMarket.keys(), ...trends.map((t) => t.market)])]
  const refreshing = aviso === 'actualizando' && (!lastRun || new Date().getTime() - lastRun.at.getTime() > 120e3)
  return (
    <div className="stack" style={{ gap: 20 }}>
      {refreshing && <AutoRefresh />}
      <div className="page-head">
        <div>
          <h1>Tendencias</h1>
          <p>
            Formatos, memes y sonidos que están pegando en Instagram y TikTok para el público de tus apps. Se actualiza a las 7:30 y a las 19:30 con búsqueda web ({SOURCES.map((s) => s.model).join(' y ')}). La etapa sale de cómo cambia el impulso entre pasadas: cuando una se satura o deja de aparecer, los posts programados sobre ella se rehacen solos.
          </p>
        </div>
      </div>
      {refreshing && <p className="notice small">Buscando tendencias… tarda uno o dos minutos.</p>}
      <div className="row">
        <form action={refreshTrendsNow}>
          <SubmitButton pendingText="Encolando…">Actualizar ahora</SubmitButton>
        </form>
        <span className="small muted">Última pasada: {lastRun ? fmtDate(lastRun.at) : 'nunca'}</span>
        <Link className="btn sm" href={all ? '/tendencias' : '/tendencias?ver=todas'}>
          {all ? 'Ver sólo las vigentes' : 'Ver también las pasadas de moda'}
        </Link>
      </div>
      {!markets.length && <p className="notice">Ninguna app usa tendencias todavía: activalo en Ajustes &gt; Publicación de cada app (y que tenga un promo.yaml válido).</p>}
      {markets.map((market) => {
        const list = trends.filter((t) => t.market === market).sort((a, b) => STAGES.indexOf(a.stage as Stage) - STAGES.indexOf(b.stage as Stage) || b.momentum - a.momentum)
        const marketApps = byMarket.get(market) ?? []
        return (
          <section key={market} className="stack">
            <h2>
              {describeMarket(market)} <span className="small muted">{marketApps.map((a) => a.name).join(', ') || 'ninguna app activa'}</span>
            </h2>
            {!list.length && <p className="small muted">Sin tendencias todavía: tocá “Actualizar ahora”.</p>}
            <div className="grid">
              {list.map((t) => {
                const runs = perRun(t.snapshots).sort((a, b) => a.at.getTime() - b.at.getTime())
                const stage = t.stage as Stage
                return (
                  <article key={t.id} className="card stack-sm" style={{ opacity: t.hidden || stage === 'dead' ? 0.6 : 1 }}>
                    <div className="row" style={{ gap: 6 }}>
                      <span className={`badge ${STAGE_BADGE[stage] ?? ''}`}>{STAGE_LABEL[stage] ?? t.stage}</span>
                      <span className="badge">{KIND_LABEL[t.kind] ?? t.kind}</span>
                      <span className="badge">{t.platform}</span>
                      {!t.brandSafe && <span className="badge bad">riesgosa para marcas</span>}
                      {t.hidden && <span className="badge">descartada</span>}
                    </div>
                    <strong>{t.name}</strong>
                    <p className="small">{t.summary}</p>
                    {t.howTo && (
                      <p className="small">
                        <span className="muted">Cómo usarla: </span>
                        {t.howTo}
                      </p>
                    )}
                    <p className="xs muted">
                      Impulso {t.momentum}/100 <Spark values={runs.map((r) => r.momentum)} /> · vista desde {fmtDate(t.firstSeen)} · última vez {fmtDate(t.lastSeen)}
                      {t._count.posts ? ` · ${t._count.posts} posts la usan` : ''}
                    </p>
                    {t.snapshots[0]?.evidence && <p className="xs muted">“{t.snapshots[0].evidence}”</p>}
                    <div className="row">
                      {t.example && (
                        <a className="btn sm" href={t.example} target="_blank" rel="noreferrer">
                          Ver ejemplo
                        </a>
                      )}
                      {(stage === 'emerging' || stage === 'peak') &&
                        !t.hidden &&
                        marketApps.map((a) => (
                          <Link key={a.slug} className="btn sm primary" href={`/apps/${a.slug}/crear?tendencia=${t.id}&tipo=REEL`}>
                            Crear en {a.name}
                          </Link>
                        ))}
                      <form action={setTrendHidden.bind(null, t.id, !t.hidden)}>
                        <SubmitButton className="btn sm">{t.hidden ? 'Volver a ofrecer' : 'Descartar'}</SubmitButton>
                      </form>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )
      })}
      <section className="card stack-sm">
        <h2>Cambios del algoritmo de Instagram</h2>
        <p className="small muted">Se buscan una vez por semana, priorizando a Mosseri, @creators y Meta. Las activas se le pasan al plan semanal; apagá las que no te parezcan confiables. Se apagan solas a los 4 meses.</p>
        {!notes.length && <p className="small muted">Todavía no hay: aparecen con la primera pasada.</p>}
        {notes.map((n) => (
          <div key={n.id} className="row" style={{ alignItems: 'flex-start', opacity: n.active ? 1 : 0.55 }}>
            <p className="small" style={{ flex: 1 }}>
              {n.text}{' '}
              <span className="xs muted">
                {n.observedAt ? n.observedAt.toISOString().slice(0, 10) : ''}
                {n.source && (
                  <>
                    {' '}
                    ·{' '}
                    <a href={n.source} target="_blank" rel="noreferrer">
                      fuente
                    </a>
                  </>
                )}
              </span>
            </p>
            <form action={setAlgoNoteActive.bind(null, n.id, !n.active)}>
              <SubmitButton className="btn sm">{n.active ? 'Apagar' : 'Usar'}</SubmitButton>
            </form>
          </div>
        ))}
      </section>
    </div>
  )
}
