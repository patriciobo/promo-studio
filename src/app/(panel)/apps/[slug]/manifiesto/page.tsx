import { syncNow } from '@/app/actions'
import { SubmitButton } from '@/components/client'
import { ManifestWizard } from '@/components/panels'
import { db } from '@/lib/db'
import { getFile } from '@/lib/github'

export default async function ManifestPage({ params }: PageProps<'/apps/[slug]/manifiesto'>) {
  const { slug } = await params
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const current = await getFile(app.repo, app.manifestPath, app.branch).catch(() => null)
  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="card stack">
        <div className="row between">
          <h2>Estado</h2>
          <form action={syncNow.bind(null, slug)}>
            <SubmitButton className="btn sm" pendingText="Sincronizando…">
              Sincronizar
            </SubmitButton>
          </form>
        </div>
        {app.manifestError ? (
          <p className="notice bad">{app.manifestError}</p>
        ) : app.manifest ? (
          <p className="notice ok">
            {app.manifestPath} válido · última sincronización {app.syncedAt?.toLocaleString('es-AR')}
          </p>
        ) : (
          <p className="notice warn">Todavía no hay {app.manifestPath} en el repo. Generá un borrador abajo.</p>
        )}
        <p className="small muted">
          El promo.yaml describe la app (público, tono, marca, funciones, temas de contenido). Se lee del repo en cada sincronización; el logo, las capturas y la música pueden ir en la carpeta <code>.promo/</code>.
        </p>
      </section>
      <section className="card stack">
        <h2>Asistente</h2>
        <p className="small muted">Lee el README, package.json, llms.txt, íconos y estilos del repo y propone el manifiesto con el modelo de texto de la app (1 llamada).</p>
        <ManifestWizard slug={slug} repo={app.repo} initialYaml={current?.text ?? ''} />
      </section>
    </div>
  )
}
