import Link from 'next/link'
import { deleteRejected, generateWeek, retryPost, syncNow } from '@/app/actions'
import { AutoRefresh, ConfirmButton, Progress, SubmitButton } from '@/components/client'
import { starterRedoable } from '@/lib/starter'
import { ImagePicker } from '@/components/ImagePicker'
import { ModelSelect } from '@/components/ModelSelect'
import { PostMeta, PostThumbs } from '@/components/PostPreview'
import { StarterKit } from '@/components/StarterKit'
import { StyleReminder } from '@/components/StyleReminder'
import { db } from '@/lib/db'
import type { Manifest } from '@/lib/manifest'
import { nextMonday } from '@/lib/schedule'

const BATCH_STATUS = { PLANNING: 'Planificando', GENERATING: 'Generando', READY: 'Lista', FAILED: 'Falló' } as const

export default async function Calendar({ params, searchParams }: PageProps<'/apps/[slug]'>) {
  const { slug } = await params
  const { aviso, semana } = await searchParams
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const batches = await db.batch.findMany({
    where: { appId: app.id },
    orderBy: { weekStart: 'desc' },
    take: 6,
    include: { posts: { orderBy: { scheduledAt: 'asc' }, include: { assets: true } } },
  })
  const images = await db.appImage.findMany({ where: { appId: app.id, archived: false }, orderBy: { createdAt: 'desc' }, take: 24 })
  const nm = nextMonday().toISOString().slice(0, 10)
  const starter = await db.batch.findFirst({ where: { appId: app.id, kind: 'STARTER' }, include: { posts: { select: { status: true } } } })
  // El kit se ofrece mientras no haya semanas generadas, y de nuevo si el anterior falló o se rechazó entero.
  const redo = !!starter && starterRedoable(starter)
  const offerStarter = redo || (!starter && !batches.some((b) => b.kind === 'WEEK'))
  const working = batches.some((b) => b.status === 'PLANNING' || b.status === 'GENERATING')
  const daily = (app.manifest as unknown as Manifest | null)?.daily
  const dailyPosts = daily ? await db.post.findMany({ where: { appId: app.id, dailyDate: { not: null } }, orderBy: [{ dailyDate: 'desc' }, { type: 'asc' }], take: 14, include: { assets: true } }) : []
  return (
    <div className="stack" style={{ gap: 24 }}>
      {working && <AutoRefresh />}
      {aviso === 'generando' && working && (
        <p className="notice ok">
          Generando la semana del {String(semana)}: primero se escriben los textos y después se arman las piezas, una por una. Tarda unos minutos; esta página se actualiza sola.
        </p>
      )}
      {aviso === 'kit-generando' && working && <p className="notice ok">Generando el kit inicial: primero los textos de las 9 publicaciones y después las piezas. Tarda unos minutos; esta página se actualiza sola.</p>}
      {aviso === 'kit-ya-generado' && <p className="notice warn">Esta app ya tiene su kit inicial. Para rehacer una publicación, editala o regenerá su imagen desde Revisión.</p>}
      {offerStarter && app.manifest && <StarterKit app={app} redo={redo} />}
      {aviso === 'ya-generada' && <p className="notice warn">La semana del {String(semana)} ya está generada. Para rehacer una publicación, editala o regenerá su imagen desde Revisión.</p>}
      <div className="card stack">
        <div className="row between">
          <div className="stack-sm">
            <h2>Lote semanal</h2>
            <p className="small muted">Se genera solo cada domingo a las 18:00. Podés adelantarlo o rehacer una semana que falló.</p>
            {app.manifestError && <p className="notice bad small">El promo.yaml tiene errores: {app.manifestError}</p>}
            {!app.imageModel && <p className="notice warn small">Sin modelo de imagen: las piezas se arman con el color de la marca. Elegí uno en Ajustes.</p>}
          </div>
          <div className="row">
            <form action={syncNow.bind(null, slug)}>
              <SubmitButton className="btn" pendingText="Sincronizando…" expect={8}>
                Sincronizar repo
              </SubmitButton>
            </form>
            <form id="generar-semana" action={generateWeek.bind(null, slug)} className="row">
              <input type="date" name="week" defaultValue={nm} style={{ width: 160 }} aria-label="Lunes de la semana" />
              <ModelSelect app={app} />
              <SubmitButton pendingText="Encolando…">Generar semana</SubmitButton>
            </form>
          </div>
        </div>
        <label>
          Consigna para la semana <span className="hint">Opcional. Qué querés comunicar: un lanzamiento, una fecha, una promo, un tema o un enfoque. Si la dejás vacía, el plan reparte los pilares del promo.yaml como siempre.</span>
          <textarea name="brief" form="generar-semana" rows={2} maxLength={1000} placeholder="Ej.: semana del Día del Padre, enfocada en regalos; mostrar la nueva función de reservas y cerrar con una promo del 20%." />
        </label>
        <ImagePicker images={images} slug={slug} form="generar-semana" hint="El plan reparte estas imágenes entre los posts de la semana." />
        <StyleReminder app={app} />
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
      {!batches.length && <div className="card empty">Todavía no hay lotes. {app.manifest ? 'Empezá por el kit inicial o generá la primera semana.' : 'Generá la primera semana.'}</div>}
      {batches.map((b) => (
        <section key={b.id} className="stack">
          <div className="row between">
            <h2>{b.kind === 'STARTER' ? `Kit inicial · desde el ${b.weekStart.toISOString().slice(0, 10)}` : `Semana del ${b.weekStart.toISOString().slice(0, 10)}`}</h2>
            <span className={`badge ${b.status === 'READY' ? 'ok' : b.status === 'FAILED' ? 'bad' : 'info'}`}>
              {(b.status === 'PLANNING' || b.status === 'GENERATING') && <span className="spinner" aria-hidden />}
              {BATCH_STATUS[b.status]}
            </span>
          </div>
          {b.status === 'PLANNING' && (
            <p className="notice small">
              <span className="spinner" aria-hidden /> Escribiendo los textos {b.kind === 'STARTER' ? 'del kit' : 'de la semana'} con IA (suele tardar menos de un minuto)… Si en unos minutos no avanza, revisá que el worker esté corriendo.
              <Progress since={b.createdAt} expect={45} delay={0} />
            </p>
          )}
          {b.status === 'GENERATING' && (
            <p className="notice small">
              <span className="spinner" aria-hidden /> Generando ilustraciones y piezas: {b.posts.filter((p) => p.status !== 'DRAFT').length} de {b.posts.length} listas…
              <Progress since={b.posts[0]?.createdAt ?? b.createdAt} value={b.posts.length ? b.posts.filter((p) => p.status !== 'DRAFT').length / b.posts.length : 0} steps={b.posts.length} expect={60 * Math.max(1, b.posts.length)} delay={0} />
            </p>
          )}
          {b.brief && (
            <p className="small">
              <span className="muted">Consigna:</span> {b.brief}
            </p>
          )}
          {b.error && <p className="notice bad small">{b.error}</p>}
          {b.posts.some((p) => p.status === 'REJECTED') && (
            <div className="row" style={{ gap: 8 }}>
              <ConfirmButton
                action={deleteRejected.bind(null, slug, { batchId: b.id })}
                label={`Borrar las ${b.posts.filter((p) => p.status === 'REJECTED').length} rechazadas`}
                confirm="Se borran con sus piezas; no se puede deshacer."
                className="btn sm ghost"
              />
            </div>
          )}
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
                  {p.status === 'REJECTED' && <ConfirmButton action={deleteRejected.bind(null, slug, { postId: p.id })} label="Borrar" confirm="¿Borrarla?" className="btn sm ghost" />}
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
