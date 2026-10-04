'use client'
// Armado de una campaña como en Business Suite: publicaciones, objetivo, presupuesto total o diario, fechas y público.
import { useActionState, useState, useTransition } from 'react'
import { createCampaign, estimateAction, interestsAction } from '@/app/actions'
import { CTAS, OBJECTIVES, type Targeting } from '@/lib/meta-ads-options'

export interface CampaignPost {
  id: string
  type: string
  hook: string | null
  thumb: string | null
  score: number | null
  suggested: boolean
  adOnly: boolean
  note: string
}

const DAY = 864e5
const pad = (n: number) => String(n).padStart(2, '0')
const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
const num = (v: string) => Number(v.replace(',', '.')) || 0

export function CampaignForm({
  slug,
  posts,
  preselected,
  defaults,
  account,
  modelSelect,
}: {
  slug: string
  posts: CampaignPost[]
  preselected: string[]
  defaults: { name: string; countries: string[]; ageMin: number; ageMax: number; link: string; whatsapp: boolean }
  account: { currency: string; minDaily: number } | { error: string }
  /** Selector de tipo y modelo de imagen (componente del servidor) para la pieza nueva. */
  modelSelect: React.ReactNode
}) {
  const [state, action] = useActionState(createCampaign.bind(null, slug), null)
  const [picked, setPicked] = useState<string[]>(preselected)
  const [objective, setObjective] = useState('TRAFFIC')
  const [budgetType, setBudgetType] = useState<'LIFETIME' | 'DAILY'>('LIFETIME')
  const [budget, setBudget] = useState('30')
  const [start, setStart] = useState(() => local(new Date(Date.now() + 3600e3)))
  const [end, setEnd] = useState(() => local(new Date(Date.now() + 3600e3 + 7 * DAY)))
  const [countries, setCountries] = useState(defaults.countries.join(', '))
  const [ageMin, setAgeMin] = useState(defaults.ageMin)
  const [ageMax, setAgeMax] = useState(defaults.ageMax)
  const [advantage, setAdvantage] = useState(true)
  const [placements, setPlacements] = useState('instagram')
  const [interests, setInterests] = useState<{ id: string; name: string }[]>([])
  const [q, setQ] = useState('')
  const [found, setFound] = useState<{ id: string; name: string; size: number }[] | string | null>(null)
  const [estimate, setEstimate] = useState<string | null>(null)
  const [newType, setNewType] = useState('')
  const [pending, start_] = useTransition()

  const currency = 'currency' in account ? account.currency : ''
  const days = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / DAY))
  const amount = num(budget)
  const max = budgetType === 'DAILY' ? amount * days : amount
  const perDay = budgetType === 'DAILY' ? amount : amount / days
  const min = 'minDaily' in account ? (account.minDaily / 100) * (budgetType === 'DAILY' ? 1 : days) : 0
  const targeting = (): Targeting => ({ countries: countries.toUpperCase().split(/[\s,]+/).filter(Boolean), ageMin, ageMax, interests, advantage })
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const ads = picked.length + (newType ? 1 : 0)

  return (
    <form action={action} className="stack" style={{ gap: 24 }}>
      {'error' in account && (
        <p className="notice bad small">
          No se pudo leer la cuenta publicitaria: {account.error}. Revisá la pestaña Instagram (cuenta publicitaria asignada al usuario de sistema).
        </p>
      )}

      <section className="card stack">
        <h2>1. Publicaciones</h2>
        <p className="small muted">Cada una es un anuncio del mismo conjunto: Meta reparte el presupuesto hacia la que mejor funciona.</p>
        {posts.length === 0 && <p className="small muted">Todavía no hay publicaciones en Instagram para promocionar. Podés crear una pieza nueva abajo.</p>}
        <div className="campaign-posts">
          {posts.map((p) => (
            <label key={p.id} className={`campaign-post${picked.includes(p.id) ? ' on' : ''}`}>
              <input type="checkbox" name="postIds" value={p.id} checked={picked.includes(p.id)} onChange={() => toggle(p.id)} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.thumb ? <img src={p.thumb} alt="" loading="lazy" /> : <span className="campaign-post-empty xs muted">sin pieza</span>}
              <span className="xs">
                <strong>{p.type}</strong> {p.hook}
              </span>
              <span className="row" style={{ gap: 4 }}>
                {p.adOnly && <span className="badge info">Sólo anuncio</span>}
                {p.suggested && <span className="badge ok">Sugerida</span>}
                {p.score != null && <span className="badge">Potencial {p.score.toFixed(2)}</span>}
              </span>
              {p.note && <span className="xs muted">{p.note}</span>}
            </label>
          ))}
        </div>
        <details className="image-picker" open={newType !== ''}>
          <summary>
            Crear una pieza nueva sólo para esta campaña <span className="hint">no se publica en el feed</span>
          </summary>
          <div className="stack" style={{ marginTop: 12 }}>
            <label>
              Formato
              <select name="newPostType" value={newType} onChange={(e) => setNewType(e.target.value)}>
                <option value="">Ninguna</option>
                <option value="IMAGE">Imagen</option>
                <option value="CAROUSEL">Carrusel</option>
                <option value="REEL">Reel</option>
              </select>
            </label>
            {newType && (
              <>
                <label>
                  De qué trata <span className="hint">la oferta o idea del anuncio; se genera como un post a pedido y la revisás en Revisión</span>
                  <textarea name="newPostTopic" rows={3} maxLength={500} required />
                </label>
                <div className="row">{modelSelect}</div>
                <p className="xs muted">La campaña queda en borrador hasta que la pieza esté lista; después la creás en Meta con un botón.</p>
              </>
            )}
          </div>
        </details>
      </section>

      <section className="card stack">
        <h2>2. Objetivo</h2>
        <div className="model-grid">
          {OBJECTIVES.filter((o) => o.id !== 'WHATSAPP' || defaults.whatsapp).map((o) => (
            <label key={o.id} className="model-card">
              <input type="radio" name="objective" value={o.id} checked={objective === o.id} onChange={() => setObjective(o.id)} />
              <strong>{o.label}</strong>
              <span className="xs muted">{o.hint}</span>
            </label>
          ))}
        </div>
        {objective !== 'WHATSAPP' && (
          <div className="form-grid">
            <label>
              Botón
              <select name="cta" defaultValue="LEARN_MORE">
                {CTAS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Link <span className="hint">se le agregan UTM para medir</span>
              <input name="link" type="url" defaultValue={defaults.link} />
            </label>
          </div>
        )}
      </section>

      <section className="card stack">
        <h2>3. Presupuesto y duración</h2>
        <div className="row">
          <label className="check">
            <input type="radio" name="budgetType" value="LIFETIME" checked={budgetType === 'LIFETIME'} onChange={() => setBudgetType('LIFETIME')} /> Total de la campaña
          </label>
          <label className="check">
            <input type="radio" name="budgetType" value="DAILY" checked={budgetType === 'DAILY'} onChange={() => setBudgetType('DAILY')} /> Por día
          </label>
        </div>
        <div className="form-grid">
          <label>
            Monto {budgetType === 'DAILY' ? 'por día' : 'total'} {currency && <span className="hint">{currency}</span>}
            <input name="budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} required />
          </label>
          <label>
            Inicio
            <input name="startAt" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
          </label>
          <label>
            Fin
            <input name="endAt" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </label>
          <label>
            Tope de gasto <span className="hint">opcional, corta la campaña al llegar</span>
            <input name="spendCap" inputMode="decimal" placeholder="—" />
          </label>
        </div>
        <p className={`notice small ${min && amount < min ? 'warn' : ''}`}>
          Gasto máximo: <strong>{max.toFixed(2)} {currency}</strong> en {days} {days === 1 ? 'día' : 'días'} (~{perDay.toFixed(2)} por día).
          {min > 0 && amount < min && ` El mínimo de Meta para esta cuenta es ${min.toFixed(2)} ${currency}${budgetType === 'DAILY' ? ' por día' : ' en total'}.`}
        </p>
      </section>

      <section className="card stack">
        <h2>4. Público</h2>
        <div className="form-grid">
          <label>
            Países <span className="hint">códigos de 2 letras</span>
            <input name="countries" value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="AR, UY" />
          </label>
          <label>
            Edad mínima
            <input name="ageMin" type="number" min={18} max={65} value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value))} />
          </label>
          <label>
            Edad máxima
            <input name="ageMax" type="number" min={18} max={65} value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))} />
          </label>
        </div>
        <input type="hidden" name="interests" value={JSON.stringify(interests)} />
        <div className="stack-sm">
          <span className="small">Intereses</span>
          {interests.length > 0 && (
            <div className="row" style={{ gap: 6 }}>
              {interests.map((i) => (
                <button key={i.id} type="button" className="badge info" onClick={() => setInterests(interests.filter((x) => x.id !== i.id))} title="Quitar">
                  {i.name} ×
                </button>
              ))}
            </div>
          )}
          <div className="row">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar, p. ej. tenis" style={{ maxWidth: 260 }} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), (e.currentTarget.nextElementSibling as HTMLButtonElement)?.click())} />
            <button
              type="button"
              className="btn sm"
              disabled={pending || q.trim().length < 2}
              onClick={() =>
                start_(async () => {
                  const r = await interestsAction(slug, q)
                  setFound(r.ok ? r.items : r.error)
                })
              }
            >
              Buscar
            </button>
          </div>
          {typeof found === 'string' && <p className="xs" style={{ color: 'var(--danger)' }}>{found}</p>}
          {Array.isArray(found) && (
            <div className="row" style={{ gap: 6 }}>
              {found.length === 0 && <span className="xs muted">Sin resultados.</span>}
              {found
                .filter((i) => !interests.some((x) => x.id === i.id))
                .map((i) => (
                  <button key={i.id} type="button" className="badge" onClick={() => setInterests([...interests, { id: i.id, name: i.name }])}>
                    + {i.name}
                    {i.size ? ` · ${(i.size / 1e6).toFixed(1)} M` : ''}
                  </button>
                ))}
            </div>
          )}
        </div>
        <label className="check">
          <input type="checkbox" name="advantage" checked={advantage} onChange={(e) => setAdvantage(e.target.checked)} /> Público Advantage+ <span className="hint">Meta puede ampliar más allá de los intereses si rinde mejor (recomendado)</span>
        </label>
        <div className="row">
          <label className="check">
            <input type="radio" name="placements" value="instagram" checked={placements === 'instagram'} onChange={() => setPlacements('instagram')} /> Sólo Instagram
          </label>
          <label className="check">
            <input type="radio" name="placements" value="instagram_facebook" checked={placements === 'instagram_facebook'} onChange={() => setPlacements('instagram_facebook')} /> Instagram y Facebook
          </label>
        </div>
        <div className="row">
          <button
            type="button"
            className="btn sm"
            disabled={pending}
            onClick={() =>
              start_(async () => {
                const r = await estimateAction(slug, targeting(), placements, objective)
                setEstimate(r.ok ? (r.upper ? `Público estimado: ${r.lower.toLocaleString('es-AR')} a ${r.upper.toLocaleString('es-AR')} personas` : 'Meta no devolvió una estimación (simulación o público muy chico).') : r.error)
              })
            }
          >
            Estimar público
          </button>
          {estimate && <span className="small muted">{estimate}</span>}
        </div>
      </section>

      <section className="card stack">
        <label>
          Nombre de la campaña
          <input name="name" defaultValue={defaults.name} maxLength={120} />
        </label>
        {state?.error && <p className="notice bad small">{state.error}</p>}
        <div className="row">
          <button className="btn primary" disabled={!ads}>
            Crear campaña en pausa ({ads} {ads === 1 ? 'anuncio' : 'anuncios'})
          </button>
          <span className="small muted">Se crea en Meta en pausa: no gasta nada hasta que toques Activar.</span>
        </div>
      </section>
    </form>
  )
}
