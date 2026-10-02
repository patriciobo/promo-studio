// Página pública de links de cada app (el link de la bio). Los clics pasan por /go para contarlos.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import type { Manifest } from '@/lib/manifest'
import { mediaSrc } from '@/lib/media'
import { existsSync } from 'node:fs'
import { extname } from 'node:path'
import { mediaPath } from '@/lib/media'

async function load(slug: string) {
  const app = await db.app.findUnique({ where: { slug } })
  if (!app?.manifest) return null
  return { app, m: app.manifest as unknown as Manifest }
}

export async function generateMetadata({ params }: PageProps<'/l/[slug]'>): Promise<Metadata> {
  const r = await load((await params).slug)
  return r ? { title: r.m.name, description: r.m.tagline } : {}
}

export default async function LinkPage({ params }: PageProps<'/l/[slug]'>) {
  const { slug } = await params
  const r = await load(slug)
  if (!r) notFound()
  const { app, m } = r
  const logoRel = m.brand.logo ? `apps/${app.slug}/logo${extname(m.brand.logo) || '.png'}` : null
  const logo = logoRel && existsSync(mediaPath(logoRel)) ? mediaSrc(logoRel) : null
  const links = [{ label: `Abrir ${m.name}`, url: m.url }, ...m.links]
  const primary = m.brand.colors[0]
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16, background: 'var(--bg)' }}>
      <div className="stack" style={{ width: 'min(440px, 100%)', textAlign: 'center', alignItems: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo && <img src={logo} alt="" width={84} height={84} style={{ borderRadius: 22 }} />}
        <h1>{m.name}</h1>
        <p className="muted">{m.tagline}</p>
        <div className="stack" style={{ width: '100%', marginTop: 8 }}>
          {links.map((l, i) => (
            <a key={l.url} className="btn block" href={`/l/${slug}/go?to=${encodeURIComponent(l.url)}`} style={i === 0 ? { background: primary, borderColor: primary, color: '#fff', height: 48 } : { height: 48 }}>
              {l.label}
            </a>
          ))}
        </div>
      </div>
    </main>
  )
}
