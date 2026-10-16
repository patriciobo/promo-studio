import { syncNow, uploadLogoAction } from '@/app/actions'
import { SubmitButton } from '@/components/client'
import { ManifestWizard } from '@/components/panels'
import { db } from '@/lib/db'
import { getFile } from '@/lib/github'
import type { Manifest } from '@/lib/manifest'
import { mediaSrc } from '@/lib/media'

const AVISOS: Record<string, { tone: string; text: string }> = {
  borrador: { tone: 'ok', text: 'Armé el promo.yaml con la descripción. Revisalo abajo (sobre todo funciones, público y colores) y guardalo si cambiás algo.' },
  'borrador-incompleto': { tone: 'warn', text: 'Armé un borrador con la descripción, pero le faltan datos: completalo abajo y tocá Guardar.' },
}

export default async function ManifestPage({ params, searchParams }: PageProps<'/apps/[slug]/manifiesto'>) {
  const { slug } = await params
  const { aviso, error } = await searchParams
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const current = app.repo ? await getFile(app.repo, app.manifestPath, app.branch).catch(() => null) : null
  const logo = (app.manifest as unknown as Manifest | null)?.brand.logo
  const notice = typeof aviso === 'string' ? AVISOS[aviso] : undefined
  return (
    <div className="stack" style={{ gap: 20 }}>
      {notice && <p className={`notice ${notice.tone}`}>{notice.text}</p>}
      {typeof error === 'string' && <p className="notice bad">{error}</p>}
      <section className="card stack">
        <div className="row between">
          <h2>Estado</h2>
          {app.repo && (
            <form action={syncNow.bind(null, slug)}>
              <SubmitButton className="btn sm" pendingText="Sincronizando…" expect={8}>
                Sincronizar
              </SubmitButton>
            </form>
          )}
        </div>
        {app.manifestError ? (
          <p className="notice bad">{app.manifestError}</p>
        ) : app.manifest ? (
          <p className="notice ok">
            {app.manifestPath} válido · {app.repo ? 'última sincronización' : 'guardado'} {app.syncedAt?.toLocaleString('es-AR')}
          </p>
        ) : (
          <p className="notice warn">Todavía no hay {app.manifestPath}{app.repo ? ' en el repo' : ''}. Generá un borrador abajo.</p>
        )}
        <p className="small muted">
          {app.repo
            ? 'El promo.yaml describe la app (público, tono, marca, funciones, temas de contenido). Se lee del repo en cada sincronización; el logo, las capturas y la música pueden ir en la carpeta .promo/.'
            : 'El promo.yaml describe el negocio (público, tono, marca, servicios, temas de contenido). Esta cuenta no tiene repositorio: se guarda acá y se edita abajo.'}
        </p>
      </section>
      {!app.repo && (
        <section className="card stack">
          <h2>Logo</h2>
          <div className="row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo && !/^https?:/.test(logo) && <img src={`${mediaSrc(`apps/${slug}/${logo}`)}?v=${app.syncedAt?.getTime() ?? 0}`} alt="Logo" style={{ maxHeight: 64, maxWidth: 200 }} />}
            {app.manifestYaml && (
              <form action={uploadLogoAction.bind(null, slug)} className="row">
                <input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" required />
                <SubmitButton className="btn sm" pendingText="Subiendo…">
                  {logo ? 'Reemplazar logo' : 'Subir logo'}
                </SubmitButton>
              </form>
            )}
          </div>
          <p className="xs muted">{app.manifestYaml ? 'PNG con fondo transparente o SVG. Va en las piezas, debajo del usuario de Instagram. Si todavía no tiene, generalo en la pestaña Marca.' : 'Primero armá el promo.yaml.'}</p>
        </section>
      )}
      <section className="card stack">
        <h2>Asistente</h2>
        <p className="small muted">
          {app.repo
            ? 'Lee el README, package.json, llms.txt, íconos y estilos del repo y propone el manifiesto con el modelo de texto de la app (1 llamada).'
            : 'Propone el manifiesto a partir de una descripción del negocio con el modelo de texto de la cuenta (1 llamada). No inventa lo que la descripción no dice.'}
        </p>
        <ManifestWizard slug={slug} repo={app.repo} initialYaml={(app.repo ? current?.text : app.manifestYaml) ?? ''} />
      </section>
    </div>
  )
}
