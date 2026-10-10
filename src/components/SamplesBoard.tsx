'use client'
// Pestaña Muestras: los ejemplos genéricos (hechos con la app de ejemplo) y, al lado, los de esta app.
// Se tilda cada calidad de cada estilo que se quiere probar con la marca de la app y se generan juntas.
import { useState, useTransition } from 'react'
import { DESIGN_STYLES, SAMPLE_QUALITIES, sampleKey, type DesignStyleId, type StyleSuggestion } from '@/lib/styles'
import type { ImageQuality } from '@/lib/models'
import type { SamplesState } from '@/lib/style-samples'
import { ActionButton, Progress } from './client'
import { money, QUALITY_LABEL, SampleViewer, type View } from './StylePicker'

export interface SamplesBoardProps {
  appName: string
  genericName: string
  /** Con qué marca se harían hoy (la de la app de ejemplo), si existe. */
  exampleName: string | null
  /** Las genéricas guardadas son de otra marca: conviene rehacerlas. */
  outdated: boolean
  /** La app que se está viendo es la de los ejemplos genéricos. */
  isExample: boolean
  generic: Record<string, string>
  mine: Record<string, string>
  suggestions: StyleSuggestion[]
  prices: Record<ImageQuality, number>
  current: { id: DesignStyleId; q: ImageQuality } | null
  state: { mine: SamplesState | null; generic: SamplesState | null }
  actions: {
    samples: (f: FormData) => Promise<void>
    generic: (f: FormData) => Promise<void>
    suggest: () => Promise<void>
    choose: (style: DesignStyleId, q: ImageQuality) => Promise<void>
  }
}

const Zoom = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6" />
  </svg>
)

