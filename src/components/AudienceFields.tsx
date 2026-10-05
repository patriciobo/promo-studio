'use client'
// Público de la campaña: ubicación, edad, género, nivel educativo y segmentación detallada en grupos (O dentro, Y entre grupos).
import { useState, useTransition } from 'react'
import { estimateAction, placesAction, targetingSearchAction } from '@/app/actions'
import { DETAIL_TYPES, EDUCATION, type Detail, type DetailType, type GeoPlace, type Targeting } from '@/lib/meta-ads-options'

type Option = { id: string; name: string; size: number; path: string }
type Place = { key: string; name: string; type: 'city' | 'region'; detail: string }

const typeLabel = (t: DetailType) => DETAIL_TYPES.find((d) => d.id === t)?.label ?? t
const people = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} mil` : String(n))

function DetailGroup({ slug, index, group, onChange, onRemove }: { slug: string; index: number; group: Detail[]; onChange: (g: Detail[]) => void; onRemove?: () => void }) {
  const [type, setType] = useState<DetailType>('interests')
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Option[] | string | null>(null)
  const [pending, start] = useTransition()
  const mode = DETAIL_TYPES.find((d) => d.id === type)!.mode
  const search = () =>
    start(async () => {
      const r = await targetingSearchAction(slug, type, q)
      setFound(r.ok ? r.items : r.error)
    })
  return (
    <div className="audience-group stack-sm">
      <div className="row between">
        <span className="small">
          <strong>{index === 0 ? 'Incluir personas que coincidan con al menos una de estas opciones' : 'Y que además coincidan con al menos una de estas'}</strong>
        </span>
        {onRemove && (
          <button type="button" className="btn sm ghost" onClick={onRemove}>
            Quitar grupo
          </button>
        )}
      </div>
      {group.length > 0 && (
        <div className="row" style={{ gap: 6 }}>
          {group.map((d) => (
            <button key={`${d.type}-${d.id}`} type="button" className="badge info" onClick={() => onChange(group.filter((x) => !(x.id === d.id && x.type === d.type)))} title="Quitar">
              <span className="muted">{typeLabel(d.type)}:</span>&nbsp;{d.name} ×
            </button>
          ))}
        </div>
      )}
      <div className="row">
        <select value={type} onChange={(e) => (setType(e.target.value as DetailType), setFound(null))} aria-label="Tipo" className="model-select">
          {DETAIL_TYPES.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={mode === 'browse' ? 'Filtrar (opcional)' : 'Buscar, p. ej. gerente, tenis, UBA'}
          style={{ maxWidth: 260 }}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), search())}
        />
        <button type="button" className="btn sm" disabled={pending || (mode === 'search' && q.trim().length < 2)} onClick={search}>
          {mode === 'browse' ? 'Ver opciones' : 'Buscar'}
        </button>
      </div>
      {typeof found === 'string' && <p className="xs" style={{ color: 'var(--danger)' }}>{found}</p>}
      {Array.isArray(found) && (
        <div className="row" style={{ gap: 6 }}>
          {found.length === 0 && <span className="xs muted">Sin resultados para {typeLabel(type).toLowerCase()}.</span>}
          {found
            .filter((o) => !group.some((d) => d.id === o.id && d.type === type))
            .map((o) => (
              <button key={o.id} type="button" className="badge" title={o.path || undefined} onClick={() => onChange([...group, { type, id: o.id, name: o.name }])}>
                + {o.name}
                {o.size ? ` · ${people(o.size)}` : ''}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

/** Valores iniciales del público (los del promo.yaml o los de una sugerencia aplicada). */
export interface AudienceInit {
  countries: string[]
  ageMin: number
  ageMax: number
  places?: GeoPlace[]
  gender?: '' | '1' | '2'
  education?: number[]
  groups?: Detail[][]
  advantage?: boolean
  placements?: string
}

export function AudienceFields({ slug, objective, initial }: { slug: string; objective: string; initial: AudienceInit }) {
  const defaults = initial
  const [countries, setCountries] = useState(defaults.countries.join(', '))
  const [places, setPlaces] = useState<GeoPlace[]>(defaults.places ?? [])
  const [placeQ, setPlaceQ] = useState('')
  const [placeFound, setPlaceFound] = useState<Place[] | string | null>(null)
  const [ageMin, setAgeMin] = useState(defaults.ageMin)
  const [ageMax, setAgeMax] = useState(defaults.ageMax)
  const [gender, setGender] = useState<string>(defaults.gender ?? '')
  const [education, setEducation] = useState<number[]>(defaults.education ?? [])
  const [groups, setGroups] = useState<Detail[][]>(defaults.groups?.length ? defaults.groups : [[]])
  const [advantage, setAdvantage] = useState(defaults.advantage ?? true)
  const [placements, setPlacements] = useState(defaults.placements ?? 'instagram')
  const [estimate, setEstimate] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const targeting = (): Targeting => ({
    countries: countries.toUpperCase().split(/[\s,]+/).filter(Boolean),
    places,
    ageMin,
    ageMax: advantage ? 65 : ageMax,
    genders: gender ? [Number(gender)] : [],
    education,
    groups,
    interests: [],
    advantage,
  })
  const searchPlaces = () =>
    start(async () => {
      const r = await placesAction(slug, placeQ)
      setPlaceFound(r.ok ? r.items : r.error)
    })

  return (
    <>
      <input type="hidden" name="groups" value={JSON.stringify(groups)} />
      <input type="hidden" name="places" value={JSON.stringify(places)} />
      {advantage && <input type="hidden" name="ageMax" value={65} />}

      <div className="stack-sm">
        <h3 className="small">Ubicación</h3>
        <label>
          Países <span className="hint">códigos de 2 letras{places.length ? '; se ignoran porque elegiste ciudades o provincias' : ''}</span>
          <input name="countries" value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="AR, UY" disabled={places.length > 0} />
        </label>
        {places.length > 0 && (
          <div className="stack-sm">
            {places.map((p) => (
              <div key={p.key} className="row">
                <span className="badge info">
                  {p.type === 'city' ? 'Ciudad' : 'Provincia'}: {p.name}
                </span>
                {p.type === 'city' && (
                  <label className="row xs" style={{ gap: 6 }}>
                    + radio
                    <select value={p.radius ?? 17} onChange={(e) => setPlaces(places.map((x) => (x.key === p.key ? { ...x, radius: Number(e.target.value) } : x)))}>
                      {[0, 10, 17, 25, 40, 80].map((r) => (
                        <option key={r} value={r}>
                          {r ? `${r} km` : 'sólo la ciudad'}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button type="button" className="btn sm ghost" onClick={() => setPlaces(places.filter((x) => x.key !== p.key))}>
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="row">
          <input value={placeQ} onChange={(e) => setPlaceQ(e.target.value)} placeholder="Ciudad o provincia, p. ej. Rosario" style={{ maxWidth: 260 }} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchPlaces())} />
          <button type="button" className="btn sm" disabled={pending || placeQ.trim().length < 2} onClick={searchPlaces}>
            Buscar lugar
          </button>
        </div>
        {typeof placeFound === 'string' && <p className="xs" style={{ color: 'var(--danger)' }}>{placeFound}</p>}
        {Array.isArray(placeFound) && (
          <div className="row" style={{ gap: 6 }}>
            {placeFound.length === 0 && <span className="xs muted">Sin resultados.</span>}
            {placeFound
              .filter((p) => !places.some((x) => x.key === p.key))
              .map((p) => (
                <button key={p.key} type="button" className="badge" onClick={() => setPlaces([...places, { key: p.key, name: p.name, type: p.type, radius: p.type === 'city' ? 17 : undefined }])}>
                  + {p.name}
                  {p.detail ? ` · ${p.detail}` : ''}
                </button>
              ))}
          </div>
        )}
      </div>

      <div className="form-grid">
        <label>
          Edad mínima
          <input name="ageMin" type="number" min={18} max={65} value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value))} />
        </label>
        <label>
          Edad máxima {advantage && <span className="hint">con Advantage+ Meta usa hasta 65</span>}
          <input name="ageMax" type="number" min={18} max={65} value={advantage ? 65 : ageMax} disabled={advantage} onChange={(e) => setAgeMax(Number(e.target.value))} />
        </label>
        <label>
          Género
          <select name="gender" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">Todos</option>
            <option value="2">Mujeres</option>
            <option value="1">Hombres</option>
          </select>
        </label>
      </div>

      <div className="stack-sm">
        <h3 className="small">Segmentación detallada</h3>
        <p className="xs muted">Intereses, comportamientos, cargos, empleadores, sectores, estudios, acontecimientos, situación familiar e ingresos. Dentro de un grupo alcanza con una opción; agregar otro grupo acota el público (tienen que cumplir los dos).</p>
        {groups.map((g, i) => (
          <DetailGroup key={i} slug={slug} index={i} group={g} onChange={(ng) => setGroups(groups.map((x, j) => (j === i ? ng : x)))} onRemove={i > 0 ? () => setGroups(groups.filter((_, j) => j !== i)) : undefined} />
        ))}
        {groups.length < 5 && groups[groups.length - 1].length > 0 && (
          <div>
            <button type="button" className="btn sm" onClick={() => setGroups([...groups, []])}>
              Acotar público (Y además…)
            </button>
          </div>
        )}
        <details>
          <summary className="small">Nivel educativo {education.length ? `(${education.length})` : ''}</summary>
          <div className="row" style={{ marginTop: 8 }}>
            {EDUCATION.map((e) => (
              <label key={e.id} className="check xs">
                <input type="checkbox" name="education" value={e.id} checked={education.includes(e.id)} onChange={(ev) => setEducation(ev.target.checked ? [...education, e.id] : education.filter((x) => x !== e.id))} /> {e.label}
              </label>
            ))}
          </div>
        </details>
      </div>

      <label className="check">
        <input type="checkbox" name="advantage" checked={advantage} onChange={(e) => setAdvantage(e.target.checked)} /> Público Advantage+{' '}
        <span className="hint">Meta usa la segmentación como sugerencia y puede ampliarla si rinde mejor (recomendado). Para que cargos, intereses o edad sean un límite estricto, desmarcalo.</span>
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
            start(async () => {
              const r = await estimateAction(slug, targeting(), placements, objective)
              setEstimate(r.ok ? (r.upper ? `Público estimado: ${r.lower.toLocaleString('es-AR')} a ${r.upper.toLocaleString('es-AR')} personas` : 'Meta no devolvió una estimación (simulación o público muy chico).') : r.error)
            })
          }
        >
          Estimar público
        </button>
        {estimate && <span className="small muted">{estimate}</span>}
      </div>
    </>
  )
}
