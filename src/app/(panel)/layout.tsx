import { NavLink } from '@/components/Nav'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function PanelLayout({ children }: LayoutProps<'/'>) {
  const apps = await db.app.findMany({ orderBy: { createdAt: 'asc' }, select: { slug: true, name: true, _count: { select: { posts: { where: { status: 'PENDING_REVIEW' } } } } } })
  return (
    <div className="shell">
      <aside className="side">
        <div className="logo">
          <i aria-hidden /> Promo Studio
        </div>
        <NavLink href="/" exact>
          Inicio
        </NavLink>
        <div className="label">Apps</div>
        {apps.map((a) => (
          <NavLink key={a.slug} href={`/apps/${a.slug}`}>
            <span>{a.name}</span>
            {a._count.posts ? <span className="badge warn">{a._count.posts}</span> : null}
          </NavLink>
        ))}
        <NavLink href="/apps/nueva">+ Conectar app</NavLink>
        <div className="spacer" />
        <NavLink href="/guia">Guía de conexión</NavLink>
        <NavLink href="/configuracion">Configuración</NavLink>
      </aside>
      <main className="main">{children}</main>
    </div>
  )
}
