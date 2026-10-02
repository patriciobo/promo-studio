import { approveAll, savePost, setPostStatus } from '@/app/actions'
import { SubmitButton } from '@/components/client'
import { PostMeta, PostThumbs } from '@/components/PostPreview'
import { db } from '@/lib/db'
import { fmtDate } from '@/lib/view'

export default async function Review({ params }: PageProps<'/apps/[slug]/revision'>) {
  const { slug } = await params
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const posts = await db.post.findMany({ where: { appId: app.id, status: { in: ['PENDING_REVIEW', 'APPROVED', 'DRAFT'] } }, orderBy: { scheduledAt: 'asc' }, include: { assets: true } })
  const pending = posts.filter((p) => p.status === 'PENDING_REVIEW').length
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row between">
        <p className="muted">
          {pending ? `${pending} para revisar. Lo que no revises se aprueba solo a las ${app.autoApproveHours} h.` : 'No hay nada pendiente de revisión.'}
        </p>
        {pending > 0 && (
          <form action={approveAll.bind(null, slug)}>
            <SubmitButton className="btn">Aprobar todo</SubmitButton>
          </form>
        )}
      </div>
      {posts.map((p) => (
        <article key={p.id} id={p.id} className="card grid-2">
          <div className="stack">
            <PostMeta post={p} tz={app.timezone} />
            <PostThumbs post={p} />
            {p.reviewDueAt && p.status === 'PENDING_REVIEW' && <p className="xs muted">Se aprueba solo: {fmtDate(p.reviewDueAt, app.timezone)}</p>}
            <div className="row">
              {p.status !== 'APPROVED' && (
                <form action={setPostStatus.bind(null, p.id, 'APPROVED')}>
                  <SubmitButton className="btn primary sm">Aprobar</SubmitButton>
                </form>
              )}
              {p.status === 'APPROVED' && (
                <form action={setPostStatus.bind(null, p.id, 'PENDING_REVIEW')}>
                  <SubmitButton className="btn sm">Volver a revisión</SubmitButton>
                </form>
              )}
              <form action={setPostStatus.bind(null, p.id, 'REJECTED')}>
                <SubmitButton className="btn sm danger">Rechazar</SubmitButton>
              </form>
            </div>
          </div>
          <form action={savePost.bind(null, p.id)} className="stack">
            <label>
              Descripción
              <textarea name="caption" defaultValue={p.caption} rows={9} maxLength={2200} />
            </label>
            <label>
              Textos de las diapositivas <span className="hint">JSON: título, cuerpo e ítems de cada una</span>
              <textarea name="slides" defaultValue={JSON.stringify(p.slides, null, 2)} rows={8} className="mono" />
            </label>
            <label>
              Texto alternativo
              <input name="altText" defaultValue={p.altText ?? ''} />
            </label>
            <label>
              Prompt de la imagen
              <textarea name="imagePrompt" defaultValue={p.imagePrompt ?? ''} rows={3} />
            </label>
            <label className="check">
              <input type="checkbox" name="regenerateImage" /> Generar una imagen nueva (consume crédito de OpenRouter)
            </label>
            <div>
              <SubmitButton className="btn" pendingText="Guardando…">
                Guardar y volver a renderizar
              </SubmitButton>
            </div>
          </form>
        </article>
      ))}
    </div>
  )
}
