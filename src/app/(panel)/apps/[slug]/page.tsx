import Link from 'next/link'
import { generateWeek, retryPost, syncNow } from '@/app/actions'
import { SubmitButton } from '@/components/client'
import { ModelSelect } from '@/components/ModelSelect'
import { PostMeta, PostThumbs } from '@/components/PostPreview'
import { db } from '@/lib/db'
import type { Manifest } from '@/lib/manifest'
import { nextMonday } from '@/lib/schedule'

export default async function Calendar({ params }: PageProps<'/apps/[slug]'>) {
  const { slug } = await params
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const batches = await db.batch.findMany({
    where: { appId: app.id },
    orderBy: { weekStart: 'desc' },
    take: 6,
    include: { posts: { orderBy: { scheduledAt: 'asc' }, include: { assets: true } } },
  })
  const nm = nextMonday().toISOString().slice(0, 10)
  const daily = (app.manifest as unknown as Manifest | null)?.daily
  const dailyPosts = daily ? await db.post.findMany({ where: { appId: app.id, dailyDate: { not: null } }, orderBy: [{ dailyDate: 'desc' }, { type: 'asc' }], take: 14, include: { assets: true } }) : []
  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="card row between">
        <div className="stack-sm">
          <h2>Lote semanal</h2>
          <p className="small muted">Se genera solo cada domingo a las 18:00. Podés adelantarlo o rehacer una semana que falló.</p>
          {app.manifestError && <p className="notice bad small">El promo.yaml tiene errores: {app.manifestError}</p>}
          {!app.imageModel && <p className="notice warn small">Sin modelo de imagen: las piezas se arman con el color de la marca. Elegí uno en Ajustes.</p>}
        </div>
        <div className="row">
          <form action={syncNow.bind(null, slug)}>
            <SubmitButton className="btn" pendingText="Sincronizando…">
              Sincronizar repo
            </SubmitButton>
          </form>
          <form action={generateWeek.bind(null, slug)} className="row">
            <input type="date" name="week" defaultValue={nm} style={{ width: 160 }} aria-label="Lunes de la semana" />
            <ModelSelect app={app} />
            <SubmitButton pendingText="Encolando…">Generar semana</SubmitButton>
          </form>
        </div>
      </div>
      {daily && (
        <section className="stack">
          <div className="row between">
            <h2>Edición diaria</h2>
            <span className="small muted">
              Todos los días a las {daily.time}, con el reporte de {new URL(daily.source.replace('{fecha}', 'x')).host}. Se aprueba sola a esa hora si no la revisás.
            </span>
          </div>
          {!dailyPosts.length && <div className="card empty">Todavía no hay ediciones. La próxima se arma cuando se publique el reporte del día.</div>}
          <div className="grid">
            {dailyPosts.map((p) => (
              <article key={p.id} className="card post-card">
                <PostMeta post={p} tz={app.timezone} />
                <span className="xs muted">Edición {p.dailyDate}</span>
                <PostThumbs post={p} />
                {p.error && <p className={`notice small ${p.status === 'FAILED' ? 'bad' : 'warn'}`}>{p.error}</p>}
                {p.status === 'PENDING_REVIEW' && (
                  <Link className="btn sm" href={`/apps/${slug}/revision#${p.id}`}>
                    Revisar
                  </Link>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
      {!batches.length && <div className="card empty">Todavía no hay lotes. Generá la primera semana.</div>}
      {batches.map((b) => (
        <section key={b.id} className="stack">
          <div className="row between">
            <h2>Semana del {b.weekStart.toISOString().slice(0, 10)}</h2>
            <span className={`badge ${b.status === 'READY' ? 'ok' : b.status === 'FAILED' ? 'bad' : 'info'}`}>{{ PLANNING: 'Planificando', GENERATING: 'Generando', READY: 'Lista', FAILED: 'Falló' }[b.status]}</span>
          </div>
          {b.error && <p className="notice bad small">{b.error}</p>}
          <div className="grid">
            {b.posts.map((p) => (
              <article key={p.id} className="card post-card">
                <PostMeta post={p} tz={app.timezone} />
                <PostThumbs post={p} />
                <p className="small" style={{ whiteSpace: 'pre-line' }}>
                  {p.caption.split('\n')[0]}
                </p>
                {p.error && <p className={`notice small ${p.status === 'FAILED' ? 'bad' : 'warn'}`}>{p.error}</p>}
                <div className="row">
                  {p.status === 'PENDING_REVIEW' && (
                    <Link className="btn sm" href={`/apps/${slug}/revision#${p.id}`}>
                      Revisar
                    </Link>
                  )}
                  {p.status === 'FAILED' && p.assets.length > 0 && (
                    <form action={retryPost.bind(null, p.id)}>
                      <SubmitButton className="btn sm">Reintentar ahora</SubmitButton>
                    </form>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
