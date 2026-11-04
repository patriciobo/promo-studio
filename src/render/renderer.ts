// Captura de plantillas con Chrome (puppeteer) y armado de reels con ffmpeg (clips de video generados o, en modo demo, escenas fijas).
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import puppeteer, { type Browser } from 'puppeteer-core'
import { env } from '@/lib/env'

const run = promisify(execFile)

// Un solo Chrome compartido por todas las tareas del proceso (el worker corre varias a la vez).
// Se cierra solo cuando queda un rato sin páginas abiertas: cerrarlo al terminar una tarea rompía las otras.
let browser: Promise<Browser> | null = null
let openPages = 0
let idleTimer: ReturnType<typeof setTimeout> | null = null
const IDLE_MS = 60_000

export function getBrowser() {
  browser ??= puppeteer.launch({
    executablePath: env.chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  })
  return browser
}

async function shutdown() {
  const b = browser
  browser = null
  if (b) await (await b).close().catch(() => {})
}

/**
 * Libera Chrome cuando ninguna tarea lo está usando. `force` (al apagar el worker) lo cierra igual.
 */
export async function closeBrowser(force = false) {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  if (force) return shutdown()
  if (openPages === 0) idleTimer = setTimeout(() => void (openPages === 0 && shutdown()), IDLE_MS)
}

/** HTML → JPEG (o PNG) del tamaño exacto. `transparent`: PNG sin fondo (texto para superponer a un video). */
export async function renderHtml(html: string, w: number, h: number, type: 'jpeg' | 'png' = 'jpeg', transparent = false): Promise<Buffer> {
  openPages++
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  let page
  try {
    page = await (await getBrowser()).newPage()
  } catch (e) {
    openPages--
    browser = null // Chrome se cayó: el próximo pedido lo relanza
    throw e
  }
  try {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 })
    await page.evaluate(() => document.fonts.ready)
    return Buffer.from(await page.screenshot({ type, quality: type === 'jpeg' ? 92 : undefined, omitBackground: transparent && type === 'png', clip: { x: 0, y: 0, width: w, height: h } }))
  } finally {
    await page.close().catch(() => {})
    openPages--
    if (openPages === 0) void closeBrowser()
  }
}

/**
 * Reel 1080×1920 en modo demo (sin modelo de video): escenas fijas (JPEG) con zoom lento en cada una y fundido entre escenas.
 * H.264 + AAC (música o silencio), yuv420p y faststart: lo que Instagram acepta sin reprocesar.
 */
