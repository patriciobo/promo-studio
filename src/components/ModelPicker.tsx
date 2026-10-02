'use client'
// Selector de modelos de OpenRouter: catálogo curado por uso, con precio y gasto mensual estimado.
import { useState } from 'react'
import { IMAGE_MODELS, imagePrice, PRICES_CHECKED, TEXT_MODELS, TIERS, type ImageQuality } from '@/lib/models'
import type { ModelInfo } from '@/lib/openrouter'

const OTHER = '__other'
const money = (n: number) => `US$ ${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`
const QUALITY_LABEL: Record<ImageQuality, string> = { low: 'Baja', medium: 'Media', high: 'Alta' }

export function ImageModelPicker({
  current,
  quality,
  imagesPerMonth,
  budget,
  available,
}: {
  current: string | null
  quality: string | null
  imagesPerMonth: number
  budget?: number
  /** Todos los modelos de imagen de OpenRouter (vacío si no se pudo consultar). */
  available: ModelInfo[]
}) {
  const curated = IMAGE_MODELS.some((m) => m.id === current)
  const [choice, setChoice] = useState(curated ? current! : current ? OTHER : '')
  const [other, setOther] = useState(curated ? '' : (current ?? ''))
  const selected = IMAGE_MODELS.find((m) => m.id === choice)
  const [q, setQ] = useState<ImageQuality>((quality as ImageQuality) ?? selected?.defaultQuality ?? 'medium')
  const live = new Set(available.map((m) => m.id))
  const value = choice === OTHER ? other : choice
  return (
    <div className="stack">
      <input type="hidden" name="imageModel" value={value} />
      <input type="hidden" name="imageQuality" value={selected?.qualities ? q : ''} />
      {TIERS.map((t) => (
        <fieldset key={t.id} className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>
            <strong>{t.label}</strong> <span className="hint">{t.hint}</span>
          </legend>
          <div className="model-grid">
            {IMAGE_MODELS.filter((m) => m.tier === t.id).map((m) => {
              const price = imagePrice(m, m.id === choice ? q : null)
              const month = price * imagesPerMonth
              const missing = live.size > 0 && !live.has(m.id)
              return (
                <label key={m.id} className={`model-card${missing ? ' off' : ''}`}>
                  <input type="radio" name="imageModelChoice" value={m.id} checked={choice === m.id} disabled={missing} onChange={() => (setChoice(m.id), m.defaultQuality && setQ(m.defaultQuality))} />
                  <span className="row between">
                    <strong>{m.name}</strong>
                    {m.recommended && <span className="badge ok">Recomendado</span>}
                    {missing && <span className="badge bad">No disponible</span>}
                  </span>
                  <span className="small">{m.level}</span>
                  <span className="xs muted">{m.uses}</span>
                  <span className="xs muted">{m.popularity}</span>
                  <span className="small">
                    <strong>{money(price)}</strong>/imagen{m.qualities && m.id !== choice ? ' (calidad media)' : ''} · ~{money(month)}/mes
                    {budget != null && month > budget && <span className="badge warn" style={{ marginLeft: 6 }}>supera el presupuesto</span>}
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      ))}
      {selected?.qualities && (
        <label>
          Calidad de {selected.name} <span className="hint">cobra por tokens: la calidad define el precio</span>
          <select value={q} onChange={(e) => setQ(e.target.value as ImageQuality)}>
            {(Object.keys(selected.qualities) as ImageQuality[]).map((k) => (
              <option key={k} value={k}>
                {QUALITY_LABEL[k]}: {money(selected.qualities![k])}/imagen · ~{money(selected.qualities![k] * imagesPerMonth)}/mes
              </option>
            ))}
          </select>
        </label>
      )}
      <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
        <label className="check">
          <input type="radio" name="imageModelChoice" value="" checked={choice === ''} onChange={() => setChoice('')} /> Sin modelo de imagen <span className="hint">las piezas usan el color de la marca, sin costo</span>
        </label>
        <label className="check">
          <input type="radio" name="imageModelChoice" value={OTHER} checked={choice === OTHER} onChange={() => setChoice(OTHER)} /> Otro modelo (avanzado)
        </label>
        {choice === OTHER && (
          <>
            <input value={other} onChange={(e) => setOther(e.target.value)} list="image-models" placeholder="proveedor/modelo" required />
            <datalist id="image-models">
              {available.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </datalist>
          </>
        )}
      </fieldset>
      <p className="xs muted">
        Estimado para ~{imagesPerMonth} ilustraciones por mes (una por diapositiva o escena, según la cadencia del promo.yaml). Precios aproximados verificados el {PRICES_CHECKED}; el gasto real queda en Configuración.
      </p>
    </div>
  )
}

export function TextModelPicker({ current, available }: { current: string; available: ModelInfo[] }) {
  const curated = TEXT_MODELS.some((m) => m.id === current)
  const [choice, setChoice] = useState(curated ? current : OTHER)
  const [other, setOther] = useState(curated ? '' : current)
  return (
    <div className="stack-sm">
      <input type="hidden" name="textModel" value={choice === OTHER ? other : choice} />
      <select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Modelo de texto">
        {TEXT_MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {m.recommended ? ' (recomendado)' : ''} · {m.note}
          </option>
        ))}
        <option value={OTHER}>Otro modelo (avanzado)</option>
      </select>
      {choice === OTHER && (
        <>
          <input value={other} onChange={(e) => setOther(e.target.value)} list="text-models" placeholder="proveedor/modelo" required />
          <datalist id="text-models">
            {available.slice(0, 150).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} {m.price ?? ''}
              </option>
            ))}
          </datalist>
        </>
      )}
    </div>
  )
}
