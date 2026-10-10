import { approveAll, publishNow, reschedulePost, savePost, sendReviewAction, setPostStatus } from '@/app/actions'
import { ConfirmButton, SubmitButton } from '@/components/client'
import { ModelSelect } from '@/components/ModelSelect'
import { PostMeta, PostThumbs } from '@/components/PostPreview'
import { db } from '@/lib/db'
import { toLocalInput } from '@/lib/schedule'
import { fmtDate } from '@/lib/view'

export default async function Review({ params, searchParams }: PageProps<'/apps/[slug]/revision'>) {
  const { slug } = await params
  const q = await searchParams
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const posts = await db.post.findMany({ where: { appId: app.id, status: { in: ['PENDING_REVIEW', 'APPROVED', 'DRAFT'] } }, orderBy: { scheduledAt: 'asc' }, include: { assets: true, ads: { include: { campaign: { select: { id: true, name: true } } } } } })
  const pending = posts.filter((p) => p.status === 'PENDING_REVIEW' && !p.adOnly).length
  const unsent = posts.filter((p) => p.status === 'PENDING_REVIEW' && !p.adOnly && p.waNumber === null).length
  return (
    <div className="stack" style={{ gap: 20 }}>
      {typeof q.whatsapp === 'string' && <p className="notice ok">{q.whatsapp === '0' ? 'No había nada nuevo para mandar al cliente.' : `Mandadas al WhatsApp del cliente: ${q.whatsapp}.`}</p>}
      {typeof q['whatsapp-error'] === 'string' && <p className="notice bad">No se pudo mandar al cliente: {q['whatsapp-error']}</p>}
      {app.whatsapp ? (
        <div className="card row between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span className="small">
            Aprobación por WhatsApp: lo nuevo para revisar se le manda a <strong>+{app.whatsapp}</strong> y lo aprueba respondiendo (<em>ok</em>, <em>ok 1 3</em>, <em>cambios 2: …</em>, <em>no 2</em>).
            {unsent > 0 && ` ${unsent} sin mandar.`}
          </span>
          {unsent > 0 && (
            <form action={sendReviewAction.bind(null, slug, undefined)}>
              <SubmitButton className="btn sm" pendingText="Mandando…" expect={10}>
                Mandar al cliente
              </SubmitButton>
            </form>
          )}
        </div>
      ) : (
        <p className="small muted">
          Para que el cliente apruebe por WhatsApp, cargá su número en <a href={`/apps/${slug}/ajustes`}>Ajustes</a>.
        </p>
      )}
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
            {p.error && p.status === 'PENDING_REVIEW' && <p className="notice warn small">{p.error}</p>}
            {app.whatsapp && p.waNumber !== null && p.status === 'PENDING_REVIEW' && (
              <div className="row xs muted" style={{ gap: 8 }}>
                <span>
                  Mandada al cliente como <strong>{p.waNumber}</strong>
                  {p.waSentAt ? ` el ${fmtDate(p.waSentAt, app.timezone)}` : ''}.
                </span>
                <form action={sendReviewAction.bind(null, slug, p.id)}>
                  <SubmitButton className="btn sm ghost" pendingText="Mandando…">
                    Volver a mandar
                  </SubmitButton>
                </form>
              </div>
            )}
            {p.adOnly ? (
              <p className="notice info small">
                Pieza sólo para anuncios: nunca se publica en el feed.{' '}
                {p.ads.map((ad) => (
                  <a key={ad.campaign.id} href={`/apps/${slug}/anuncios#${ad.campaign.id}`} style={{ textDecoration: 'underline' }}>
                    Campaña {ad.campaign.name}.
                  </a>
                ))}
                {p.status === 'DRAFT' ? ' Se está generando.' : ' Revisá y editá el texto acá; después creala en Meta desde Anuncios.'}
              </p>
            ) : (
              <>
              <form action={reschedulePost.bind(null, p.id)} className="row">
                <label className="small" style={{ flex: 1 }}>
                  Fecha y hora de publicación <span className="hint">{app.timezone.split('/').pop()?.replace(/_/g, ' ')}</span>
                  <input type="datetime-local" name="scheduledAt" defaultValue={p.scheduledAt ? toLocalInput(p.scheduledAt, app.timezone) : ''} />
                </label>
                <SubmitButton className="btn sm" pendingText="Guardando…">
                  Guardar fecha
                </SubmitButton>
              </form>
              {!p.scheduledAt && <p className="xs muted">Sin fecha: se publica cuando toques &quot;Publicar ahora&quot;, o poné una fecha y aprobalo.</p>}
              {p.scheduledAt && p.status !== 'APPROVED' && <p className="xs muted">Se publica en esa fecha sólo si está aprobado.</p>}
              {p.reviewDueAt && p.status === 'PENDING_REVIEW' && <p className="xs muted">Se aprueba solo: {fmtDate(p.reviewDueAt, app.timezone)}</p>}
              <div className="row">
                {p.assets.length > 0 && p.status !== 'DRAFT' && (
                  <ConfirmButton
                    action={publishNow.bind(null, p.id)}
                    label="Publicar ahora"
                    className="btn primary sm"
                    confirm={app.dryRun ? 'Simulación activa: no llega a Instagram.' : `Se publica ya en @${app.igUsername ?? '?'}.`}
                  />
                )}
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
              </>
            )}
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
            <div className="row">
              <ModelSelect app={app} label="Modelo para imágenes nuevas" />
              <SubmitButton className="btn" pendingText="Guardando…">
                Guardar y volver a renderizar
              </SubmitButton>
            </div>
            <p className="xs muted">El modelo se usa si marcás &quot;Generar una imagen nueva&quot; o si a alguna diapositiva le falta su ilustración.</p>
          </form>
        </article>
      ))}
    </div>
  )
}
