// Media pública (Instagram la descarga desde acá). Sin login, sin redirecciones, con su content-type.
import { createReadStream, existsSync, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import { mediaPath, mimeOf } from '@/lib/media'

export async function GET(_req: Request, ctx: RouteContext<'/media/[...path]'>) {
  const { path } = await ctx.params
  let file: string
  try {
    file = mediaPath(path.map(decodeURIComponent).join('/'))
  } catch {
    return new Response('Ruta inválida', { status: 400 })
  }
  if (!existsSync(file) || !statSync(file).isFile()) return new Response('No encontrado', { status: 404 })
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream
  return new Response(stream, {
    headers: { 'Content-Type': mimeOf(file), 'Content-Length': String(statSync(file).size), 'Cache-Control': 'public, max-age=31536000, immutable' },
  })
}

export const HEAD = GET
