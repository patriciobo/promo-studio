// Paquete de marca de una alternativa (ZIP) para construir el sitio institucional: archivos y especificación.
import { requireUser } from '@/auth'
import { brandExport } from '@/lib/brand/export'
import { db } from '@/lib/db'
import { zip } from '@/lib/zip'

export async function GET(_req: Request, ctx: RouteContext<'/apps/[slug]/marca/exportar/[optionId]'>) {
  await requireUser()
  const { slug, optionId } = await ctx.params
  const app = await db.app.findUnique({ where: { slug }, include: { brand: true } })
  const option = app?.brand ? await db.brandOption.findFirst({ where: { id: optionId, projectId: app.brand.id } }) : null
  if (!app?.brand || !option) return new Response('No encontrado', { status: 404 })
  const { brand, ...rest } = app
  const body = zip(await brandExport({ ...brand, app: rest }, option))
  const name = `marca-${slug}-r${option.round}-${option.index + 1}.zip`
  return new Response(new Uint8Array(body), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } })
}
