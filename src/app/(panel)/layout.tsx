import { NavLink } from '@/components/Nav'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function PanelLayout({ children }: LayoutProps<'/'>) {
  const apps = await db.app.findMany({ orderBy: { createdAt: 'asc' }, select: { slug: true, name: true, owner: true, clientName: true, _count: { select: { posts: { where: { status: 'PENDING_REVIEW' } } } } } })
  const own = apps.filter((a) => a.owner !== 'client')
  // Las de clientes, agrupadas por cliente (las que no tienen nombre de cliente van al final).
  const clients = apps.filter((a) => a.owner === 'client').sort((a, b) => (a.clientName ?? '\uffff').localeCompare(b.clientName ?? '\uffff', 'es'))
  const item = (a: (typeof apps)[number], sub?: string | null) => (
    <NavLink key={a.slug} href={`/apps/${a.slug}`}>
      <span className="side-app">
        {a.name}
        {sub && <span className="xs muted">{sub}</span>}
      </span>
      {a._count.posts ? <span className="badge warn">{a._count.posts}</span> : null}
    </NavLink>
  )
  return (
    <div className="shell">
      <aside className="side">
        <div className="logo">
          <i aria-hidden /> Promo Studio
        </div>
        <NavLink href="/" exact>
          Inicio
        </NavLink>
        <div className="label">Mis apps</div>
        {own.map((a) => item(a))}
        <NavLink href="/apps/nueva" exact>
          + Conectar app
        </NavLink>
        <div className="label">Clientes</div>
        {clients.map((a) => item(a, a.clientName && a.clientName !== a.name ? a.clientName : null))}
        <NavLink href="/apps/nueva?de=cliente" exact>
          + Conectar cuenta de cliente
        </NavLink>
        <div className="spacer" />
        <NavLink href="/guia">Guía de conexión</NavLink>
        <NavLink href="/configuracion">Configuración</NavLink>
      </aside>
      <main className="main">{children}</main>
    </div>
  )
}
