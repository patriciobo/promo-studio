import Link from 'next/link'
import { db } from '@/lib/db'
import { spentThisMonth } from '@/lib/budget'
import { env } from '@/lib/env'
import { fmtDate, STATUS, TYPE, usd } from '@/lib/view'

export default async function Home() {
  const apps = await db.app.findMany({ orderBy: { createdAt: 'asc' } })
  const now = new Date()
  const rows = await Promise.all(
    apps.map(async (a) => ({
      app: a,
      next: await db.post.findFirst({ where: { appId: a.id, status: { in: ['APPROVED', 'PENDING_REVIEW'] }, scheduledAt: { gte: now } }, orderBy: { scheduledAt: 'asc' } }),
      pending: await db.post.count({ where: { appId: a.id, status: 'PENDING_REVIEW' } }),
      failed: await db.post.count({ where: { appId: a.id, status: 'FAILED' } }),
      published: await db.post.count({ where: { appId: a.id, status: 'PUBLISHED', publishedAt: { gte: new Date(now.getTime() - 30 * 864e5) } } }),
      spent: await spentThisMonth(a.id),
    })),
  )
  const global = await spentThisMonth()
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Inicio</h1>
          <p>
            Gasto en OpenRouter este mes: <strong className="num">{usd(global)}</strong> de {usd(env.globalBudgetUsd)}
          </p>
        </div>
        <Link className="btn primary" href="/apps/nueva">
          Conectar app
        </Link>
      </div>
      {!apps.length ? (
        <div className="card empty stack">
          <h2>Todavía no hay apps conectadas</h2>
          <p>Conectá el repositorio de una app: el asistente arma su promo.yaml y después la cuenta de Instagram.</p>
          <div>
            <Link className="btn primary" href="/apps/nueva">
              Conectar la primera app
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid">
          {rows.map(({ app, next, pending, failed, published, spent }) => (
            <Link key={app.id} href={`/apps/${app.slug}`} className="card stack">
              <div className="row between">
                <h2>{app.name}</h2>
                {app.paused ? <span className="badge">Pausada</span> : app.dryRun ? <span className="badge info">Simulación</span> : <span className="badge ok">Publicando</span>}
              </div>
              <p className="small muted">{app.igUsername ? `@${app.igUsername}` : 'Instagram sin conectar'} · {app.repo}</p>
              {app.manifestError && <p className="notice bad small">promo.yaml: {app.manifestError}</p>}
              <div className="row" style={{ gap: 24 }}>
                <div className="stat">
                  <strong>{pending}</strong>
                  <span>para revisar</span>
                </div>
                <div className="stat">
                  <strong>{published}</strong>
                  <span>publicados (30 d)</span>
                </div>
                <div className="stat">
                  <strong>{usd(spent)}</strong>
                  <span>de {usd(app.monthlyBudgetUsd)}</span>
                </div>
              </div>
              <p className="small">
                {next ? (
                  <>
                    Próximo: {TYPE[next.type]} · {fmtDate(next.scheduledAt, app.timezone)} <span className={`badge ${STATUS[next.status].tone}`}>{STATUS[next.status].label}</span>
                  </>
                ) : (
                  <span className="muted">Sin publicaciones programadas</span>
                )}
              </p>
              {failed > 0 && <p className="notice bad small">{failed} publicación(es) fallaron: revisalas.</p>}
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
