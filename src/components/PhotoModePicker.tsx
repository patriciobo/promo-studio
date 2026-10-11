// Cómo se muestran las fotos elegidas: de fondo, enmarcadas en el estilo o alternando. Con un boceto de cada opción.
import { PHOTO_MODES, type PhotoMode } from '@/lib/photos'

/** Boceto de una pieza: la foto (degradé) a sangre o en recuadro, y unas barras de texto. */
function Mock({ frame }: { frame: boolean }) {
  return (
    <span className={`photo-mock${frame ? ' frame' : ''}`} aria-hidden>
      <span className="ph" />
      <span className="txt">
        <i />
        <i />
      </span>
    </span>
  )
}

export function PhotoModePicker({ current, form, legend = 'Las fotos elegidas', inherit }: { current?: string | null; form?: string; legend?: string; inherit?: string }) {
  const value = PHOTO_MODES.some((m) => m.id === current) ? (current as PhotoMode) : inherit ? '' : 'fondo'
  return (
    <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="small muted">{legend}</legend>
      <div className="photo-modes">
        {inherit && (
          <label className="photo-mode">
            <input type="radio" name="photoMode" value="" form={form} defaultChecked={value === ''} />
            <strong className="small">Como en Ajustes</strong>
            <span className="xs muted">{PHOTO_MODES.find((m) => m.id === inherit)?.label ?? 'De fondo'}</span>
          </label>
        )}
        {PHOTO_MODES.map((m) => (
          <label key={m.id} className="photo-mode">
            <input type="radio" name="photoMode" value={m.id} form={form} defaultChecked={value === m.id} />
            <span className="row" style={{ gap: 6 }}>
              {m.id === 'mezcla' ? (
                <>
                  <Mock frame={false} />
                  <Mock frame />
                </>
              ) : (
                <Mock frame={m.id === 'marco'} />
              )}
            </span>
            <strong className="small">{m.label}</strong>
            <span className="xs muted">{m.hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
