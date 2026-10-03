// Elegir imágenes en las que se basa un pedido: subir nuevas (quedan en la biblioteca) o marcar de la biblioteca.
// `form`: id del formulario, cuando el selector queda fuera de él.
import Link from 'next/link'
import type { AppImage } from '@prisma/client'
import { mediaSrc } from '@/lib/media'

export function ImagePicker({ images, slug, hint, form }: { images: Pick<AppImage, 'id' | 'path' | 'description' | 'note'>[]; slug: string; hint: string; form?: string }) {
  return (
    <details className="image-picker">
      <summary>Basar en imágenes <span className="hint">opcional</span></summary>
      <div className="stack" style={{ marginTop: 12 }}>
        <p className="small muted">{hint} Cada diapositiva que usa una imagen tuya no genera ilustración con IA (es más barata).</p>
        <label>
          Subir capturas o fotos <span className="hint">JPG, PNG o WebP, hasta 8 MB cada una</span>
          <input type="file" name="images" form={form} accept="image/jpeg,image/png,image/webp" multiple />
        </label>
        <label>
          Qué querés contar con ellas <span className="hint">opcional, p. ej. “paso a paso para agendar un turno”</span>
          <input name="imageNote" form={form} maxLength={500} />
        </label>
        {images.length > 0 && (
          <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="small muted">
              O elegí de la <Link href={`/apps/${slug}/imagenes`}>biblioteca</Link>
            </legend>
            <div className="image-grid">
              {images.map((i) => (
                <label key={i.id} className="image-pick" title={i.description ?? i.note ?? ''}>
                  <input type="checkbox" name="imageIds" form={form} value={i.id} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaSrc(i.path)} alt={i.description ?? 'Imagen de la biblioteca'} loading="lazy" />
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </div>
    </details>
  )
}