export async function buildReel(scenes: Buffer[], opts: { secondsPerScene?: number; music?: Buffer } = {}): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'reel-'))
  try {
    const sec = opts.secondsPerScene ?? 3.5
    const fade = 0.5
    const fps = 30
    const frames = Math.round(sec * fps)
    const inputs: string[] = []
    for (let i = 0; i < scenes.length; i++) {
      const p = join(dir, `s${i}.jpg`)
      await writeFile(p, scenes[i])
      inputs.push('-i', p)
    }
    const parts = scenes.map((_, i) => `[${i}:v]scale=1188:2112,zoompan=z='min(zoom+0.0007,1.09)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${fps},format=yuv420p,setsar=1[v${i}]`)
    let last = 'v0'
    for (let i = 1; i < scenes.length; i++) {
      const out = i === scenes.length - 1 ? 'vout' : `x${i}`
      parts.push(`[${last}][v${i}]xfade=transition=fade:duration=${fade}:offset=${(sec - fade) * i}[${out}]`)
      last = out
    }
    if (scenes.length === 1) parts.push('[v0]null[vout]')
    const total = sec * scenes.length - fade * (scenes.length - 1)
    const audio: string[] = []
    if (opts.music) {
      const m = join(dir, 'music')
      await writeFile(m, opts.music)
      audio.push('-i', m)
      parts.push(`[${scenes.length}:a]atrim=0:${total},afade=t=out:st=${Math.max(0, total - 1.5)}:d=1.5[aout]`)
    } else {
      audio.push('-f', 'lavfi', '-t', String(total), '-i', 'anullsrc=r=44100:cl=stereo')
      parts.push(`[${scenes.length}:a]anull[aout]`)
    }
    const out = join(dir, 'reel.mp4')
    await run(env.ffmpegPath, ['-y', '-loglevel', 'error', ...inputs, ...audio, '-filter_complex', parts.join(';'), '-map', '[vout]', '-map', '[aout]', '-t', String(total), '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(fps), '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out], { maxBuffer: 1 << 26 })
    return await readFile(out)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** Formato común de todos los tramos: así se pueden unir sin volver a codificar. */
const SEGMENT = ['-c:v', 'libx264', '-profile:v', 'high', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2']
const FILL = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,format=yuv420p'

/** ¿El archivo trae pista de audio? (ffmpeg -i sin salida termina con error, pero lista las pistas). */
async function hasAudio(file: string) {
  const out = await run(env.ffmpegPath, ['-hide_banner', '-i', file], { maxBuffer: 1 << 22 }).then(
    (r) => r.stderr,
    (e: { stderr?: string }) => e.stderr ?? '',
  )
  return /Stream #\d+:\d+.*Audio:/.test(out)
}

/**
 * Reel final a partir de clips generados por un modelo de video: cada clip lleva su texto encima (PNG transparente),
 * se le suma una placa de cierre de marca y se unen. Audio: el de los clips si lo traen; si ninguno trae, la música
 * del promo.yaml (con fundido al final) o silencio. H.264 + AAC, yuv420p y faststart: lo que Instagram acepta.
 */
export async function composeReel(scenes: { clip: Buffer; overlay?: Buffer; start?: number; seconds?: number }[], endCard: Buffer, opts: { endSeconds?: number; music?: Buffer } = {}): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'reel-'))
  try {
    const parts: string[] = []
    let anyAudio = false
    for (const [i, s] of scenes.entries()) {
      const clip = join(dir, `clip${i}.mp4`)
      await writeFile(clip, s.clip)
      const audio = await hasAudio(clip)
      anyAudio ||= audio
      // Material real: se usa un tramo (desde `start`, `seconds` de largo); los clips generados van enteros.
      const inputs = [...(s.start ? ['-ss', String(s.start)] : []), ...(s.seconds ? ['-t', String(s.seconds)] : []), '-i', clip]
      let filter = `[0:v]${FILL}[base]`
      if (s.overlay) {
        const ov = join(dir, `ov${i}.png`)
        await writeFile(ov, s.overlay)
        inputs.push('-loop', '1', '-i', ov)
        // El texto entra con un fundido corto y queda hasta el final del clip.
        filter += `;[1:v]format=rgba,fps=30,fade=t=in:st=0:d=0.35:alpha=1[ov];[base][ov]overlay=0:0:shortest=1,format=yuv420p[v]`
      } else filter += ';[base]null[v]'
      const silence = s.overlay ? 2 : 1
      if (!audio) inputs.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo')
      const aMap = audio ? '0:a:0' : `${silence}:a`
      const out = join(dir, `seg${i}.mp4`)
      await run(env.ffmpegPath, ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '[v]', '-map', aMap, '-shortest', ...SEGMENT, out], { maxBuffer: 1 << 26 })
      parts.push(out)
    }
    const sec = opts.endSeconds ?? 2.5
    const card = join(dir, 'end.jpg')
    await writeFile(card, endCard)
    const end = join(dir, 'end.mp4')
    await run(env.ffmpegPath, ['-y', '-loglevel', 'error', '-loop', '1', '-t', String(sec), '-i', card, '-f', 'lavfi', '-t', String(sec), '-i', 'anullsrc=r=44100:cl=stereo', '-filter_complex', `[0:v]${FILL},fade=t=in:st=0:d=0.3[v]`, '-map', '[v]', '-map', '1:a', '-shortest', ...SEGMENT, end], { maxBuffer: 1 << 26 })
    parts.push(end)
    const list = join(dir, 'list.txt')
    await writeFile(list, parts.map((p) => `file '${p}'`).join('\n'))
    const joined = join(dir, 'joined.mp4')
    await run(env.ffmpegPath, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', joined], { maxBuffer: 1 << 26 })
    if (anyAudio || !opts.music) return await readFile(joined)
    const music = join(dir, 'music')
    await writeFile(music, opts.music)
    const total = await durationOf(joined)
    const out = join(dir, 'reel.mp4')
    await run(env.ffmpegPath, ['-y', '-loglevel', 'error', '-i', joined, '-i', music, '-filter_complex', `[1:a]atrim=0:${total},afade=t=out:st=${Math.max(0, total - 1.5)}:d=1.5,aresample=44100[a]`, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-t', String(total), '-movflags', '+faststart', out], { maxBuffer: 1 << 26 })
    return await readFile(out)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** Duración en segundos (de la salida de ffmpeg -i). */
async function durationOf(file: string) {
  return (await probeVideo(file)).duration ?? 15
}

/** Duración, tamaño y si es un video, leyendo la salida de ffmpeg -i (no hace falta ffprobe). */
export async function probeVideo(file: string): Promise<{ duration: number | null; width: number | null; height: number | null; video: boolean }> {
  const out = await run(env.ffmpegPath, ['-hide_banner', '-i', file], { maxBuffer: 1 << 22 }).then(
    (r) => r.stderr,
    (e: { stderr?: string }) => e.stderr ?? '',
  )
  const d = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(out)
  // La primera pista de video que no sea una imagen adjunta (portada embebida).
  const v = out.split('\n').find((l) => /Stream #.*Video:/.test(l) && !/attached pic/.test(l))
  const size = v ? /, (\d{2,5})x(\d{2,5})/.exec(v) : null
  return { duration: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : null, width: size ? Number(size[1]) : null, height: size ? Number(size[2]) : null, video: !!v }
}

/** Un cuadro del video como JPEG (la portada en la biblioteca y en las piezas que no son reels). */
export async function videoFrame(file: string, at = 1): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'frame-'))
  try {
    const out = join(dir, 'f.jpg')
    await run(env.ffmpegPath, ['-y', '-loglevel', 'error', '-ss', String(at), '-i', file, '-frames:v', '1', '-vf', "scale='min(1600,iw)':-2", '-q:v', '3', out], { maxBuffer: 1 << 22 })
    return await readFile(out)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** Cuatro cuadros repartidos en una grilla 2×2: para que el modelo de visión describa (y verifique) todo el video, no un instante. */
export async function contactSheet(file: string, duration: number): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'sheet-'))
  try {
    const frames: string[] = []
    for (const [i, f] of [0.1, 0.35, 0.6, 0.85].entries()) {
      const p = join(dir, `${i}.jpg`)
      await run(env.ffmpegPath, ['-y', '-loglevel', 'error', '-ss', String(Math.max(0, duration * f)), '-i', file, '-frames:v', '1', '-vf', 'scale=640:640:force_original_aspect_ratio=decrease,pad=640:640:(ow-iw)/2:(oh-ih)/2', p], { maxBuffer: 1 << 22 })
      frames.push(p)
    }
    const out = join(dir, 'sheet.jpg')
    await run(env.ffmpegPath, ['-y', '-loglevel', 'error', ...frames.flatMap((f) => ['-i', f]), '-filter_complex', '[0:v][1:v]hstack[a];[2:v][3:v]hstack[b];[a][b]vstack', '-q:v', '4', out], { maxBuffer: 1 << 22 })
    return await readFile(out)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
