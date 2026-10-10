import { suggestStylesAction, updateSettings } from '@/app/actions'
import { SubmitButton } from '@/components/client'
import { ImageModelPicker, TextModelPicker } from '@/components/ModelPicker'
import { spentThisMonth } from '@/lib/budget'
import { db } from '@/lib/db'
import type { Manifest } from '@/lib/manifest'
import { imagesPerMonth } from '@/lib/models'
import { genericOrigin, listSamples } from '@/lib/style-samples'
import type { StyleSuggestion } from '@/lib/styles'
import { imageModels, textModels } from '@/lib/openrouter'
import { usd } from '@/lib/view'

export default async function Settings({ params, searchParams }: PageProps<'/apps/[slug]/ajustes'>) {
  const { slug } = await params
  const { aviso, pr, error } = await searchParams
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const manifest = app.manifest as unknown as Manifest | null
  const cadence = manifest?.cadence ?? { feed: 3, reels: 1, stories: 2 }
  const [images, texts, spent, generic, mine, origin] = await Promise.all([imageModels().catch(() => []), textModels().catch(() => []), spentThisMonth(app.id), listSamples(), listSamples(app.slug, app.imageKind), genericOrigin()])
  const styleApp = {
    name: app.name,
    slug,
    genericName: origin ?? (Object.keys(generic).length ? 'Rumbo (marca de prueba)' : 'la app de ejemplo'),
    samples: mine,
    suggestions: (app.styleSuggestions as StyleSuggestion[] | null) ?? [],
    yamlStyle: manifest?.brand.style ?? null,
    suggest: suggestStylesAction.bind(null, slug, 'ajustes'),
  }
  return (
    <form action={updateSettings.bind(null, slug)} className="stack" style={{ maxWidth: 960, gap: 20 }}>
      {typeof pr === 'string' && (
        <p className="notice ok">
          Estilo guardado. Abrí un PR con el cambio en el promo.yaml: <a href={pr} target="_blank" rel="noreferrer">{pr}</a>. Al aprobarlo, la próxima sincronización lo toma.
        </p>
      )}
      {aviso === 'yaml-escrito' && <p className="notice ok">Estilo guardado y escrito en el promo.yaml del repo local.</p>}
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
            <input name="repo" defaultValue={app.repo} required />
          </label>
          <label>
            Rama
            <input name="branch" defaultValue={app.branch} />
          </label>
        </div>
      </section>
      <section className="card stack">
        <h2>Modelos de OpenRouter</h2>
        <div className="stack-sm">
          <strong>Estilo y modelo de imagen para la generación automática</strong>
          <span className="hint">Lo usa el lote semanal de cada domingo y es el que aparece preseleccionado junto a los botones de generar (Calendario, Crear ahora, Revisión), donde lo podés cambiar para esa vez. Genera una ilustración por diapositiva o escena; el texto lo pone la plantilla.</span>
          <ImageModelPicker current={app.imageModel} quality={app.imageQuality} kind={app.imageKind} imagesPerMonth={imagesPerMonth(cadence, (app.manifest as unknown as Manifest | null)?.daily)} budget={app.monthlyBudgetUsd} available={images} designStyle={app.designStyle} samples={generic} styleApp={styleApp} />
        </div>
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
        <p className="small muted">La cantidad por semana (feed, reels, stories) se define en el promo.yaml (cadence).</p>
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
