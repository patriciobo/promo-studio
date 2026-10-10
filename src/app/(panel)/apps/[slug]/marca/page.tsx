import { chooseBrandOption, generateBrandRound, rereadBrandRepo, resetBrand, saveBrandAction, startBrand, updateBrandProject, vectorizeBrandOption } from '@/app/actions'
import { BrandBriefFields } from '@/components/BrandBriefFields'
import { BrandSaveForm } from '@/components/BrandSaveForm'
import { AutoRefresh, ConfirmButton, Progress, SubmitButton } from '@/components/client'
import { BriefSchema, ELEMENTS, FoundSchema, missingInBrief, type ElementId } from '@/lib/brand/brief'
import { concept } from '@/lib/brand/concepts'
import { encodeLogoModel, LOGO_MODELS, logoPrice, OPTIONS_PER_ROUND, OptionSchema, roundCost, TEXT_ESTIMATE, VECTOR_PRICE } from '@/lib/brand/generate'
import type { YamlField } from '@/lib/brand/plan'
import { availableFields } from '@/lib/brand/save'
import { db } from '@/lib/db'
import { isLocalRepo } from '@/lib/github'
import { mediaSrc } from '@/lib/media'
import { fmtDate, usdSmall } from '@/lib/view'

/** Campos que no se pisan salvo que se marquen: el nombre y el tono suelen estar más trabajados en el yaml. */
const OPT_IN: YamlField[] = ['name', 'tone']

const AVISOS: Record<string, string> = {
  repo: 'Leí el repositorio: abajo está lo que encontré. Marcá qué generar y completá el brief si falta algo.',
  cero: 'Identidad desde cero: se generan todos los elementos, sin tomar nada del repo.',
  guardado: 'Brief guardado.',
  generando: 'Generando las 3 alternativas: el worker las arma de a una y esta página se actualiza sola.',
  escrito: 'Listo: los archivos y el promo.yaml quedaron escritos en el repo local y la app se volvió a sincronizar.',
  'guardado-repo': 'Listo: guardado en el repo.',
}

