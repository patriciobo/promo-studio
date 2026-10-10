// Muestras de estilo desde la terminal (lo mismo que los botones de Ajustes, sin pasar por el worker).
//   npm run styles:samples                         → las genéricas que faltan (~US$ 0,21 por estilo)
//   npm run styles:samples -- --only=retro         → un estilo
//   npm run styles:samples -- --app=mi-app --q=medium → con la marca de una app
//   npm run styles:samples -- --layouts --out=/tmp/x → sin IA: las 5 piezas de cada plantilla, para revisarlas
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Brand } from '@/templates/brand'
import { SIZES, type SlideData } from '@/templates/html'
import { TEMPLATES } from '@/templates/styles'
import { closeBrowser, renderHtml } from '@/render/renderer'
import { db } from '@/lib/db'
import type { ImageQuality } from '@/lib/models'
import { ALL_STYLES, generateSamples, samplesCost } from '@/lib/style-samples'
import { parseDesignStyle, SAMPLE_QUALITIES } from '@/lib/styles'

const args = new Map(process.argv.slice(2).map((a) => [a.replace(/^--/, '').split('=')[0], a.split('=')[1] ?? '1']))
const styles = args.get('only') ? [parseDesignStyle(args.get('only'))!].filter(Boolean) : ALL_STYLES
const qualities = args.get('q') ? (args.get('q')!.split(',') as ImageQuality[]) : SAMPLE_QUALITIES

async function layouts(out: string) {
  const brand: Brand = { name: 'Rumbo', primary: '#ff5a36', accent: '#ffb000', bg: '#fff7ef', ink: '#1c1a24', font: 'Inter', url: 'rumbo.app' }
  const fill = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000"><rect width="800" height="1000" fill="#9fb4c7"/><circle cx="560" cy="300" r="260" fill="#ffb000"/><circle cx="240" cy="700" r="300" fill="#ff5a36" opacity=".8"/></svg>')}`
  const cover: SlideData = { eyebrow: 'Finanzas personales', title: 'Ahorrá sin pensarlo', body: '3 hábitos automáticos que suman a fin de mes.', index: 0, total: 5, background: fill }
  const text: SlideData = { eyebrow: 'Paso a paso', title: 'Armá tu colchón en 30 días', items: ['Redondeá cada compra', 'Separá el 10% al cobrar', 'Revisá suscripciones'], index: 1, total: 5, illustration: fill }
  await mkdir(out, { recursive: true })
  for (const id of styles) {
    const t = TEMPLATES[id]
    const pieces = { cover: t.cover(brand, cover), text: t.text(brand, text), 'text-plain': t.text(brand, { ...text, items: undefined, illustration: undefined, body: 'Separá una parte apenas cobrás: lo que no ves, no lo gastás.' }), cta: t.cta(brand, { title: 'Empezá a ahorrar hoy', body: 'Gratis, en 2 minutos.', index: 4, total: 5 }), story: t.cover(brand, cover, SIZES.story) }
    for (const [name, html] of Object.entries(pieces)) {
      const size = name === 'story' ? SIZES.story : SIZES.feed
      await writeFile(join(out, `${id}-${name}.jpg`), await renderHtml(html, size.w, size.h))
    }
    console.log(`${id}: ok`)
  }
  await closeBrowser(true)
}

async function main() {
  if (args.has('layouts')) return layouts(args.get('out') ?? 'data/layouts')
  const slug = args.get('app')
  const app = slug ? await db.app.findUniqueOrThrow({ where: { slug } }) : undefined
  console.log(`${styles.length * qualities.length} muestras ${app ? `de ${app.name}` : 'genéricas'}, ~US$ ${samplesCost(styles, qualities, slug).toFixed(2)} (los fondos ya generados no se pagan de nuevo)`)
  const { cost } = await generateSamples({ app, styles, qualities, log: console.log })
  await closeBrowser(true)
  console.log(`Listo: US$ ${cost.toFixed(3)}`)
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