export function SamplesBoard({ appName, genericName, exampleName, outdated, isExample, generic, mine, suggestions, prices, current, state, actions }: SamplesBoardProps) {
  const rank = (id: DesignStyleId) => {
    const i = suggestions.findIndex((s) => s.id === id)
    return i < 0 ? 99 : i
  }
  const styles = [...DESIGN_STYLES].sort((a, b) => rank(a.id) - rank(b.id))
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [view, setView] = useState<View | null>(null)
  const [choosing, start] = useTransition()
  const running = state.mine?.status === 'running' || state.generic?.status === 'running'
  const genericTotal = DESIGN_STYLES.length * SAMPLE_QUALITIES.length
  const genericMissing = genericTotal - Object.keys(generic).length
  const genericCost = DESIGN_STYLES.length * SAMPLE_QUALITIES.reduce((a, q) => a + prices[q], 0)
  const cost = [...picked].reduce((a, k) => a + prices[k.slice(k.lastIndexOf('-') + 1) as ImageQuality], 0)
  const toggle = (k: string) => {
    const n = new Set(picked)
    if (n.has(k)) n.delete(k)
    else n.add(k)
    setPicked(n)
  }
  const pickMany = (ids: DesignStyleId[], qs: ImageQuality[]) => setPicked(new Set(ids.flatMap((id) => qs.map((q) => sampleKey(id, q)))))
  const withSamples = (srcs: Record<string, string>) => styles.map((s) => s.id).filter((id) => SAMPLE_QUALITIES.some((q) => srcs[sampleKey(id, q)]))
  const choose = (id: DesignStyleId, q: ImageQuality) => start(() => actions.choose(id, q))
  const isCurrent = (id: DesignStyleId, q: ImageQuality) => current?.id === id && current.q === q

  const thumb = (id: DesignStyleId, q: ImageQuality, srcs: Record<string, string>, label: string) => {
    const src = srcs[sampleKey(id, q)]
    const name = DESIGN_STYLES.find((s) => s.id === id)!.label
    if (!src) return <span className="sample-thumb empty xs muted">{label}: sin generar</span>
    return (
      <button type="button" className="sample-thumb" onClick={() => setView({ id, q, srcs, label })} title={`Ampliar ${name}, ${label.toLowerCase()}, calidad ${QUALITY_LABEL[q].toLowerCase()}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`${name}, ${label.toLowerCase()}, calidad ${QUALITY_LABEL[q].toLowerCase()}`} loading="lazy" />
        <span className="sample-thumb-label xs">
          {label} <Zoom />
        </span>
      </button>
    )
  }

  return (
    <div className="stack">
      {view && (
        <SampleViewer
          view={view}
          order={withSamples(view.srcs)}
          prices={prices}
          current={current}
          onView={setView}
          onUse={(id, q) => {
            choose(id, q)
            setView(null)
          }}
        />
      )}

      <section className="card stack-sm">
        <h2>Cómo probar estilos</h2>
        <ol className="small stack-sm" style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            Mirá los <strong>ejemplos genéricos</strong>: están hechos con {genericName} y son iguales para todas las apps. Tocá uno para ampliarlo y comparar calidades.
          </li>
          <li>
            Tildá <strong>Probar con {appName}</strong> en cada calidad de cada estilo que quieras ver con su marca y su tema.
          </li>
          <li>
            Generá las tildadas y, cuando estén, elegí la que más te guste con <strong>Usar</strong>: queda como estilo, modelo y calidad de {appName}.
          </li>
        </ol>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <ActionButton action={actions.suggest} pendingText="Leyendo el promo.yaml y eligiendo estilos…" expect={20}>
            {suggestions.length ? 'Volver a sugerir estilos' : `Sugerir estilos para ${appName}`}
          </ActionButton>
          {suggestions.length > 0 && (
            <button type="button" className="btn sm" onClick={() => pickMany(suggestions.map((s) => s.id), ['medium'])}>
              Tildar los sugeridos en calidad media
            </button>
          )}
          <button type="button" className="btn sm ghost" onClick={() => pickMany(DESIGN_STYLES.map((s) => s.id), ['low'])}>
            Tildar todos en baja ({money(DESIGN_STYLES.length * prices.low)})
          </button>
          {picked.size > 0 && (
            <button type="button" className="btn sm ghost" onClick={() => setPicked(new Set())}>
              Destildar todo
            </button>
          )}
        </div>
      </section>

      {(genericMissing > 0 || outdated || state.generic) && (
        <section className="card stack-sm">
          <strong>Ejemplos genéricos</strong>
          {outdated ? (
            <span className="small">
              Los ejemplos guardados están hechos con {genericName}. Rehacelos con {exampleName} para que todas las apps vean ejemplos reales.
            </span>
          ) : (
            genericMissing > 0 && (
              <span className="small">
                Faltan {genericMissing} de {genericTotal}. Se generan una sola vez con {exampleName ?? genericName} y quedan para todas las apps.
              </span>
            )
          )}
          {state.generic?.status === 'running' && (
            <Progress label={`Ejemplos: ${state.generic.done ?? 0} de ${state.generic.total ?? '?'}`} since={state.generic.started ?? state.generic.at} value={state.generic.total ? (state.generic.done ?? 0) / state.generic.total : undefined} steps={state.generic.total} expect={25 * (state.generic.total ?? 3)} delay={0} />
          )}
          {state.generic?.status === 'error' && <p className="notice bad small">Fallaron los ejemplos genéricos: {state.generic.error}</p>}
          {(genericMissing > 0 || outdated) && state.generic?.status !== 'running' && (
            <span>
              <ActionButton action={actions.generic} pendingText="Encargando ejemplos…" disabled={running}>
                {outdated ? 'Rehacer' : 'Generar'} los {genericTotal} ejemplos con {exampleName ?? genericName} (~{money(genericCost)})
              </ActionButton>
            </span>
          )}
        </section>
      )}

      <div className="stack">
        {styles.map((s) => {
          const r = rank(s.id)
          return (
            <section key={s.id} className={`card stack-sm samples-style${current?.id === s.id ? ' on' : ''}`}>
              <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <strong>{s.label}</strong>
                  {r < 99 && <span className="badge ok">Sugerido {r + 1}</span>}
                  {current?.id === s.id && <span className="badge info">Estilo actual</span>}
                </div>
                <span className="row" style={{ flexWrap: 'wrap', gap: 4 }} title="Lo que busca hacer sentir a los seguidores">
                  {s.feelings.map((w) => (
                    <span key={w} className="badge">
                      {w}
                    </span>
                  ))}
                </span>
              </div>
              {r < 99 && <span className="small">{suggestions[r].reason}</span>}
              <span className="small muted">{s.hint}</span>
              <div className="samples-qualities">
                {SAMPLE_QUALITIES.map((q) => {
                  const k = sampleKey(s.id, q)
                  const has = !!mine[k]
                  const usable = isExample ? !!generic[k] : has
                  return (
                    <div key={q} className={`samples-quality${picked.has(k) ? ' picked' : ''}${isCurrent(s.id, q) ? ' on' : ''}`}>
                      <div className="row between" style={{ gap: 6 }}>
                        <strong className="small">{QUALITY_LABEL[q]}</strong>
                        <span className="xs muted">{money(prices[q])} por imagen</span>
                      </div>
                      <div className="samples-pair">
                        {thumb(s.id, q, generic, `Ejemplo · ${genericName}`)}
                        {!isExample && thumb(s.id, q, mine, `Con ${appName}`)}
                      </div>
                      {!isExample && (
                        <label className="check small">
                          <input type="checkbox" name="sample" value={k} checked={picked.has(k)} onChange={() => toggle(k)} disabled={running} /> {has ? 'Volver a generar' : `Probar con ${appName}`}
                        </label>
                      )}
                      {usable && (
                        <button type="button" className={`btn sm${isCurrent(s.id, q) ? '' : ' primary'}`} disabled={choosing || isCurrent(s.id, q)} onClick={() => choose(s.id, q)}>
                          {isCurrent(s.id, q) ? 'En uso' : 'Usar este estilo y calidad'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      {!isExample && (
        <div className="samples-bar">
          {state.mine?.status === 'running' ? (
            <Progress label={`Con ${appName}: ${state.mine.done ?? 0} de ${state.mine.total ?? '?'}`} since={state.mine.started ?? state.mine.at} value={state.mine.total ? (state.mine.done ?? 0) / state.mine.total : undefined} steps={state.mine.total} expect={25 * (state.mine.total ?? 3)} delay={0} />
          ) : (
            <span className="small">{picked.size ? `${picked.size} tildada${picked.size === 1 ? '' : 's'} · ~${money(cost)}` : `Tildá las calidades de cada estilo que quieras probar con ${appName}.`}</span>
          )}
          {state.mine?.status === 'error' && <span className="small" style={{ color: 'var(--danger)' }}>Falló la última tanda: {state.mine.error}</span>}
          <ActionButton className="btn primary" action={actions.samples} pendingText="Encargando muestras…" disabled={running || !picked.size}>
            Generar {picked.size || ''} con {appName}
          </ActionButton>
        </div>
      )}
    </div>
  )
}
