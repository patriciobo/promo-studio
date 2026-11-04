import { suggestStylesAction, updateSettings } from '@/app/actions'
import { SubmitButton } from '@/components/client'
import { OwnerFields } from '@/components/OwnerFields'
import { PhotoModePicker } from '@/components/PhotoModePicker'
import { ImageModelPicker, TextModelPicker } from '@/components/ModelPicker'
import { spentThisMonth } from '@/lib/budget'
import { db } from '@/lib/db'
import type { Manifest } from '@/lib/manifest'
import { imagesPerMonth } from '@/lib/models'
import { genericOrigin, listSamples } from '@/lib/style-samples'
import type { StyleSuggestion } from '@/lib/styles'
import { imageModels, textModels } from '@/lib/openrouter'
import { usd } from '@/lib/view'
import { reelPlan, SUGGESTED_VIDEO_MODEL, VIDEO_ARENA_URL, VIDEO_MODELS, videoModelOf } from '@/lib/video-models'

export default async function Settings({ params, searchParams }: PageProps<'/apps/[slug]/ajustes'>) {
  const { slug } = await params
  const { aviso, pr, error } = await searchParams
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const manifest = app.manifest as unknown as Manifest | null
  const cadence = manifest?.cadence ?? { feed: 3, reels: 0, stories: 2 }
  const reelsPerMonth = Math.round(Math.min(cadence.reels ?? 0, cadence.feed) * 4.33)
  const vm = videoModelOf(app.videoModel)
  const custom = app.videoModel && !VIDEO_MODELS.some((m) => m.id === app.videoModel) ? app.videoModel : null
  const [images, texts, spent, generic, mine, origin] = await Promise.all([imageModels().catch(() => []), textModels().catch(() => []), spentThisMonth(app.id), listSamples(), listSamples(app.slug, app.imageKind), genericOrigin()])
  const styleApp = {
    name: app.name,
    slug,
    genericName: origin ?? (Object.keys(generic).length ? 'Rumbo (marca de prueba)' : 'la app de ejemplo'),
    samples: mine,
    suggestions: (app.styleSuggestions as StyleSuggestion[] | null) ?? [],
    yamlStyle: manifest?.brand.style ?? null,
    hasRepo: !!app.repo,
    suggest: suggestStylesAction.bind(null, slug, 'ajustes'),
  }
  return (
    <form action={updateSettings.bind(null, slug)} className="stack" style={{ maxWidth: 960, gap: 20 }}>
      {typeof pr === 'string' && (
        <p className="notice ok">
          Estilo guardado. Abrí un PR con el cambio en el promo.yaml: <a href={pr} target="_blank" rel="noreferrer">{pr}</a>. Al aprobarlo, la próxima sincronización lo toma.
        </p>
      )}
      {aviso === 'yaml-escrito' && <p className="notice ok">Estilo guardado y escrito en el promo.yaml{app.repo ? ' del repo local' : ''}.</p>}
      {aviso === 'sugeridos' && <p className="notice ok">Listo: los estilos sugeridos quedaron primeros, con el porqué.</p>}
      {typeof error === 'string' && <p className="notice bad">{error}</p>}
      <section className="card stack">
        <h2>App</h2>
        <div className="form-grid">
          <label>
            Nombre
            <input name="name" defaultValue={app.name} required />
          </label>
          <label>
            Repositorio
            <input name="repo" defaultValue={app.repo ?? ''} placeholder="Sin repositorio" />
            <span className="hint">Vacío: la cuenta no tiene repo y el promo.yaml se guarda en Promo Studio (al vaciarlo se conserva el que ya usa).</span>
          </label>
          <label>
            Rama
            <input name="branch" defaultValue={app.branch} />
          </label>
        </div>
        <OwnerFields owner={app.owner} clientName={app.clientName} />
      </section>
      <section className="card stack">
        <h2>Modelos de OpenRouter</h2>
        <div className="stack-sm">
          <strong>Estilo y modelo de imagen para la generación automática</strong>
          <span className="hint">Lo usa el lote semanal automático de los domingos (si está activado en Publicación) y es el que aparece preseleccionado junto a los botones de generar (Calendario, Crear ahora, Revisión), donde lo podés cambiar para esa vez. Genera una ilustración por diapositiva o escena; el texto lo pone la plantilla.</span>
          <ImageModelPicker current={app.imageModel} quality={app.imageQuality} kind={app.imageKind} imagesPerMonth={imagesPerMonth(cadence, (app.manifest as unknown as Manifest | null)?.daily)} budget={app.monthlyBudgetUsd} available={images} designStyle={app.designStyle} samples={generic} styleApp={styleApp} />
        </div>
        <PhotoModePicker current={app.photoMode} legend="Cómo se muestran las fotos que elegís (de la biblioteca o subidas) en las piezas. Se puede cambiar en cada publicación desde Crear ahora o Revisión." />
        <label>
          Modelo de video para los reels{' '}
          <span className="hint">
            Cada escena del reel es un clip generado por este modelo (movimiento real, no una imagen con zoom), a partir de un primer cuadro hecho con el modelo de imagen para que toda la historia tenga la misma gente. Un reel de 3 escenas sale ~{usd(reelPlan(vm, 3).costUsd)} de video
            {reelsPerMonth ? ` (con ${cadence.reels} por semana en el promo.yaml, ~${usd(reelPlan(vm, 3).costUsd * reelsPerMonth)}/mes)` : ' (el promo.yaml no programa reels: cadence.reels)'}. Ejemplos de cada modelo en el link; para compararlos con el mismo prompt, <a href={VIDEO_ARENA_URL} target="_blank" rel="noreferrer">la arena de video de Artificial Analysis</a>.
          </span>
          <select name="videoModel" defaultValue={app.videoModel ?? ''}>
            <option value="">Sugerido ({VIDEO_MODELS.find((m) => m.id === SUGGESTED_VIDEO_MODEL)?.name})</option>
            {VIDEO_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · ~US$ {m.pricePerSec.toFixed(2)}/s{m.audio ? ' · con sonido' : ''} · {m.uses}
              </option>
            ))}
            {custom && <option value={custom}>{custom}</option>}
          </select>
          <span className="xs muted">
            Ejemplos:{' '}
            {VIDEO_MODELS.map((m, i) => (
              <span key={m.id}>
                {i ? ' · ' : ''}
                <a href={m.examples} target="_blank" rel="noreferrer">
                  {m.name.split(' (')[0]}
                </a>
              </span>
            ))}
          </span>
        </label>
        <div className="stack-sm">
          <strong>Modelo de texto</strong>
          <span className="hint">Planifica la semana (1 llamada por semana por app), sugiere estilos y campañas y describe las imágenes subidas.</span>
          <TextModelPicker current={app.textModel} available={texts} />
        </div>
        <label>
          Presupuesto mensual (USD) <span className="hint">Este mes: {usd(spent)}. Al llegar al tope se deja de generar; lo aprobado se publica igual.</span>
          <input name="monthlyBudgetUsd" type="number" min={0} step={0.5} defaultValue={app.monthlyBudgetUsd} />
        </label>
        <label>
          Tope mensual de anuncios <span className="hint">En la moneda de la cuenta publicitaria. No deja activar campañas que lo superen sumando el máximo de cada una. Vacío = sin tope.</span>
          <input name="adMonthlyBudget" type="number" min={0} step={1} defaultValue={app.adMonthlyBudget ?? ''} />
        </label>
      </section>
      <section className="card stack">
        <h2>Publicación</h2>
        <p className="small muted">La cantidad por semana (feed, cuántos de esos son reels y stories) se define en el promo.yaml (cadence: feed, reels, stories).</p>
        <div className="form-grid">
          <label>
            Hora de publicación
            <input name="postTime" type="time" defaultValue={app.postTime} />
          </label>
          <label>
            Zona horaria
            <input name="timezone" defaultValue={app.timezone} />
          </label>
          <label>
            Aprobación automática (horas)
            <input name="autoApproveHours" type="number" min={1} max={168} defaultValue={app.autoApproveHours} />
          </label>
        </div>
        <label>
          WhatsApp del cliente{' '}
          <span className="hint">
            Opcional. Con código de país, p. ej. 5493511234567. Lo que quede para revisar se le manda desde el número de WAHA (Configuración) y lo aprueba respondiendo: ok, ok 1 3, cambios 2: …, no 2. Lo que no se aprueba igual se aprueba solo a las horas de arriba.
          </span>
          <input name="whatsapp" type="tel" inputMode="tel" defaultValue={app.whatsapp ?? ''} placeholder="5493511234567" />
        </label>
        <label className="check">
          <input type="checkbox" name="autoRevise" defaultChecked={app.autoRevise} /> Aplicar solos los cambios que pide el cliente por WhatsApp (“cambios 2: …”): el modelo de texto corrige la publicación, se vuelve a armar y se le manda de nuevo. Lo que no puede resolver solo (una foto que va a mandar, algo confuso) te queda a vos en Revisión.
        </label>
        <label className="check">
          <input type="checkbox" name="autoWeekly" defaultChecked={app.autoWeekly} /> Generar sola la semana siguiente cada domingo a las 18:00 (si no, se genera a mano desde el Calendario)
        </label>
        <label className="check">
          <input type="checkbox" name="useTrends" defaultChecked={app.useTrends} /> Subirse a tendencias: el lote semanal puede basar 1 o 2 posts en formatos, memes o sonidos que están pegando ahora en este público (radar de Tendencias), y si una pasa de moda antes de que salga el post, se rehace solo
        </label>
        <label className="check">
          <input type="checkbox" name="offerStarter" defaultChecked={!app.starterDismissed} /> Ofrecer el kit de publicaciones iniciales en el Calendario (desmarcalo si la cuenta ya tiene contenido)
        </label>
        <label className="check">
          <input type="checkbox" name="dryRun" defaultChecked={app.dryRun} /> Simulación: genera y &quot;publica&quot; sin tocar Instagram
        </label>
        <label className="check">
          <input type="checkbox" name="paused" defaultChecked={app.paused} /> Pausar la app (no genera ni publica)
        </label>
      </section>
      <div>
        <SubmitButton pendingText="Guardando…">Guardar</SubmitButton>
      </div>
    </form>
  )
}
