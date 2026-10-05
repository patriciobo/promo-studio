'use client'
// Armado de una campaña como en Business Suite: publicaciones, objetivo, presupuesto total o diario, fechas y público.
import { useActionState, useState } from 'react'
import { createCampaign } from '@/app/actions'
import type { ResolvedSuggestion } from '@/lib/ad-suggest'
import { AudienceFields, type AudienceInit } from './AudienceFields'
import { SuggestPanel } from './SuggestPanel'
import { CTAS, OBJECTIVES } from '@/lib/meta-ads-options'

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
  const [newType, setNewType] = useState('')
  const [topic, setTopic] = useState('')
  const [cta, setCta] = useState('LEARN_MORE')
  const [name, setName] = useState(defaults.name)
  // El público se vuelve a montar con otra `key` cuando se aplica una sugerencia.
  const [audience, setAudience] = useState<{ v: number; init: AudienceInit }>({ v: 0, init: { countries: defaults.countries, ageMin: defaults.ageMin, ageMax: defaults.ageMax } })

  const apply = (s: ResolvedSuggestion) => {
    setObjective(s.objective === 'WHATSAPP' && !defaults.whatsapp ? 'TRAFFIC' : s.objective)
    setCta(s.cta)
    setBudgetType(s.budgetType)
    setBudget(String(s.budget))
    setEnd(local(new Date(new Date(start).getTime() + s.days * DAY)))
    setName(s.name || defaults.name)
    setAudience((a) => ({
      v: a.v + 1,
      init: {
        countries: s.countries.length ? s.countries : defaults.countries,
        places: s.resolvedPlaces,
        ageMin: s.ageMin,
        ageMax: s.ageMax,
        gender: s.gender === 'female' ? '2' : s.gender === 'male' ? '1' : '',
        education: s.education,
        groups: s.resolvedGroups,
        advantage: s.advantage,
        placements: s.placements,
      },
    }))
  }

  const currency = 'currency' in account ? account.currency : ''
  const days = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / DAY))
  const amount = num(budget)
  const max = budgetType === 'DAILY' ? amount * days : amount
  const perDay = budgetType === 'DAILY' ? amount : amount / days
  const min = 'minDaily' in account ? (account.minDaily / 100) * (budgetType === 'DAILY' ? 1 : days) : 0
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
                  <textarea name="newPostTopic" rows={3} maxLength={500} required value={topic} onChange={(e) => setTopic(e.target.value)} />
                </label>
                <div className="row">{modelSelect}</div>
                <p className="xs muted">La campaña queda en borrador hasta que la pieza esté lista; después la creás en Meta con un botón.</p>
              </>
            )}
          </div>
        </details>
      </section>

      <SuggestPanel slug={slug} input={{ postIds: picked, newPostTopic: newType ? topic : undefined, objective }} currency={currency} onApply={apply} />

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
              <select name="cta" value={cta} onChange={(e) => setCta(e.target.value)}>
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
        <AudienceFields key={audience.v} slug={slug} objective={objective} initial={audience.init} />
      </section>

      <section className="card stack">
        <label>
          Nombre de la campaña
          <input name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
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
