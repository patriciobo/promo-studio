'use client'
// Guardar una alternativa en el repo: qué campos del promo.yaml, qué íconos del sitio y la guía,
// con la lista exacta de archivos que se crean o reemplazan según lo marcado. Nada más del repo cambia.
import { useState } from 'react'
import type { Found } from '@/lib/brand/brief'
import { iconSource, planFiles, REPO_DIR, YAML_FIELDS, type YamlField } from '@/lib/brand/plan'
import { SubmitButton } from './client'

type OptionFiles = { logoPath: string | null; vectorPath: string | null; iconVector: string | null; iconFiles: unknown }

export function BrandSaveForm(props: {
  action: (f: FormData) => Promise<void>
  fields: YamlField[]
  optIn: YamlField[]
  fonts?: { display: string; text: string }
  found: Found | null
  option: OptionFiles
  manifestPath: string
  local: string | null
  branch: string
  isSaved: boolean
}) {
  const { found, option } = props
  const icons = found?.icons ?? []
  const usable = (path: string) => 'rel' in iconSource(icons.find((i) => i.path === path)!, option as never)
  const [fields, setFields] = useState<YamlField[]>(props.fields.filter((f) => !props.optIn.includes(f)))
  const [picked, setPicked] = useState<string[]>(icons.map((i) => i.path).filter(usable))
  const [guide, setGuide] = useState(false)
  const plan = planFiles({ manifestPath: props.manifestPath }, found, option as never, { fields, icons: picked, guide })
  const toggle = <T,>(list: T[], v: T, on: boolean) => (on ? [...list, v] : list.filter((x) => x !== v))

  return (
    <form action={props.action} className="stack-sm" style={{ marginTop: 10 }}>
      <span className="xs muted">
        Campos de <code>{props.manifestPath}</code> (cambia sólo el valor de cada uno; comentarios y formato quedan igual)
      </span>
      <div className="chips">
        {YAML_FIELDS.filter((y) => props.fields.includes(y.id)).map((y) => (
          <label key={y.id} className="chip" title={y.hint}>
            <input type="checkbox" name="fields" value={y.id} checked={fields.includes(y.id)} onChange={(e) => setFields(toggle(fields, y.id, e.target.checked))} /> {y.label}
          </label>
        ))}
      </div>
      {fields.includes('font') && props.fonts && props.fonts.display !== props.fonts.text && (
        <label>
          Tipografía de las piezas
          <select name="font" defaultValue="text">
            <option value="text">{props.fonts.text} (la de textos: más legible)</option>
            <option value="display">{props.fonts.display} (la de títulos: más personalidad)</option>
          </select>
        </label>
      )}
      <span className="xs muted">Íconos que ya usa el sitio (se reemplazan con la misma ruta, formato y tamaño)</span>
      {icons.length ? (
        <div className="chips">
          {icons.map((i) => {
            const src = iconSource(i, option as never)
            return (
              <label key={i.path} className="chip" title={'why' in src ? src.why : `Reemplaza ${i.path}`} style={'why' in src ? { opacity: 0.55 } : undefined}>
                <input type="checkbox" name="icons" value={i.path} checked={picked.includes(i.path)} disabled={'why' in src} onChange={(e) => setPicked(toggle(picked, i.path, e.target.checked))} /> {i.path}
                {i.size ? ` · ${i.size} px` : ''}
                {'why' in src ? ` · ${src.why}` : ''}
              </label>
            )
          })}
        </div>
      ) : (
        <span className="xs">No encontré íconos en el repo (o falta volver a leerlo). Si el sitio los necesita, descargalos desde la alternativa y sumá el &lt;link&gt; a mano.</span>
      )}
      <label className="check">
        <input type="checkbox" name="guide" checked={guide} onChange={(e) => setGuide(e.target.checked)} /> Guía de marca <code>{REPO_DIR}/MARCA.md</code> <span className="hint">opcional, para el equipo</span>
      </label>

      <div className="save-plan">
        <strong className="xs">Se escribe exactamente esto{props.local ? ` en ${props.local}` : ''}:</strong>
        {plan.files.length ? (
          <ul className="xs">
            {plan.files.map((f) => (
              <li key={f.path}>
                <code>{f.path}</code> · {f.action} · {f.why}
              </li>
            ))}
          </ul>
        ) : (
          <p className="xs">Nada: marcá al menos un campo, un ícono o la guía.</p>
        )}
        <p className="xs muted">Ningún otro archivo del repo cambia. La lámina no se sube: se descarga desde acá.</p>
      </div>

      {!props.local && (
        <div className="row">
          <label className="check">
            <input type="radio" name="mode" value="pr" defaultChecked /> Pull request <span className="hint">para revisarlo antes</span>
          </label>
          <label className="check">
            <input type="radio" name="mode" value="commit" /> Commit directo en {props.branch}
          </label>
        </div>
      )}
      <div>
        <SubmitButton className="btn sm primary" pendingText="Guardando en el repo…" expect={15}>
          {props.isSaved ? 'Guardar de nuevo' : props.local ? 'Escribir en el repo' : 'Guardar en el repo'}
        </SubmitButton>
      </div>
    </form>
  )
}
