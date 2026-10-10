import { createFlowPost, syncNow } from '@/app/actions'
import { SubmitButton } from '@/components/client'
import { ModelSelect } from '@/components/ModelSelect'
import { db } from '@/lib/db'
import type { Manifest } from '@/lib/manifest'
import { mediaSrc } from '@/lib/media'

export default async function Flows({ params }: PageProps<'/apps/[slug]/flujos'>) {
  const { slug } = await params
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const flows = (app.manifest as unknown as Manifest | null)?.flows ?? []
  const shots = await db.appImage.findMany({ where: { appId: app.id, flowId: { not: null }, archived: false }, orderBy: { step: 'asc' } })
  return (
    <div className="stack" style={{ gap: 24 }}>
      <section className="card stack">
        <div className="stack-sm">
          <h2>Flujos de la app</h2>
          <p className="small muted">
            Los flujos se declaran en el promo.yaml y las capturas las saca <code>.promo/capture.mjs</code> en el repo (la app corriendo en local con datos de ejemplo). Al sincronizar se
            importan a Imágenes ya descritas, sin costo. Cada post de un flujo es un paso a paso con las capturas reales y el texto encima; sólo la portada usa imagen IA.
          </p>
        </div>
        <form action={syncNow.bind(null, slug)} className="row">
          <SubmitButton className="btn sm" pendingText="Sincronizando…" expect={8}>
            Sincronizar capturas
          </SubmitButton>
          {app.syncedAt && <span className="xs muted">Última sincronización: {app.syncedAt.toLocaleString('es-AR', { timeZone: app.timezone })}</span>}
        </form>
      </section>
      {!flows.length && (
        <div className="card empty stack-sm">
          <p>El promo.yaml todavía no tiene flujos.</p>
          <p className="small muted">
            En el repo de la app, pedile a Claude Code: “/promo-yaml agregá los flujos principales y sacá las capturas”. Después commiteá <code>.promo/</code> y sincronizá.
          </p>
        </div>
      )}
      {flows.map((flow) => {
        const mine = shots.filter((s) => s.flowId === flow.id)
        const missing = flow.steps.length - mine.length
        return (
          <section key={flow.id} className="card stack">
            <div className="row between">
              <div className="stack-sm">
                <h3>{flow.name}</h3>
                {flow.description && <p className="small muted">{flow.description}</p>}
              </div>
              {missing > 0 ? <span className="badge warn">{mine.length ? `faltan ${missing} capturas` : 'sin capturas'}</span> : <span className="badge ok">{mine.length} capturas</span>}
            </div>
            <div className="flow-steps">
              {flow.steps.map((step, n) => {
                const shot = mine.find((s) => s.step === n)
                return (
                  <figure key={n} className="flow-step">
                    {shot ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaSrc(shot.path)} alt={step.shows} loading="lazy" />
                    ) : (
                      <div className="flow-step-missing xs muted">Falta: node .promo/capture.mjs --flow {flow.id}</div>
                    )}
                    <figcaption className="xs">
                      <strong>{n + 1}.</strong> {step.shows}
                    </figcaption>
                  </figure>
                )
              })}
            </div>
            {mine.length > 0 && (
              <form action={createFlowPost.bind(null, slug, flow.id)} className="stack-sm">
                <label>
                  Enfoque <span className="hint">opcional, p. ej. “para quienes recién empiezan”</span>
                  <input name="topic" maxLength={300} />
                </label>
                <div className="row">
                  <select name="type" defaultValue="CAROUSEL" aria-label="Tipo" className="model-select">
                    <option value="CAROUSEL">Carrusel</option>
                    <option value="REEL">Reel</option>
                  </select>
                  <ModelSelect app={app} label="Modelo para la portada" />
                  <SubmitButton pendingText="Encolando…">Crear post de este flujo</SubmitButton>
                </div>
              </form>
            )}
          </section>
        )
      })}
    </div>
  )
}
