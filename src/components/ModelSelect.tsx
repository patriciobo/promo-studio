// Selector compacto de modelo de imagen para poner al lado de los botones de generar.
// Arranca en el modelo de Ajustes de la app; el elegido se usa sólo para esa generación.
import { encodeImageChoice, IMAGE_MODELS, TIERS, type ImageQuality } from '@/lib/models'

const QUALITY_LABEL: Record<ImageQuality, string> = { low: 'baja', medium: 'media', high: 'alta' }
const money = (n: number) => `US$ ${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`

export function ModelSelect({ app, label = 'Modelo de imagen' }: { app: { imageModel: string | null; imageQuality: string | null }; label?: string }) {
  const current = encodeImageChoice({ model: app.imageModel, quality: app.imageModel ? (app.imageQuality ?? IMAGE_MODELS.find((m) => m.id === app.imageModel)?.defaultQuality ?? null) : null })
  const tag = (v: string) => (v === current ? ' · Ajustes' : '')
  const custom = app.imageModel && !IMAGE_MODELS.some((m) => m.id === app.imageModel) ? app.imageModel : null
  return (
    <select name="imageChoice" defaultValue={current} aria-label={label} title={label} className="model-select">
      {TIERS.map((t) => (
        <optgroup key={t.id} label={t.label}>
          {IMAGE_MODELS.filter((m) => m.tier === t.id).flatMap((m) =>
            m.qualities
              ? (Object.entries(m.qualities) as [ImageQuality, number][]).map(([q, price]) => {
                  const v = encodeImageChoice({ model: m.id, quality: q })
                  return (
                    <option key={v} value={v}>
                      {m.name} ({QUALITY_LABEL[q]}) · {money(price)}/img{tag(v)}
                    </option>
                  )
                })
              : [
                  <option key={m.id} value={encodeImageChoice({ model: m.id, quality: null })}>
                    {m.name} · {money(m.priceUsd)}/img{tag(encodeImageChoice({ model: m.id, quality: null }))}
                  </option>,
                ],
          )}
        </optgroup>
      ))}
      <optgroup label="Otros">
        {custom && (
          <option value={encodeImageChoice({ model: custom, quality: app.imageQuality })}>
            {custom} · Ajustes
          </option>
        )}
        <option value="none">Sin imagen IA (gratis){tag('none')}</option>
      </optgroup>
    </select>
  )
}
