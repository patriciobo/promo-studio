import { ProfileKitPanel } from '@/components/panels'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import type { ProfileKit } from '@/lib/onboarding/profile-kit'
import { daysAgo } from '@/lib/view'

const TIPS = [
  'Horario fijo y mezcla de formatos: reels para llegar a quien no te sigue, carruseles para guardados, stories para tus seguidores.',
  'Gancho en la primera línea, 3–5 hashtags específicos (no 30) y palabras clave en la descripción y en el texto alternativo: Instagram los usa en la búsqueda.',
  'Respondé los comentarios en la primera hora: te llega un aviso por WhatsApp cuando se publica.',
  'Fijá 3 posts: qué es la app, el de mejor puntaje y uno de prueba social. Actualizalos cada mes según Rendimiento.',
  'Invitá colaboradores (clubes, creadores del rubro) en los posts que encajen: el post aparece en las dos cuentas.',
  'Cuentas nuevas: 2–3 publicaciones por semana las primeras 2 semanas, después el ritmo completo.',
]

export default async function ProfilePage({ params }: PageProps<'/apps/[slug]/perfil'>) {
  const { slug } = await params
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const hits = await db.linkHit.groupBy({ by: ['target'], where: { appId: app.id, createdAt: { gte: daysAgo(30) } }, _count: true })
  return (
    <div className="stack" style={{ gap: 20 }}>
      <p className="notice">
        La API de Instagram no permite cambiar la foto, el nombre, la bio ni el link del perfil. El kit los deja listos para copiar; marcá cada uno cuando lo apliques desde el teléfono.
      </p>
      {app.manifest ? <ProfileKitPanel slug={slug} mediaBase={`${env.publicUrl}/media`} initialKit={(app.profileKit as unknown as ProfileKit | null) ?? null} initialDone={(app.profileKitDone as Record<string, boolean> | null) ?? {}} /> : <p className="notice warn">Primero hace falta un promo.yaml válido.</p>}
      <section className="card stack">
        <h2>Clics en la página de links (30 días)</h2>
        {hits.length ? (
          <table>
            <tbody>
              {hits.map((h) => (
                <tr key={h.target}>
                  <td className="small">{h.target}</td>
                  <td className="num">{h._count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="small muted">Todavía sin clics.</p>
        )}
      </section>
      <section className="card stack">
        <h2>Para mejorar el alcance</h2>
        <ul className="stack-sm small" style={{ margin: 0, paddingLeft: 18 }}>
          {TIPS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
