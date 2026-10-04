import { notFound } from 'next/navigation'
import { Tabs } from '@/components/Nav'
import { db } from '@/lib/db'

export default async function AppLayout({ children, params }: LayoutProps<'/apps/[slug]'>) {
  const { slug } = await params
  const app = await db.app.findUnique({ where: { slug }, include: { _count: { select: { posts: { where: { status: 'PENDING_REVIEW' } } } } } })
  if (!app) notFound()
  const base = `/apps/${slug}`
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{app.name}</h1>
          <p>
            {app.igUsername ? `@${app.igUsername}` : 'Instagram sin conectar'} · <a href={`https://github.com/${app.repo}`} target="_blank" rel="noreferrer">{app.repo}</a>
            {app.dryRun && <span className="badge info" style={{ marginLeft: 8 }}>Simulación: no publica en Instagram</span>}
            {app.paused && <span className="badge" style={{ marginLeft: 8 }}>Pausada</span>}
          </p>
        </div>
      </div>
      <Tabs
        items={[
          { href: base, label: 'Calendario' },
          { href: `${base}/crear`, label: 'Crear ahora' },
          { href: `${base}/revision`, label: 'Revisión', count: app._count.posts },
          { href: `${base}/flujos`, label: 'Flujos' },
          { href: `${base}/imagenes`, label: 'Imágenes' },
          { href: `${base}/rendimiento`, label: 'Rendimiento' },
          { href: `${base}/anuncios`, label: 'Anuncios' },
          { href: `${base}/manifiesto`, label: 'promo.yaml' },
          { href: `${base}/conexion`, label: 'Instagram' },
          { href: `${base}/perfil`, label: 'Perfil' },
          { href: `${base}/ajustes`, label: 'Ajustes' },
        ]}
      />
      {children}
    </>
  )
}
