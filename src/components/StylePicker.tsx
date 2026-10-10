'use client'
// Estilos de diseño con sus muestras en cada calidad de GPT Image 2.5 Sunburst: tocar una muestra elige el estilo y esa calidad.
// Con una app: sugerencias según el negocio, muestras con su marca y guardar el estilo en el promo.yaml del repo.
import { useState } from 'react'
import { DESIGN_STYLES, SAMPLE_QUALITIES, sampleKey, type DesignStyleId, type StyleSuggestion } from '@/lib/styles'
import { IMAGE_MODELS, type ImageQuality } from '@/lib/models'
import type { SamplesState } from '@/lib/style-samples'
import { AutoRefresh } from './client'

const QUALITY_LABEL: Record<ImageQuality, string> = { low: 'Baja', medium: 'Media', high: 'Alta' }
const money = (n: number) => `US$ ${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`

export interface StyleAppProps {
  name: string
  /** Muestras con la marca de la app (clave "estilo-calidad" → src). */
  samples: Record<string, string>
  suggestions: StyleSuggestion[]
  /** brand.style del promo.yaml (null si no lo define). */
  yamlStyle: string | null
  state: { mine: SamplesState | null; generic: SamplesState | null }
  actions: { suggest: () => Promise<void>; samples: (f: FormData) => Promise<void>; genericSamples: (f: FormData) => Promise<void> }
}

