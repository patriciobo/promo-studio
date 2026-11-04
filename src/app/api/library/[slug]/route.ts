// Subida de videos a la biblioteca de una app. Va por acá (y no por una server action) porque un video de celular pasa
// fácil los 40 MB que aceptan las acciones: el archivo llega crudo en el cuerpo (PUT) y se escribe a disco en streaming.
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { requireUser } from '@/auth'
import { db } from '@/lib/db'
import { mediaPath } from '@/lib/media'
import { addUploadedVideo } from '@/lib/stock'

const MAX_VIDEO_BYTES = 300 * 1024 * 1024
const TYPES: Record<string, string> = { 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm' }

export async function PUT(req: Request, ctx: RouteContext<'/api/library/[slug]'>) {
  try {
    await requireUser()
  } catch {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { slug } = await ctx.params
  const app = await db.app.findUnique({ where: { slug }, select: { id: true, slug: true } })
  if (!app) return Response.json({ error: 'App inexistente' }, { status: 404 })
  const ext = TYPES[(req.headers.get('content-type') ?? '').split(';')[0]]
  if (!ext) return Response.json({ error: 'Formato no soportado: MP4, MOV o WebM' }, { status: 415 })
  if (Number(req.headers.get('content-length') ?? 0) > MAX_VIDEO_BYTES) return Response.json({ error: 'El video pasa los 300 MB' }, { status: 413 })
  if (!req.body) return Response.json({ error: 'Sin archivo' }, { status: 400 })
  const note = new URL(req.url).searchParams.get('note')?.slice(0, 500) ?? null
  try {
    const img = await addUploadedVideo(app, ext, note, async (rel) => {
      const file = mediaPath(rel)
      await mkdir(dirname(file), { recursive: true })
      let n = 0
      const limit = new Transform({
        transform(chunk: Buffer, _enc, done) {
          n += chunk.length
          done(n > MAX_VIDEO_BYTES ? new Error('El video pasa los 300 MB') : null, chunk)
        },
      })
      await pipeline(Readable.fromWeb(req.body as never), limit, createWriteStream(file))
    })
    return Response.json({ id: img.id })
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 })
  }
}
