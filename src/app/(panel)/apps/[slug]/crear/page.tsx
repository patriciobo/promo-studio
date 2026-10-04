import Link from 'next/link'
import type { PostType } from '@prisma/client'
import { createPostNow, retryPost } from '@/app/actions'
import { AutoRefresh, SubmitButton } from '@/components/client'
import { ImagePicker } from '@/components/ImagePicker'
import { ModelSelect } from '@/components/ModelSelect'
import { PostMeta, PostThumbs } from '@/components/PostPreview'
import { db } from '@/lib/db'
import type { Manifest } from '@/lib/manifest'

const TYPES: { value: PostType; label: string; hint: string }[] = [
  { value: 'IMAGE', label: 'Imagen', hint: '1 pieza 4:5 para el feed' },
  { value: 'CAROUSEL', label: 'Carrusel', hint: '4 a 7 diapositivas que enseñan algo' },
  { value: 'REEL', label: 'Reel', hint: 'video vertical de ~15 s' },
  { value: 'STORY', label: 'Story', hint: '1 pieza vertical, dura 24 h' },
]

export default async function CreateNow({ params }: PageProps<'/apps/[slug]/crear'>) {
  const { slug } = await params
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const pillars = (app.manifest as unknown as Manifest | null)?.pillars ?? []
  const posts = await db.post.findMany({ where: { appId: app.id, batchId: null, dailyDate: null, adOnly: false }, orderBy: { createdAt: 'desc' }, take: 10, include: { assets: true } })
  const images = await db.appImage.findMany({ where: { appId: app.id, archived: false }, orderBy: { createdAt: 'desc' }, take: 24 })
  const busy = posts.some((p) => p.status === 'DRAFT' || p.status === 'PUBLISHING' || (p.status === 'APPROVED' && p.scheduledAt && p.scheduledAt <= new Date()))
  return (
    <div className="stack" style={{ gap: 24 }}>
      {busy && <AutoRefresh />}
      <section className="card stack">
        <div className="stack-sm">
          <h2>Crear una publicación ahora</h2>
          <p className="small muted">Elegí el tipo y el tema (o subí capturas y el post cuenta lo que muestran). Se genera en un minuto o dos, la revisás y la publicás en el momento desde Revisión. No se aprueba sola.</p>
        </div>
        {!app.manifest && <p className="notice bad small">Primero hace falta un promo.yaml válido: sincronizá la app.</p>}
        <form action={createPostNow.bind(null, slug)} className="stack">
          <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="small muted">Tipo</legend>
            {TYPES.map((t, i) => (
              <label key={t.value} className="check">
                <input type="radio" name="type" value={t.value} defaultChecked={i === 0} required /> {t.label} <span className="hint">{t.hint}</span>
              </label>
            ))}
          </fieldset>
          <label>
            Tema <span className="hint">opcional si elegís imágenes</span>
            <textarea name="topic" rows={3} maxLength={500} placeholder="Por ejemplo: 3 errores comunes al cargar gastos y cómo la app los evita" />
          </label>
          {pillars.length > 0 && (
            <label>
              Pilar <span className="hint">opcional</span>
              <select name="pillar" defaultValue="">
                <option value="">El que mejor encaje</option>
                {pillars.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          )}
          <ImagePicker images={images} slug={slug} hint="Por ejemplo, las pantallas de un flujo en orden para un carrusel paso a paso." />
          <div className="row">
            <ModelSelect app={app} />
            <SubmitButton pendingText="Encolando…">{app.manifest ? 'Generar' : 'Generar (falta promo.yaml)'}</SubmitButton>
          </div>
        </form>
      </section>
      {posts.length > 0 && (
        <section className="stack">
          <h2>Últimas a pedido</h2>
          <div className="grid">
            {posts.map((p) => (
              <article key={p.id} className="card post-card">
                <PostMeta post={p} tz={app.timezone} />
                {p.status === 'DRAFT' ? <div className="notice small">Generando: “{p.hook}”…</div> : <PostThumbs post={p} />}
                {p.status !== 'DRAFT' && (
                  <p className="small" style={{ whiteSpace: 'pre-line' }}>
                    {p.caption.split('\n')[0]}
                  </p>
                )}
                {p.error && <p className={`notice small ${p.status === 'FAILED' ? 'bad' : 'warn'}`}>{p.error}</p>}
                <div className="row">
                  {['PENDING_REVIEW', 'APPROVED'].includes(p.status) && (
                    <Link className="btn sm primary" href={`/apps/${slug}/revision#${p.id}`}>
                      Revisar y publicar
                    </Link>
                  )}
                  {p.status === 'FAILED' && p.assets.length > 0 && (
                    <form action={retryPost.bind(null, p.id)}>
                      <SubmitButton className="btn sm">Reintentar publicación</SubmitButton>
                    </form>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