export function StylePicker({
  style,
  onStyle,
  sampleModel,
  quality,
  onSample,
  generic,
  app,
}: {
  style: DesignStyleId
  onStyle: (id: DesignStyleId) => void
  /** Modelo con el que se hicieron las muestras; si es el elegido, se marca la calidad actual. */
  sampleModel: { id: string; selected: boolean }
  quality: ImageQuality
  /** Tocar una muestra: estilo + modelo de las muestras + esa calidad. */
  onSample: (id: DesignStyleId, q: ImageQuality) => void
  /** Muestras genéricas ya generadas. */
  generic: Record<string, string>
  app?: StyleAppProps
}) {
  const prices = IMAGE_MODELS.find((m) => m.id === sampleModel.id)?.qualities
  const suggested = app?.suggestions ?? []
  const rank = (id: DesignStyleId) => {
    const i = suggested.findIndex((s) => s.id === id)
    return i < 0 ? 99 : i
  }
  const styles = [...DESIGN_STYLES].sort((a, b) => rank(a.id) - rank(b.id))
  const [toSample, setToSample] = useState<Set<DesignStyleId>>(new Set(suggested.length ? suggested.map((s) => s.id) : [style]))
  const [qualities, setQualities] = useState<Set<ImageQuality>>(new Set(['medium']))
  const [toYaml, setToYaml] = useState(false)
  const toggle = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set)
    if (n.has(v)) n.delete(v)
    else n.add(v)
    return n
  }
  const perStyle = prices ? [...qualities].reduce((a, q) => a + prices[q], 0) : 0
  const genericMissing = DESIGN_STYLES.length * SAMPLE_QUALITIES.length - Object.keys(generic).length
  const running = app && (app.state.mine?.status === 'running' || app.state.generic?.status === 'running')

  const row = (id: DesignStyleId, label: string, srcs: Record<string, string>, only?: boolean) => (
    <div className="stack-sm" style={{ gap: 4 }}>
      {label && <span className="xs muted">{label}</span>}
      <div className="style-samples">
        {SAMPLE_QUALITIES.filter((q) => !only || srcs[sampleKey(id, q)]).map((q) => {
          const src = srcs[sampleKey(id, q)]
          const name = DESIGN_STYLES.find((s) => s.id === id)!.label
          const current = id === style && sampleModel.selected && q === quality
          return (
            <button key={q} type="button" className={`style-sample${current ? ' on' : ''}`} onClick={() => onSample(id, q)} title={`${name}, calidad ${QUALITY_LABEL[q].toLowerCase()}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {src ? <img src={src} alt={`Muestra ${name}, calidad ${QUALITY_LABEL[q].toLowerCase()}`} loading="lazy" /> : <span className="empty xs muted">sin muestra</span>}
              <span className="xs">{QUALITY_LABEL[q]}</span>
              {prices && <span className="xs muted">{money(prices[q])}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="stack" id="estilo">
      <input type="hidden" name="designStyle" value={style} />
      {running && <AutoRefresh every={6000} />}
      {app && (
        <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span className="small">{suggested.length ? `Sugeridos para ${app.name} según su rubro, público y tono.` : `¿No sabés cuál va con ${app.name}? El modelo de texto lee el promo.yaml y sugiere 3.`}</span>
          <button className="btn sm" formAction={app.actions.suggest} formNoValidate>
            {suggested.length ? 'Volver a sugerir' : 'Sugerir estilos para mi negocio'}
          </button>
        </div>
      )}
      <div className="style-grid">
        {styles.map((s) => {
          const r = rank(s.id)
          const mine = app && SAMPLE_QUALITIES.some((q) => app.samples[sampleKey(s.id, q)])
          return (
            <div key={s.id} className={`style-card${s.id === style ? ' on' : ''}`}>
              <label className="style-head">
                <span className="row" style={{ gap: 8 }}>
                  <input type="radio" name="designStyleChoice" value={s.id} checked={s.id === style} onChange={() => onStyle(s.id)} />
                  <strong>{s.label}</strong>
                </span>
                <span className="row" style={{ gap: 4 }}>
                  {r < 99 && <span className="badge ok">Sugerido {r + 1}</span>}
                  {s.id === style && <span className="badge info">Elegido</span>}
                </span>
              </label>
              {r < 99 && <span className="small">{suggested[r].reason}</span>}
              {mine && row(s.id, `Con ${app.name}`, app.samples, true)}
              {row(s.id, mine ? 'Genérica (marca de prueba)' : '', generic)}
              <span className="small">{s.hint}</span>
              <span className="xs muted">{s.trend}</span>
              {app && (
                <label className="check xs">
                  <input type="checkbox" name="sampleStyles" value={s.id} checked={toSample.has(s.id)} onChange={() => setToSample(toggle(toSample, s.id))} /> Hacer muestra con {app.name}
                </label>
              )}
            </div>
          )
        })}
      </div>
      {app && (
        <div className="card stack-sm" style={{ background: 'var(--surface-2)' }}>
          <strong>Muestras con {app.name}</strong>
          <span className="hint small">Su marca, su tema y su tipo de imagen en la portada de cada estilo marcado. Las genéricas usan una marca de prueba y sirven para comparar calidades.</span>
          <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
            {SAMPLE_QUALITIES.map((q) => (
              <label key={q} className="check">
                <input type="checkbox" name="sampleQualities" value={q} checked={qualities.has(q)} onChange={() => setQualities(toggle(qualities, q))} /> {QUALITY_LABEL[q]}
                {prices ? ` (${money(prices[q])})` : ''}
              </label>
            ))}
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button className="btn sm primary" formAction={app.actions.samples} formNoValidate disabled={!!running || !toSample.size || !qualities.size}>
              Generar {toSample.size * qualities.size} muestras (~{money(toSample.size * perStyle)})
            </button>
            {genericMissing > 0 && (
              <button className="btn sm" formAction={app.actions.genericSamples} formNoValidate disabled={!!running}>
                Generar las {DESIGN_STYLES.length * SAMPLE_QUALITIES.length} genéricas (~{money(prices ? DESIGN_STYLES.length * Object.values(prices).reduce((a, b) => a + b, 0) : 0)}, una sola vez)
              </button>
            )}
          </div>
          {running && <p className="notice small">Generando muestras… tarda 1 a 3 minutos; esta página se actualiza sola.</p>}
          {app.state.mine?.status === 'error' && <p className="notice bad small">Falló la última tanda de muestras: {app.state.mine.error}</p>}
          {app.state.generic?.status === 'error' && <p className="notice bad small">Fallaron las muestras genéricas: {app.state.generic.error}</p>}
        </div>
      )}
      {app && (
        <div className="stack-sm">
          <label className="check">
            <input type="checkbox" name="styleToYaml" checked={toYaml} onChange={(e) => setToYaml(e.target.checked)} disabled={app.yamlStyle === style} /> Guardar el estilo en el promo.yaml del repo (<code>brand.style</code>; abre un PR)
          </label>
          <span className="xs muted">
            {app.yamlStyle
              ? app.yamlStyle === style
                ? 'El promo.yaml ya tiene este estilo.'
                : `El promo.yaml dice "${DESIGN_STYLES.find((s) => s.id === app.yamlStyle)?.label ?? app.yamlStyle}": si después cambia el yaml, vuelve a mandar ese. Guardalo en el repo para que quede este.`
              : 'El promo.yaml no define estilo: el de acá alcanza. Guardarlo en el repo deja el estilo junto al resto de la marca.'}
          </span>
        </div>
      )}
    </div>
  )
}
