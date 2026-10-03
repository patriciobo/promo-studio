import { setImageArchived, updateImage, uploadImages } from '@/app/actions'
import { AutoRefresh, SubmitButton } from '@/components/client'
import { db } from '@/lib/db'
import { mediaSrc } from '@/lib/media'

export default async function Images({ params }: PageProps<'/apps/[slug]/imagenes'>) {
  const { slug } = await params
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const images = await db.appImage.findMany({ where: { appId: app.id }, orderBy: [{ archived: 'asc' }, { createdAt: 'desc' }] })
  // El worker las describe en segundos; si no pudo (sin crédito, modelo sin visión), el plan lo reintenta al usarlas.
  const recent = new Date(new Date().getTime() - 3 * 60e3)
  const describing = images.some((i) => !i.description && i.createdAt > recent)
  return (
    <div className="stack" style={{ gap: 24 }}>
      {describing && <AutoRefresh />}
      <section className="card stack">
        <div className="stack-sm">
          <h2>Imágenes de la app</h2>
          <p className="small muted">
            Capturas de pantalla o fotos reales para basar publicaciones en ellas. Al subirlas, el modelo de texto las describe una vez (centavos de centavo); después el plan semanal las usa cuando
            encajan y las diapositivas que las muestran no generan ilustración con IA. También podés elegirlas en Crear ahora o al generar una semana.
          </p>
        </div>
        <form action={uploadImages.bind(null, slug)} className="stack">
          <label>
            Imágenes <span className="hint">JPG, PNG o WebP, hasta 8 MB cada una</span>
            <input type="file" name="images" accept="image/jpeg,image/png,image/webp" multiple required />
          </label>
          <label>
            Nota <span className="hint">opcional: qué muestran o para qué usarlas</span>
            <input name="imageNote" maxLength={500} />
          </label>
          <div className="row">
            <SubmitButton pendingText="Subiendo…">Subir</SubmitButton>
          </div>
        </form>
      </section>
      {!images.length && <div className="card empty">Todavía no hay imágenes.</div>}
      <div className="grid">
        {images.map((i) => (
          <article key={i.id} className={`card stack library-card${i.archived ? ' archived' : ''}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mediaSrc(i.path)} alt={i.description ?? 'Imagen subida'} loading="lazy" />
            <p className="small">{i.description ?? <span className="muted">{describing ? 'Describiendo…' : 'Sin descripción todavía: se describe cuando el plan la use.'}</span>}</p>
            <form action={updateImage.bind(null, i.id)} className="stack-sm">
              <label>
                Nota
                <input name="note" defaultValue={i.note ?? ''} maxLength={500} />
              </label>
              <label>
                Tipo
                <select name="kind" defaultValue={i.kind}>
                  <option value="SCREENSHOT">Captura: va enmarcada junto al texto</option>
                  <option value="PHOTO">Foto: ocupa el lugar de la ilustración</option>
                </select>
              </label>
              <div className="row">
                <SubmitButton className="btn sm">Guardar</SubmitButton>
              </div>
            </form>
            <form action={setImageArchived.bind(null, i.id, !i.archived)}>
              <SubmitButton className="btn sm ghost">{i.archived ? 'Volver a usar' : 'Archivar'}</SubmitButton>
            </form>
          </article>
        ))}
      </div>
    </div>
  )
}
