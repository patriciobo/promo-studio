import { ErrorsTable, StepsList } from '@/components/GuideBlocks'
import { ConnectionPanel } from '@/components/panels'
import { db } from '@/lib/db'
import { STEPS_PER_APP } from '@/lib/guide'

export default async function ConnectionPage({ params }: PageProps<'/apps/[slug]/conexion'>) {
  const { slug } = await params
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="card stack">
        <h2>Cuenta conectada</h2>
        <p className="small">
          {app.igUserId ? (
            <>
              Instagram <strong>@{app.igUsername}</strong> (id {app.igUserId}) · página {app.pageId} · cuenta publicitaria {app.adAccountId ?? '—'}
            </>
          ) : (
            'Todavía no elegiste la cuenta de Instagram de esta app.'
          )}
        </p>
        <ConnectionPanel slug={slug} current={{ igUserId: app.igUserId, adAccountId: app.adAccountId }} />
      </section>
      <details className="card">
        <summary>Paso a paso para esta app (B.1 a B.8)</summary>
        <div style={{ marginTop: 16 }}>
          <StepsList steps={STEPS_PER_APP} />
          <p className="small muted" style={{ marginTop: 12 }}>
            Los pasos A (portfolio, app de Meta, usuario de sistema y token) se hacen una sola vez: están en la Guía de conexión.
          </p>
        </div>
      </details>
      <details className="card">
        <summary>Errores frecuentes y cómo arreglarlos</summary>
        <div style={{ marginTop: 16 }}>
          <ErrorsTable />
        </div>
      </details>
    </div>
  )
}
