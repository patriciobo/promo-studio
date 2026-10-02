// Captura de plantillas con Chrome (puppeteer) y armado de reels con ffmpeg.
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import puppeteer, { type Browser } from 'puppeteer-core'
import { env } from '@/lib/env'

const run = promisify(execFile)

let browser: Promise<Browser> | null = null
export function getBrowser() {
  browser ??= puppeteer.launch({
    executablePath: env.chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  })
  return browser
}

export async function closeBrowser() {
  if (browser) (await browser).close()
  browser = null
}

/** HTML → JPEG (o PNG) del tamaño exacto. */
export async function renderHtml(html: string, w: number, h: number, type: 'jpeg' | 'png' = 'jpeg'): Promise<Buffer> {
  const page = await (await getBrowser()).newPage()
  try {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 })
    await page.evaluate(() => document.fonts.ready)
    return Buffer.from(await page.screenshot({ type, quality: type === 'jpeg' ? 92 : undefined, clip: { x: 0, y: 0, width: w, height: h } }))
  } finally {
    await page.close()
  }
}

/**
 * Reel 1080×1920 a partir de escenas (JPEG): zoom lento en cada una y fundido entre escenas.
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
