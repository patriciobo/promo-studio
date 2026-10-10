'use client'
// Estilos de diseño con sus muestras en cada calidad de GPT Image 2.5 Sunburst: tocar una muestra elige el estilo y esa calidad.
// Con una app: sugerencias según el negocio y guardar el estilo en el promo.yaml del repo. Las muestras se piden en la pestaña Muestras.
import { useEffect, useRef, useState } from 'react'
import { DESIGN_STYLES, SAMPLE_QUALITIES, sampleKey, type DesignStyleId, type StyleSuggestion } from '@/lib/styles'
import { IMAGE_MODELS, type ImageQuality } from '@/lib/models'
import { ActionButton } from './client'

export const QUALITY_LABEL: Record<ImageQuality, string> = { low: 'Baja', medium: 'Media' }
export const money = (n: number) => `US$ ${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`

export interface StyleAppProps {
  name: string
  slug: string
  /** Con qué marca se hicieron las muestras genéricas. */
  genericName: string
  /** Muestras con la marca de la app (clave "estilo-calidad" → src). */
  samples: Record<string, string>
  suggestions: StyleSuggestion[]
  /** brand.style del promo.yaml (null si no lo define). */
  yamlStyle: string | null
  suggest: () => Promise<void>
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
  const [toYaml, setToYaml] = useState(false)
  const [view, setView] = useState<View | null>(null)
  const row = (id: DesignStyleId, label: string, srcs: Record<string, string>, only?: boolean) => (
    <div className="stack-sm" style={{ gap: 4 }}>
      {label && <span className="xs muted">{label}</span>}
      <div className="style-samples">
        {SAMPLE_QUALITIES.filter((q) => !only || srcs[sampleKey(id, q)]).map((q) => {
          const src = srcs[sampleKey(id, q)]
          const name = DESIGN_STYLES.find((s) => s.id === id)!.label
          const current = id === style && sampleModel.selected && q === quality
          return (
            <div key={q} className="style-sample-wrap">
              <button type="button" className={`style-sample${current ? ' on' : ''}`} onClick={() => onSample(id, q)} title={`${name}, calidad ${QUALITY_LABEL[q].toLowerCase()}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {src ? <img src={src} alt={`Muestra ${name}, calidad ${QUALITY_LABEL[q].toLowerCase()}`} loading="lazy" /> : <span className="empty xs muted">sin muestra</span>}
                <span className="xs">{QUALITY_LABEL[q]}</span>
                {prices && <span className="xs muted">{money(prices[q])}</span>}
              </button>
              {src && (
                <button type="button" className="style-zoom" onClick={() => setView({ id, label, srcs, q })} aria-label={`Ampliar ${name}, calidad ${QUALITY_LABEL[q].toLowerCase()}`} title="Ampliar">
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <circle cx="10.5" cy="10.5" r="6.5" />
                    <path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6" />
                  </svg>
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  // Al ampliar, "Estilo anterior/siguiente" recorre los que tienen muestra en la misma fila (con la app o genéricas).
  const withSamples = (srcs: Record<string, string>) => styles.map((s) => s.id).filter((id) => SAMPLE_QUALITIES.some((q) => srcs[sampleKey(id, q)]))

  return (
    <div className="stack" id="estilo">
      {view && (
        <SampleViewer
          view={view}
          order={withSamples(view.srcs)}
          prices={prices}
          current={sampleModel.selected ? { id: style, q: quality } : null}
          onView={setView}
          onUse={(id, q) => {
            onSample(id, q)
            setView(null)
          }}
        />
      )}
      <input type="hidden" name="designStyle" value={style} />
      {app && (
        <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span className="small">{suggested.length ? `Sugeridos para ${app.name} según su rubro, público y tono.` : `¿No sabés cuál va con ${app.name}? El modelo de texto lee el promo.yaml y sugiere 3.`}</span>
          <ActionButton action={app.suggest} pendingText="Leyendo el promo.yaml y eligiendo estilos…" expect={20}>
            {suggested.length ? 'Volver a sugerir' : 'Sugerir estilos para mi negocio'}
          </ActionButton>
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
              {row(s.id, mine ? `Ejemplo con ${app.genericName}` : '', generic)}
              <span className="small">{s.hint}</span>
              <span className="row" style={{ flexWrap: 'wrap', gap: 4 }} title="Lo que busca hacer sentir a los seguidores">
                {s.feelings.map((w) => (
                  <span key={w} className="badge">
                    {w}
                  </span>
                ))}
              </span>
              <span className="xs muted">{s.trend}</span>
            </div>
          )
        })}
      </div>
      {app && (
        <p className="notice small row between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span>Para ver cómo queda cada estilo con la marca de {app.name}, tildá las calidades que quieras probar en la pestaña Muestras.</span>
          <a className="btn sm" href={`/apps/${app.slug}/muestras`}>
            Ir a Muestras →
          </a>
        </p>
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

export type View = { id: DesignStyleId; label: string; srcs: Record<string, string>; q: ImageQuality }

/** Muestra ampliada: una calidad grande (clic = tamaño real) o las 3 lado a lado, con flechas para cambiar de calidad. */
export function SampleViewer({
  view,
  order,
  prices,
  current,
  onView,
  onUse,
}: {
  view: View
  order: DesignStyleId[]
  prices?: Record<ImageQuality, number>
  current: { id: DesignStyleId; q: ImageQuality } | null
  onView: (v: View | null) => void
  onUse: (id: DesignStyleId, q: ImageQuality) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [compare, setCompare] = useState(false)
  const [full, setFull] = useState(false)
  const s = DESIGN_STYLES.find((d) => d.id === view.id)!
  const qs = SAMPLE_QUALITIES.filter((q) => view.srcs[sampleKey(view.id, q)])
  const q = qs.includes(view.q) ? view.q : qs[0]
  const go = (dq: number, ds = 0) => {
    if (ds) {
      const id = order[(order.indexOf(view.id) + ds + order.length) % order.length]
      return onView({ ...view, id })
    }
    onView({ ...view, q: qs[(qs.indexOf(q) + dq + qs.length) % qs.length] })
  }
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])
  const onKey = (e: React.KeyboardEvent) => {
    const move = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key]
    if (!move || full) return
    e.preventDefault()
    go(move[0], move[1])
  }
  const quality = (x: ImageQuality) => `${QUALITY_LABEL[x]}${prices ? ` · ${money(prices[x])}` : ''}`
  const isCurrent = (x: ImageQuality) => current?.id === view.id && current.q === x

  return (
    <dialog ref={ref} className="sample-viewer" onClose={() => onView(null)} onKeyDown={onKey} onClick={(e) => e.target === e.currentTarget && ref.current?.close()} aria-label={`Muestra de ${s.label}`}>
      <div className="sample-viewer-head">
        <div className="stack-sm" style={{ gap: 2 }}>
          <strong>{s.label}</strong>
          <span className="xs muted">
            {view.label || 'Ejemplo genérico'} · {s.feelings.join(', ')}
          </span>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {order.length > 1 && (
            <>
              <button type="button" className="btn sm ghost" onClick={() => go(0, -1)} title="Estilo anterior (↑)">
                ↑ Estilo
              </button>
              <button type="button" className="btn sm ghost" onClick={() => go(0, 1)} title="Estilo siguiente (↓)">
                ↓ Estilo
              </button>
            </>
          )}
          {qs.length > 1 && (
            <button type="button" className="btn sm" onClick={() => setCompare(!compare)}>
              {compare ? 'Ver una' : `Comparar las ${qs.length}`}
            </button>
          )}
          <button type="button" className="btn sm ghost" onClick={() => ref.current?.close()} aria-label="Cerrar">
            ✕
          </button>
        </div>
      </div>
      {compare ? (
        <div className="sample-viewer-compare" style={{ gridTemplateColumns: `repeat(${qs.length}, 1fr)` }}>
          {qs.map((x) => (
            <figure key={x} className="stack-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={view.srcs[sampleKey(view.id, x)]} alt={`${s.label}, calidad ${QUALITY_LABEL[x].toLowerCase()}`} onClick={() => (setCompare(false), onView({ ...view, q: x }))} />
              <figcaption className="row between" style={{ gap: 6, flexWrap: 'wrap' }}>
                <span className="small">{quality(x)}</span>
                <button type="button" className={`btn sm${isCurrent(x) ? '' : ' primary'}`} disabled={isCurrent(x)} onClick={() => onUse(view.id, x)}>
                  {isCurrent(x) ? 'Elegida' : 'Usar'}
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }} role="tablist" aria-label="Calidad">
            {qs.map((x) => (
              <button key={x} type="button" role="tab" aria-selected={x === q} className={`btn sm${x === q ? ' primary' : ' ghost'}`} onClick={() => onView({ ...view, q: x })}>
                {quality(x)}
              </button>
            ))}
            <span className="xs muted sample-viewer-keys">Precio por imagen · ← → calidad · ↑ ↓ estilo · clic en la imagen: tamaño real</span>
          </div>
          <div className={`sample-viewer-main${full ? ' full' : ''}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={view.srcs[sampleKey(view.id, q)]} alt={`${s.label}, calidad ${QUALITY_LABEL[q].toLowerCase()}`} onClick={() => setFull(!full)} />
          </div>
          <div className="row between" style={{ gap: 8, flexWrap: 'wrap' }}>
            <a className="btn sm ghost" href={view.srcs[sampleKey(view.id, q)]} target="_blank" rel="noreferrer">
              Abrir original ↗
            </a>
            <button type="button" className="btn sm primary" disabled={isCurrent(q)} onClick={() => onUse(view.id, q)}>
              {isCurrent(q) ? 'Es el estilo y la calidad elegidos' : `Usar ${s.label} en calidad ${QUALITY_LABEL[q].toLowerCase()}`}
            </button>
          </div>
        </>
      )}
    </dialog>
  )
}
