// Kit de publicaciones iniciales: se ofrece en el Calendario mientras la app no tenga lotes.
import { generateStarter } from '@/app/actions'
import { db } from '@/lib/db'
import { ILLUSTRATIONS_PER_POST, IMAGE_MODELS, imagePrice } from '@/lib/models'
import { starterSlots, starterStart, STARTER_DAYS, STARTER_TOPICS } from '@/lib/starter'
import { usd } from '@/lib/view'
import { SubmitButton } from './client'
import { ModelSelect } from './ModelSelect'
import { StyleReminder } from './StyleReminder'

const TYPE = { IMAGE: 'Imagen', CAROUSEL: 'Carrusel', REEL: 'Reel', STORY: 'Historia' } as const

export async function StarterKit({ app, redo = false }: { app: NonNullable<Awaited<ReturnType<typeof db.app.findUnique>>>; redo?: boolean }) {
  const start = starterStart(app.timezone)
  const slots = starterSlots(new Date(`${start}T00:00:00Z`), app.postTime, app.timezone)
  const fmt = new Intl.DateTimeFormat('es-AR', { timeZone: app.timezone, weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const model = IMAGE_MODELS.find((m) => m.id === app.imageModel)
  const images = STARTER_TOPICS.reduce((a, t) => a + ILLUSTRATIONS_PER_POST[t.type], 0)
  return (
    <section className="card stack">
      <div className="stack-sm">
        <h2>{redo ? 'Generar otro kit inicial' : 'Kit de publicaciones iniciales'}</h2>
        {redo && <p className="notice small">El kit anterior quedó rechazado o falló entero. Al generar el nuevo se vuelve a leer el repo (con lo que hayas cambiado) y se borra el anterior con sus piezas.</p>}
        <p className="small">
          Antes del ritmo semanal: 9 publicaciones que presentan el negocio. Llenan las 3 primeras filas del perfil, así quien llega entiende en segundos qué es, para quién y cómo empezar, y le muestran a Instagram de qué
          trata la cuenta (mismo tema en todas y las palabras que la gente busca en el texto) para que sepa a quién recomendarla.
        </p>
      </div>
      <ol className="starter-list">
        {STARTER_TOPICS.map((t, i) => (
          <li key={t.id}>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <strong className="small">{t.label}</strong>
              <span className="badge">{TYPE[t.type]}</span>
              {t.pin && <span className="badge info">Fijar en el perfil</span>}
              <span className="xs muted">{fmt.format(slots[i].at)}</span>
            </div>
            <span className="xs muted">{t.why}</span>
          </li>
        ))}
      </ol>
      <div className="notice small">
        <strong>Cadencia: no todo junto.</strong> El primer día salen los 3 para fijar, con 3 horas entre uno y otro, para que el perfil nunca se vea vacío. Después, uno por día durante {STARTER_DAYS - 1} días. Si se publican los 9 de golpe compiten entre sí por los mismos seguidores, Instagram muestra pocos posts seguidos de una misma cuenta y los que quedan abajo casi no se ven; de a uno, cada post tiene su propia oportunidad de llegar a gente nueva. Los días del kit el lote semanal no agrega otro post de feed. Al publicarse, fijá los 3 marcados desde la app de Instagram (la API no deja hacerlo).
      </div>
      <form action={generateStarter.bind(null, app.slug)} className="stack">
        <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label>
            Primer día
            <input type="date" name="start" defaultValue={start} required style={{ width: 170 }} />
          </label>
          <ModelSelect app={app} />
        </div>
        <label>
          Algo para tener en cuenta <span className="hint">Opcional: una promo de lanzamiento, el tono, qué destacar o qué no decir.</span>
          <textarea name="brief" rows={2} maxLength={1000} placeholder="Ej.: abrimos el 1 de noviembre con 15% de descuento la primera semana; destacar el envío en el día." />
        </label>
        <StyleReminder app={app} />
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <SubmitButton pendingText="Encolando…">{redo ? 'Generar otro kit inicial' : 'Generar kit inicial'}</SubmitButton>
          <span className="xs muted">~{images} imágenes{model ? `, ~${usd(images * imagePrice(model, app.imageQuality))} con el modelo de Ajustes` : ''}. Quedan en revisión como cualquier semana.</span>
        </div>
      </form>
    </section>
  )
}