export default async function BrandTab({ params, searchParams }: PageProps<'/apps/[slug]/marca'>) {
  const { slug } = await params
  const { aviso, guardado, error, sinyaml, archivos } = await searchParams
  const app = await db.app.findUniqueOrThrow({ where: { slug }, include: { brand: { include: { options: { orderBy: [{ round: 'desc' }, { index: 'asc' }] } } } } })
  const p = app.brand
  const local = isLocalRepo(app.repo)

  if (!p)
    return (
      <section className="card stack" style={{ maxWidth: 820 }}>
        <div className="stack-sm">
          <h2>Identidad de marca</h2>
          <p className="small muted">
            Generá 3 alternativas de identidad (logo, ícono, paleta, tipografías, tono de voz, frase y gráfico de apoyo), elegí una y guardala en el repo: sólo lo que tiene uso (el logo que usa el promo.yaml, los íconos que ya tiene el sitio y los campos del promo.yaml que elijas).
          </p>
        </div>
        {typeof error === 'string' && <p className="notice bad small">{error}</p>}
        <div className="row">
          <form action={startBrand.bind(null, slug)}>
            <input type="hidden" name="mode" value="repo" />
            <SubmitButton pendingText="Leyendo el repo…" expect={15}>
              Partir de lo que hay en el repo
            </SubmitButton>
          </form>
          <form action={startBrand.bind(null, slug)}>
            <input type="hidden" name="mode" value="cero" />
            <SubmitButton className="btn" pendingText="Creando…">
              Identidad nueva desde cero
            </SubmitButton>
          </form>
        </div>
        <p className="xs muted">Desde el repo se toman colores, tipografías, logo y frase del promo.yaml o de los estilos, y se genera sólo lo que falta.</p>
      </section>
    )

  const brief = BriefSchema.parse(p.brief)
  const found = p.found ? FoundSchema.parse(p.found) : null
  const elements = p.elements as ElementId[]
  const running = p.status === 'running'
  const progress = (p.progress as { started?: string; done?: number; total?: number; vector?: string } | null) ?? null
  const missing = missingInBrief(brief)
  const rounds = [...new Set(p.options.map((o) => o.round))]
  const spent = p.options.reduce((a, o) => a + o.costUsd, 0)
  // /media se cachea como inmutable: la versión cambia cuando se actualiza el proyecto (p. ej. al vectorizar).
  const v = p.updatedAt.getTime()
  const src = (rel: string) => `${mediaSrc(rel)}?v=${v}`
  const saved = p.options.find((o) => o.id === p.savedOptionId)

  return (
    <div className="stack" style={{ gap: 24 }}>
      {running && <AutoRefresh every={4000} />}
      {typeof aviso === 'string' && AVISOS[aviso] && !(aviso === 'generando' && !running) && <p className="notice ok">{AVISOS[aviso]}</p>}
      {typeof guardado === 'string' && (
        <p className="notice ok">
          Guardado en el repo:{' '}
          <a href={guardado} target="_blank" rel="noreferrer">
            {guardado.includes('/pull/') ? 'ver el pull request' : 'ver el commit'}
          </a>
          {guardado.includes('/pull/') ? '. El promo.yaml cambia cuando lo aprobás; después sincronizá la app.' : '. La app ya se volvió a sincronizar.'}
        </p>
      )}
      {typeof archivos === 'string' && archivos && (
        <div className="notice small">
          Archivos escritos (nada más cambió):
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {archivos.split(',').map((f) => (
              <li key={f}>
                <code>{f}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {sinyaml === '1' && <p className="notice warn small">El repo no tiene promo.yaml: se guardaron los archivos de la marca pero no se actualizó la configuración. Crealo en la pestaña promo.yaml.</p>}
      {typeof error === 'string' && <p className="notice bad">{error}</p>}
      {p.status === 'error' && p.error && <p className="notice bad">{p.error}</p>}

      <div className="row between">
        <p className="small muted">
          {rounds.length} {rounds.length === 1 ? 'ronda' : 'rondas'} · gastado {usdSmall(spent)}
          {saved && p.savedAt && (
            <>
              {' '}
              · guardada en el repo: alternativa {saved.index + 1} de la ronda {saved.round} ({fmtDate(p.savedAt, app.timezone)})
              {p.savedUrl && (
                <>
                  {' '}
                  ·{' '}
                  <a href={p.savedUrl} target="_blank" rel="noreferrer">
                    {p.savedUrl.includes('/pull/') ? 'PR' : 'commit'}
                  </a>
                </>
              )}
            </>
          )}
        </p>
      </div>

      {found ? (
        <section className="card stack">
          <div className="row between">
            <h2>Lo que ya tiene el repositorio</h2>
            <form action={rereadBrandRepo.bind(null, slug)}>
              <SubmitButton className="btn sm" pendingText="Leyendo…">
                Volver a leer
              </SubmitButton>
            </form>
          </div>
          <div className="found-grid">
            <div className="stack-sm">
              <span className="small muted">Logo</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {found.logoPath ? <img src={src(found.logoPath)} alt="Logo encontrado" className="found-logo" /> : <span className="small">No encontré logo</span>}
            </div>
            <div className="stack-sm">
              <span className="small muted">Colores</span>
              {found.colors.length ? (
                <div className="swatches">
                  {found.colors.map((c) => (
                    <span key={c} className="swatch" style={{ background: c }} title={c}>
                      <span className="xs mono">{c}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <span className="small">No encontré colores</span>
              )}
            </div>
            <div className="stack-sm">
              <span className="small muted">Tipografías</span>
              <span className="small">{found.fonts.join(', ') || 'No encontré tipografías'}</span>
              <span className="small muted">Frase</span>
              <span className="small">{found.tagline || '—'}</span>
            </div>
          </div>
          {found.sources.length > 0 && <p className="xs muted">Fuentes: {found.sources.join(' · ')}</p>}
        </section>
      ) : (
        <form action={rereadBrandRepo.bind(null, slug)} className="row">
          <span className="small muted">Identidad desde cero: no se toma nada del repo.</span>
          <SubmitButton className="btn sm ghost" pendingText="Leyendo…">
            Leer el repo igual
          </SubmitButton>
        </form>
      )}

      <section className="card stack">
        <div className="stack-sm">
          <h2>Generar {OPTIONS_PER_ROUND} alternativas</h2>
          <p className="small muted">
            Cada alternativa sale de un concepto distinto del catálogo (suizo, nórdico, japonés, hecho a mano…), elegido según el brief. Cada vez que generás se suma una ronda nueva y las anteriores quedan guardadas.
          </p>
        </div>
        {missing.length > 0 && <p className="notice warn small">Para que no salgan genéricas, completá en el brief: {missing.join(', ')}.</p>}
        <form action={generateBrandRound.bind(null, slug)} className="stack">
          <div className="stack-sm">
            <span className="small muted">Qué generar{found ? ' (marcado: lo que falta en el repo; lo demás se respeta)' : ''}</span>
            <div className="chips">
              {ELEMENTS.map((e) => (
                <label key={e.id} className="chip" title={e.hint}>
                  <input type="checkbox" name="elements" value={e.id} defaultChecked={elements.includes(e.id)} /> {e.label}
                </label>
              ))}
            </div>
          </div>
          <label>
            Pedido para esta ronda <span className="hint">opcional: “más minimal”, “probá con verde”, “un logo con símbolo”</span>
            <input name="notes" maxLength={500} />
          </label>
          <div className="row">
            <select name="logoModel" className="model-select" aria-label="Modelo para el logo" defaultValue={encodeLogoModel(LOGO_MODELS[0])}>
              {LOGO_MODELS.map((m) => (
                <option key={encodeLogoModel(m)} value={encodeLogoModel(m)}>
                  Logo: {m.label} · {usdSmall(logoPrice(m))}/img{m.recommended ? ' ★' : ''} · {m.note}
                </option>
              ))}
            </select>
            {running ? (
              <span className="with-progress">
                <button className="btn primary" disabled>
                  {progress?.vector ? 'Vectorizando…' : 'Generando…'}
                </button>
                {progress?.vector ? <Progress since={progress.started} expect={40} delay={0} label="Vectorizando el logo" /> : <Progress since={progress?.started} value={progress?.total ? (progress.done ?? 0) / progress.total : 0} steps={progress?.total} expect={elements.includes('logo') ? 120 : 40} delay={0} label="Generando" />}
              </span>
            ) : (
              <SubmitButton pendingText="Encolando…">{rounds.length ? 'Generar otra ronda' : 'Generar'}</SubmitButton>
            )}
          </div>
          <p className="xs muted">
            Costo aproximado por ronda: texto {usdSmall(TEXT_ESTIMATE)} + {OPTIONS_PER_ROUND} logos (si está marcado). Con el modelo recomendado: {usdSmall(roundCost(['logo'], LOGO_MODELS[0]))}. Vectorizar un logo a SVG: {usdSmall(VECTOR_PRICE)}. Se descuenta del tope mensual de la app.
          </p>
        </form>
      </section>

      {rounds.map((round) => (
        <section key={round} className="stack">
          <h2>Ronda {round}</h2>
          <div className="brand-options">
            {p.options
              .filter((o) => o.round === round)
              .map((o) => {
                const d = OptionSchema.parse(o.data)
                const c = concept(o.conceptId)
                const chosen = p.chosenId === o.id
                const isSaved = p.savedOptionId === o.id
                const vectorizing = running && progress?.vector === o.id
                const fields = availableFields(d, o, elements)
                const icons = (o.iconFiles as Record<string, string> | null) ?? null
                return (
                  <article key={o.id} className={`card stack-sm brand-option${chosen ? ' chosen' : ''}`}>
                    {o.boardPath && (
                      <a href={src(o.boardPath)} target="_blank" rel="noreferrer" title="Ver la lámina completa">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src(o.boardPath)} alt={`Lámina de la alternativa ${o.index + 1}`} className="brand-board" />
                      </a>
                    )}
                    <div className="row between">
                      <h3>
                        {o.index + 1}. {d.title}
                      </h3>
                      <span className="row" style={{ gap: 6 }}>
                        {chosen && <span className="badge ok">Elegida</span>}
                        {isSaved && <span className="badge info">En el repo</span>}
                      </span>
                    </div>
                    <p className="xs muted">
                      {c?.name} · {c?.origin}
                    </p>
                    <p className="small">{d.rationale}</p>
                    {d.names.length > 0 && (
                      <p className="small">
                        <strong>Nombres:</strong> {d.names.join(' · ')}
                      </p>
                    )}
                    {d.tagline && (
                      <p className="small">
                        <strong>Frase:</strong> {d.tagline}
                      </p>
                    )}
                    <div className="swatches">
                      {d.palette.map((s) => (
                        <span key={s.hex + s.role} className="swatch sm" style={{ background: s.hex }} title={`${s.name || s.role} · ${s.hex}`} />
                      ))}
                    </div>
                    <p className="xs muted">
                      {d.fonts?.display} / {d.fonts?.text}
                      {d.logo ? ` · logo: ${d.logo.idea}` : ''}
                    </p>
                    {d.voice && (
                      <details>
                        <summary className="small">Tono de voz</summary>
                        <div className="stack-sm small" style={{ marginTop: 8 }}>
                          <p>{d.voice.tone}</p>
                          {d.voice.do.length > 0 && <p>Sí: {d.voice.do.join(' · ')}</p>}
                          {d.voice.dont.length > 0 && <p>No: {d.voice.dont.join(' · ')}</p>}
                          <p>
                            <em>“{d.voice.sample}”</em>
                          </p>
                        </div>
                      </details>
                    )}
                    {d.notes && <p className="xs muted">Pedido de la ronda: {d.notes}</p>}
                    <div className="row">
                      <form action={chooseBrandOption.bind(null, slug, chosen ? null : o.id)}>
                        <SubmitButton className={`btn sm${chosen ? '' : ' primary'}`} pendingText="…">
                          {chosen ? 'Quitar elección' : 'Elegir'}
                        </SubmitButton>
                      </form>
                      {o.logoPath && (
                        <a className="btn sm" href={src(o.vectorPath ?? o.logoPath)} download>
                          Logo {o.vectorPath ? 'SVG' : o.logoPath.split('.').pop()?.toUpperCase()}
                        </a>
                      )}
                      {icons && (
                        <details className="downloads">
                          <summary className="btn sm">Íconos</summary>
                          <div className="stack-sm xs" style={{ marginTop: 6 }}>
                            {o.iconVector && (
                              <a href={src(o.iconVector)} download="favicon.svg">
                                favicon.svg
                              </a>
                            )}
                            {icons.ico && (
                              <a href={src(icons.ico)} download="favicon.ico">
                                favicon.ico (16, 32 y 48 px)
                              </a>
                            )}
                            {Object.entries(icons)
                              .filter(([k]) => k !== 'ico')
                              .map(([k, rel]) => (
                                <a key={k} href={src(rel)} download={`icon-${k}.png`}>
                                  icon-{k}.png
                                </a>
                              ))}
                            {!o.iconVector && <span className="muted">favicon.svg: vectorizá primero</span>}
                          </div>
                        </details>
                      )}
                      {o.boardPath && (
                        <a className="btn sm" href={src(o.boardPath)} download>
                          Lámina
                        </a>
                      )}
                      {((o.logoPath && !o.vectorPath && !o.logoPath.endsWith('.svg')) || (o.iconPath && !o.iconVector)) && (
                        <form action={vectorizeBrandOption.bind(null, slug, o.id)}>
                          <SubmitButton className="btn sm ghost" pendingText="Encolando…">
                            {vectorizing ? 'Vectorizando…' : `Vectorizar logo e ícono (${usdSmall(VECTOR_PRICE)})`}
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                    {chosen && (
                      <details className="save-repo" open={!isSaved}>
                        <summary className="small">
                          <strong>Guardar en el repo</strong>
                        </summary>
                        <BrandSaveForm
                          action={saveBrandAction.bind(null, slug, o.id)}
                          fields={fields}
                          optIn={OPT_IN}
                          fonts={d.fonts}
                          found={found}
                          option={{ logoPath: o.logoPath, vectorPath: o.vectorPath, iconVector: o.iconVector, iconFiles: o.iconFiles }}
                          manifestPath={app.manifestPath}
                          local={local ? app.repo.slice(5) : null}
                          branch={app.branch}
                          isSaved={isSaved}
                        />
                      </details>
                    )}
                    <p className="xs muted">Costo: {usdSmall(o.costUsd)}</p>
                  </article>
                )
              })}
          </div>
        </section>
      ))}

      <section className="card">
        <details open={!rounds.length && missing.length > 0}>
          <summary>
            <strong>Brief</strong> <span className="small muted">{missing.length ? `faltan: ${missing.join(', ')}` : 'completo'}</span>
          </summary>
          <form action={updateBrandProject.bind(null, slug)} className="stack" style={{ marginTop: 16 }}>
            <BrandBriefFields brief={brief} textModel={p.textModel} referenceSrc={p.referencePath ? src(p.referencePath) : null} />
            <div>
              <SubmitButton pendingText="Guardando…">Guardar brief</SubmitButton>
            </div>
          </form>
        </details>
      </section>

      <div>
        <ConfirmButton
          action={async () => {
            'use server'
            await resetBrand(slug)
          }}
          label="Empezar de nuevo"
          confirm="Se borran el brief, las rondas y los archivos generados (lo guardado en el repo queda)."
          className="btn sm ghost"
        />
      </div>
    </div>
  )
}
