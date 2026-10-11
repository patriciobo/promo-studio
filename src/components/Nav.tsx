'use client'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

/** `exact` compara también la query (para distinguir /apps/nueva de /apps/nueva?de=cliente). */
export function NavLink({ href, children, exact }: { href: string; children: React.ReactNode; exact?: boolean }) {
  const path = usePathname()
  const query = useSearchParams().toString()
  const active = exact ? (query ? `${path}?${query}` : path) === href : path === href || path.startsWith(`${href}/`)
  return (
    <Link href={href} aria-current={active ? 'page' : undefined}>
      {children}
    </Link>
  )
}

export function Tabs({ items }: { items: { href: string; label: string; count?: number }[] }) {
  const path = usePathname()
  return (
    <nav className="tabs">
      {items.map((t, i) => (
        <Link key={t.href} href={t.href} aria-current={(i === 0 ? path === t.href : path.startsWith(t.href)) ? 'page' : undefined}>
          {t.label}
          {t.count ? <span className="badge warn" style={{ marginLeft: 6 }}>{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  )
}
