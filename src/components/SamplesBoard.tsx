'use client'
// Pestaña Muestras: los ejemplos genéricos (hechos con la app de ejemplo) y, al lado, los de esta app.
// Se tilda cada calidad de cada estilo que se quiere probar con la marca de la app, en ilustración o foto realista, y se generan juntas.
import { useState, useTransition } from 'react'
import { DESIGN_STYLES, parseSampleKey, SAMPLE_QUALITIES, sampleKey, samplesOfKind, type DesignStyleId, type StyleSuggestion } from '@/lib/styles'
import { IMAGE_KINDS, type ImageKind, type ImageQuality } from '@/lib/models'
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
  current: { id: DesignStyleId; q: ImageQuality; kind: ImageKind } | null
  /** Tipo de imagen que se ve al entrar (el de Ajustes, o el de las últimas genéricas pedidas). */
  initialKind: ImageKind
  state: { mine: SamplesState | null; generic: SamplesState | null }
  actions: {
    samples: (f: FormData) => Promise<void>
    generic: (f: FormData) => Promise<void>
    suggest: () => Promise<void>
    choose: (style: DesignStyleId, q: ImageQuality, kind: ImageKind) => Promise<void>
  }
}

const Zoom = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6" />
  </svg>
)

const KIND_TEXT: Record<ImageKind, string> = { illustration: 'ilustración', photo: 'foto realista' }

export function SamplesBoard({ appName, genericName, exampleName, outdated, isExample, generic: allGeneric, mine: allMine, suggestions, prices, current, initialKind, state, actions }: SamplesBoardProps) {
  const [kind, setKind] = useState<ImageKind>(initialKind)
  const generic = samplesOfKind(allGeneric, kind)
  const mine = samplesOfKind(allMine, kind)
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
  const parsed = [...picked].map(parseSampleKey).filter((x) => !!x)
  const cost = parsed.reduce((a, p) => a + prices[p.quality], 0)
  const photos = parsed.filter((p) => p.kind === 'photo').length
  const pickedText = photos && photos < parsed.length ? ` (${parsed.length - photos} en ilustración, ${photos} en foto)` : photos ? ' en foto realista' : ' en ilustración'
  const toggle = (k: string) => {
    const n = new Set(picked)
    if (n.has(k)) n.delete(k)
    else n.add(k)
    setPicked(n)
  }
  const pickMany = (ids: DesignStyleId[], qs: ImageQuality[]) => setPicked(new Set([...[...picked].filter((k) => parseSampleKey(k)?.kind !== kind), ...ids.flatMap((id) => qs.map((q) => sampleKey(id, q, kind)))]))
  const withSamples = (srcs: Record<string, string>) => styles.map((s) => s.id).filter((id) => SAMPLE_QUALITIES.some((q) => srcs[sampleKey(id, q)]))
  const choose = (id: DesignStyleId, q: ImageQuality) => start(() => actions.choose(id, q, kind))
  const isCurrent = (id: DesignStyleId, q: ImageQuality) => current?.id === id && current.q === q && current.kind === kind

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
      <input type="hidden" name="genericKind" value={kind} />
      {/* Lo tildado en el otro tipo de imagen también se manda. */}
      {[...picked]
        .filter((k) => parseSampleKey(k)?.kind !== kind)
        .map((k) => (
          <input key={k} type="hidden" name="sample" value={k} />
        ))}
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
            Elegí el <strong>tipo de imagen</strong> y tildá <strong>Probar con {appName}</strong> en cada calidad de cada estilo que quieras ver con su marca y su tema. Podés tildar en los dos tipos y generarlas juntas.
          </li>
          <li>
            Generá las tildadas y, cuando estén, elegí la que más te guste con <strong>Usar</strong>: queda como estilo, modelo, calidad y tipo de imagen de {appName}.
          </li>
        </ol>
        <div className="segmented" role="radiogroup" aria-label="Tipo de imagen">
          {IMAGE_KINDS.map((k) => (
            <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className={kind === k.id ? 'on' : ''} onClick={() => setKind(k.id)} title={k.hint}>
              {k.label}
              <span className="xs muted"> · {Object.keys(samplesOfKind(allGeneric, k.id)).length}/{genericTotal} ejemplos</span>
            </button>
          ))}
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <ActionButton action={actions.suggest} pendingText="Leyendo el promo.yaml y eligiendo estilos…" expect={20}>
            {suggestions.length ? 'Volver a sugerir estilos' : `Sugerir estilos para ${appName}`}
          </ActionButton>
          {suggestions.length > 0 && (
            <button type="button" className="btn sm" onClick={() => pickMany(suggestions.map((s) => s.id), ['medium'])}>
              Tildar los sugeridos en calidad media ({KIND_TEXT[kind]})
            </button>
          )}
          <button type="button" className="btn sm ghost" onClick={() => pickMany(DESIGN_STYLES.map((s) => s.id), ['low'])}>
            Tildar todos en baja, {KIND_TEXT[kind]} ({money(DESIGN_STYLES.length * prices.low)})
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
          <strong>Ejemplos genéricos en {KIND_TEXT[kind]}</strong>
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
                {outdated ? 'Rehacer' : 'Generar'} los {genericTotal} ejemplos en {KIND_TEXT[kind]} con {exampleName ?? genericName} (~{money(genericCost)})
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
                  {s.sampleKind && s.sampleKind !== kind && <span className="badge">Luce más en {KIND_TEXT[s.sampleKind]}</span>}
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
                  const k = sampleKey(s.id, q, kind)
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
            <span className="small">{picked.size ? `${picked.size} tildada${picked.size === 1 ? '' : 's'}${pickedText} · ~${money(cost)}` : `Tildá las calidades de cada estilo que quieras probar con ${appName}.`}</span>
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
