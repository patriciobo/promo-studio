// Campos del brief de identidad de marca. Se usan al crear el proyecto y al editarlo.
import { USES, type Brief } from '@/lib/brand/brief'
import { AXES, LOGO_TYPES, PERSONALITIES } from '@/lib/brand/concepts'
import { TEXT_MODELS } from '@/lib/models'

export function BrandBriefFields({ brief, textModel, referenceSrc }: { brief: Brief; textModel?: string; referenceSrc?: string | null }) {
  return (
    <div className="stack">
      <fieldset className="brief-group">
        <legend>1. El negocio</legend>
        <div className="form-grid">
          <label>
            Nombre de la marca
            <input name="name" defaultValue={brief.name} maxLength={80} placeholder="Si todavía no tiene, dejalo vacío" />
          </label>
          <label>
            Rubro
            <input name="industry" defaultValue={brief.industry} maxLength={120} placeholder="Trabajamos con cualquier rubro: odontología, cabañas, software…" />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" name="needsName" defaultChecked={brief.needsName} /> Necesita nombre <span className="hint">propone 3 por alternativa</span>
        </label>
        <label>
          Qué ofrece
          <textarea name="offer" rows={2} maxLength={800} defaultValue={brief.offer} placeholder="Productos o servicios, en palabras simples" />
        </label>
        <div className="form-grid">
          <label>
            Propósito <span className="hint">por qué existe, más allá de vender</span>
            <textarea name="purpose" rows={2} maxLength={600} defaultValue={brief.purpose} />
          </label>
          <label>
            Diferencial <span className="hint">qué lo hace distinto</span>
            <textarea name="differentiator" rows={2} maxLength={600} defaultValue={brief.differentiator} />
          </label>
        </div>
      </fieldset>

      <fieldset className="brief-group">
        <legend>2. Público y mercado</legend>
        <label>
          Público objetivo <span className="hint">quién compra: edad, situación, qué le importa</span>
          <textarea name="audience" rows={2} maxLength={600} defaultValue={brief.audience} />
        </label>
        <div className="form-grid">
          <label>
            Dónde <span className="hint">ciudad, país o si es online</span>
            <input name="location" defaultValue={brief.location} maxLength={120} />
          </label>
          <label>
            Competidores <span className="hint">2 o 3, y en qué no querés parecerte</span>
            <input name="competitors" defaultValue={brief.competitors} maxLength={600} />
          </label>
        </div>
      </fieldset>

      <fieldset className="brief-group">
        <legend>3. Personalidad</legend>
        <div className="stack-sm">
          <span className="small muted">Hasta 5 rasgos</span>
          <div className="chips">
            {PERSONALITIES.map((p) => (
              <label key={p} className="chip">
                <input type="checkbox" name="personalities" value={p} defaultChecked={brief.personalities.includes(p)} /> {p}
              </label>
            ))}
          </div>
        </div>
        <div className="axes">
          {AXES.map((a) => (
            <label key={a.id} className="axis">
              <span className="small">{a.from}</span>
              <input type="range" name={`axis_${a.id}`} min={0} max={100} step={5} defaultValue={Math.round(brief.axes[a.id] * 100)} aria-label={`${a.from} o ${a.to}`} />
              <span className="small">{a.to}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="brief-group">
        <legend>4. Gustos y referencias</legend>
        <div className="form-grid">
          <label>
            Colores que le gustan
            <input name="likedColors" defaultValue={brief.likedColors} maxLength={200} placeholder="verde oliva, terracota…" />
          </label>
          <label>
            Colores a evitar
            <input name="avoidColors" defaultValue={brief.avoidColors} maxLength={200} />
          </label>
        </div>
        <label>
          Marcas que admira <span className="hint">de cualquier rubro, y qué le gusta de cada una</span>
          <input name="admiredBrands" defaultValue={brief.admiredBrands} maxLength={400} />
        </label>
        <div className="form-grid">
          <label>
            Logo de referencia <span className="hint">opcional: se toma su espíritu, nunca se copia</span>
            <input type="file" name="reference" accept="image/png,image/jpeg,image/webp" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {referenceSrc && <img src={referenceSrc} alt="Logo de referencia actual" className="brief-ref" />}
          </label>
          <label>
            Frase o slogan actual <span className="hint">si ya tiene</span>
            <input name="tagline" defaultValue={brief.tagline} maxLength={140} />
          </label>
        </div>
        <div className="stack-sm">
          <span className="small muted">Tipo de logo que prefiere (opcional)</span>
          <div className="chips">
            {LOGO_TYPES.map((l) => (
              <label key={l.id} className="chip" title={l.hint}>
                <input type="checkbox" name="logoTypes" value={l.id} defaultChecked={brief.logoTypes.includes(l.id)} /> {l.label}
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <fieldset className="brief-group">
        <legend>5. Uso y límites</legend>
        <div className="stack-sm">
          <span className="small muted">Dónde se va a usar la marca</span>
          <div className="chips">
            {USES.map((u) => (
              <label key={u} className="chip">
                <input type="checkbox" name="uses" value={u} defaultChecked={brief.uses.includes(u)} /> {u}
              </label>
            ))}
          </div>
        </div>
        <label>
          Restricciones <span className="hint">lo que no puede tener, normas del rubro, cosas que ya probó y no funcionaron</span>
          <textarea name="constraints" rows={2} maxLength={600} defaultValue={brief.constraints} />
        </label>
        <div className="form-grid">
          <label>
            Idioma de los textos
            <select name="language" defaultValue={brief.language}>
              <option value="es">Español</option>
              <option value="en">Inglés</option>
              <option value="pt">Portugués</option>
            </select>
          </label>
          <label>
            Modelo de texto
            <select name="textModel" defaultValue={textModel ?? TEXT_MODELS.find((t) => t.recommended)!.id}>
              {TEXT_MODELS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.note}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>
    </div>
  )
}
