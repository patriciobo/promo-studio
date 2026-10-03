// Kit de perfil: la API no permite cambiar foto, nombre, bio ni link, así que se entregan listos para copiar.
import { renderHtml } from '@/render/renderer'
import { highlightCover, profilePhoto } from '@/templates/html'
import { db } from '../db'
import { saveMedia } from '../media'
import { completeJson } from '../openrouter'
import { brandOf, manifestOf } from '../pipeline'
import { env } from '../env'

export interface ProfileKit {
  names: string[]
  bios: string[]
  category: string
  highlights: string[]
  link: string
  photo: string // ruta en media
  highlightCovers: { label: string; path: string }[]
}

export async function buildProfileKit(appId: string): Promise<ProfileKit> {
  const app = await db.app.findUniqueOrThrow({ where: { id: appId } })
  const m = manifestOf(app)
  const brand = await brandOf(app)
  const r = await completeJson<{ names: string[]; bios: string[]; category: string; highlights: string[] }>({
    appId,
    model: app.textModel,
    purpose: 'kit de perfil',
    maxTokens: 4000, // los modelos que razonan gastan parte en pensar: con poco margen el JSON llega cortado
    system: `You optimize Instagram business profiles for discovery. Write in ${m.languages[0]} with tone: ${m.tone}. Answer only JSON {"names":[3 strings],"bios":[3 strings],"category":string,"highlights":[4 short labels]}.
names: the searchable Name field (max 30 chars): brand + main keyword (e.g. "Mi Tenis · Entrenamiento tenis"). bios: max 150 chars each, value proposition + who it is for + call to action, at most 2 emojis, no hashtags. highlights: 1-2 word labels like "Qué es", "Cómo usar", "Novedades", "Preguntas".`,
    user: JSON.stringify({ name: m.name, tagline: m.tagline, description: m.description, audience: m.audience, features: m.features, cta: m.cta }),
  })
  const photo = await saveMedia(`apps/${app.slug}/kit/perfil.png`, await renderHtml(profilePhoto(brand), 1080, 1080, 'png'))
  const highlightCovers = []
  for (const label of r.highlights.slice(0, 5)) {
    const path = await saveMedia(`apps/${app.slug}/kit/destacada-${label.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '-')}.jpg`, await renderHtml(highlightCover(brand, label), 1080, 1920))
    highlightCovers.push({ label, path })
  }
  return {
    names: r.names.map((n) => n.slice(0, 30)),
    bios: r.bios.map((b) => b.slice(0, 150)),
    category: r.category,
    highlights: r.highlights,
    link: `${env.publicUrl}/l/${app.slug}`,
    photo,
    highlightCovers,
  }
}
