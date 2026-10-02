import { updateSettings } from '@/app/actions'
import { SubmitButton } from '@/components/client'
import { spentThisMonth } from '@/lib/budget'
import { db } from '@/lib/db'
import { imageModels, textModels } from '@/lib/openrouter'
import { usd } from '@/lib/view'

export default async function Settings({ params }: PageProps<'/apps/[slug]/ajustes'>) {
  const { slug } = await params
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const [images, texts, spent] = await Promise.all([imageModels().catch(() => []), textModels().catch(() => []), spentThisMonth(app.id)])
  return (
    <form action={updateSettings.bind(null, slug)} className="stack" style={{ maxWidth: 760, gap: 20 }}>
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
        <label>
          Modelo de imagen <span className="hint">genera los fondos (sin texto). {images.length} modelos disponibles.</span>
          <input name="imageModel" defaultValue={app.imageModel ?? ''} list="image-models" placeholder="proveedor/modelo" />
          <datalist id="image-models">
            {images.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} {m.price ?? ''}
              </option>
            ))}
          </datalist>
        </label>
        <label>
          Modelo de texto <span className="hint">planifica la semana (1 llamada por semana). Conviene uno barato.</span>
          <input name="textModel" defaultValue={app.textModel} list="text-models" required />
          <datalist id="text-models">
            {texts.slice(0, 150).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} {m.price ?? ''}
              </option>
            ))}
          </datalist>
        </label>
        <label>
          Presupuesto mensual (USD) <span className="hint">Este mes: {usd(spent)}. Al llegar al tope se deja de generar; lo aprobado se publica igual.</span>
          <input name="monthlyBudgetUsd" type="number" min={0} step={0.5} defaultValue={app.monthlyBudgetUsd} />
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
