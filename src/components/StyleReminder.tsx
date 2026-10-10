// Recordatorio, junto a los botones de generar, del estilo y la imagen que se usan por defecto (los de Ajustes).
import Link from 'next/link'
import { IMAGE_KINDS, IMAGE_MODELS, parseImageKind, type ImageQuality } from '@/lib/models'
import { listSamples } from '@/lib/style-samples'
import { designStyle, SAMPLE_QUALITIES, sampleKey } from '@/lib/styles'

const QUALITY: Record<ImageQuality, string> = { low: 'baja', medium: 'media' }

export async function StyleReminder({ app }: { app: { slug: string; designStyle: string | null; imageModel: string | null; imageQuality: string | null; imageKind: string | null } }) {
  const style = designStyle(app.designStyle)
  const model = IMAGE_MODELS.find((m) => m.id === app.imageModel)
  const kind = IMAGE_KINDS.find((k) => k.id === (parseImageKind(app.imageKind) ?? 'illustration'))!
  const q = (app.imageQuality ?? model?.defaultQuality) as ImageQuality | undefined
  const [mine, generic] = await Promise.all([listSamples(app.slug), listSamples()])
  const key = sampleKey(style.id, q && SAMPLE_QUALITIES.includes(q) ? q : 'medium', kind.id)
  const thumb = mine[key] ?? generic[key]
  return (
    <div className="style-reminder">
      {thumb && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt={`Muestra del estilo ${style.label}`} />
      )}
      <span className="small">
        <span className="muted">Estilo por defecto:</span> <strong>{style.label}</strong>
        <span className="muted"> · {style.feelings.slice(0, 3).join(', ')}</span>
        <br />
        <span className="xs muted">
          {kind.label} · {model ? `${model.name}${q && model.qualities ? `, calidad ${QUALITY[q]}` : ''}` : 'sin modelo de imagen (sólo color de marca)'} ·{' '}
          <Link href={`/apps/${app.slug}/ajustes`}>cambiar en Ajustes</Link> · <Link href={`/apps/${app.slug}/muestras`}>ver muestras</Link>
        </span>
      </span>
    </div>
  )
}
