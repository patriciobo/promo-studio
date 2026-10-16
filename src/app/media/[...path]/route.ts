// Media pública (Instagram la descarga desde acá). Sin login, sin redirecciones, con su content-type.
import { createReadStream, existsSync, statSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { downloadName, mediaPath, mimeOf, sniffMime } from '@/lib/media'

/** Primeros bytes del archivo, para saber qué es en realidad. */
async function head(file: string) {
  const fh = await open(file)
  try {
    const b = Buffer.alloc(1024)
    const { bytesRead } = await fh.read(b, 0, 1024, 0)
    return b.subarray(0, bytesRead)
  } finally {
    await fh.close()
  }
}

/** `?dl=nombre`: se descarga como archivo con ese nombre y la extensión de su contenido real. */
export async function GET(req: Request, ctx: RouteContext<'/media/[...path]'>) {
  const { path } = await ctx.params
  let file: string
  try {
    file = mediaPath(path.map(decodeURIComponent).join('/'))
  } catch {
    return new Response('Ruta inválida', { status: 400 })
  }
  if (!existsSync(file) || !statSync(file).isFile()) return new Response('No encontrado', { status: 404 })
  const dl = new URL(req.url).searchParams.get('dl')
  const type = (await head(file).then(sniffMime).catch(() => null)) ?? mimeOf(file)
  const disposition: Record<string, string> = dl ? { 'Content-Disposition': `attachment; filename="${downloadName(dl, type)}"` } : {}
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream
  return new Response(stream, {
    headers: { 'Content-Type': type, 'Content-Length': String(statSync(file).size), 'Cache-Control': 'public, max-age=31536000, immutable', ...disposition },
  })
}

export const HEAD = GET
