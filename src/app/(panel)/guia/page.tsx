import { ErrorsTable, StepsList } from '@/components/GuideBlocks'
import { STEPS_CLIENT, STEPS_ONCE, STEPS_PER_APP } from '@/lib/guide'

export default function Guide() {
  return (
    <div className="stack" style={{ gap: 24, maxWidth: 900 }}>
      <div className="page-head">
        <div>
          <h1>Guía de conexión</h1>
          <p>Lo que hay que hacer en Meta para que el servicio publique, mida y cree anuncios en cada cuenta.</p>
        </div>
      </div>
      <section className="card stack">
        <h2>A. Una sola vez</h2>
        <StepsList steps={STEPS_ONCE} />
      </section>
      <section className="card stack">
        <h2>B. Por cada app</h2>
        <StepsList steps={STEPS_PER_APP} />
      </section>
      <section className="card stack" id="clientes">
        <div className="stack-sm">
          <h2>C. Cuentas de otras personas (clientes)</h2>
          <p className="small muted">
            El cliente sigue siendo dueño de su Instagram, su página y su cuenta publicitaria y le da acceso a tu portfolio de clientes, que tiene su propia app de Meta, usuario de sistema y token. En Promo Studio sus apps aparecen aparte, en Clientes, y usan el token para clientes.
          </p>
        </div>
        <StepsList steps={STEPS_CLIENT} />
      </section>
      <section className="card stack">
        <h2>Errores frecuentes</h2>
        <ErrorsTable />
      </section>
    </div>
  )
}
