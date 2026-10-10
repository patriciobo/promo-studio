// Plantillas HTML de las piezas. El texto lo pone la plantilla (no el modelo de imagen) para que sea legible y de marca.
import { onColor, type Brand } from './brand'

export const SIZES = { feed: { w: 1080, h: 1350 }, story: { w: 1080, h: 1920 }, square: { w: 1080, h: 1080 } } as const

export const esc = (s = '') => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** `fonts`: familias extra de Google Fonts que usa un estilo (p. ej. "Anton" o "Fraunces:wght@400;700"). */
export function shell(b: Brand, w: number, h: number, css: string, body: string, fonts: string[] = []) {
  const families = [`${b.font}:wght@400;500;600;700;800`, ...fonts].map((f) => `family=${encodeURIComponent(f).replace(/%3A/g, ':').replace(/%40/g, '@').replace(/%3B/g, ';').replace(/%2C/g, ',')}`).join('&')
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${families}&display=block">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${w}px;height:${h}px;overflow:hidden}
body{font-family:'${b.font}',Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased;background:${b.bg};color:${b.ink}}
.brand{display:flex;align-items:center;gap:18px;font-weight:700;font-size:34px;letter-spacing:-.01em}
.brand img{width:56px;height:56px;border-radius:14px;object-fit:contain}
.eyebrow{font-size:30px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:${b.primary}}
h1{font-weight:800;letter-spacing:-.035em;line-height:1.04;text-wrap:balance}
p{text-wrap:pretty}
${css}
</style></head><body>${body}</body></html>`
}

export const brandRow = (b: Brand, color?: string) => `<div class="brand" style="${color ? `color:${color}` : ''}">${b.logo ? `<img src="${b.logo}">` : ''}<span>${esc(b.name)}</span></div>`

export interface SlideData {
  eyebrow?: string
  title: string
  body?: string
  items?: string[]
  index?: number
  total?: number
  /** data: URI de la imagen de fondo generada por IA. */
  background?: string
  /** data: URI de una captura de la app. */
  screenshot?: string
  /** data: URI de una ilustración generada por IA para esta diapositiva. */
  illustration?: string
}

/** Portada o imagen única: fondo generado a sangre, degradado y título grande. */
export function coverSlide(b: Brand, d: SlideData, size: { w: number; h: number } = SIZES.feed) {
  const bg = d.background
    ? `<img class="bg" src="${d.background}"><div class="shade"></div>`
    : `<div class="bg" style="background:radial-gradient(120% 80% at 80% 0%, ${b.accent}55, transparent 60%), ${b.primary}"></div>`
  const tall = size.h > 1500
  return shell(
    b,
    size.w,
    size.h,
    `.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.35) 0%,rgba(0,0,0,0) 28%,rgba(0,0,0,0) 45%,rgba(0,0,0,.82) 100%)}
.wrap{position:relative;height:100%;display:flex;flex-direction:column;padding:${tall ? '140px 88px 200px' : '80px 88px 88px'};color:#fff}
.wrap .eyebrow{color:#fff;opacity:.92;margin-bottom:22px}
h1{font-size:${tall ? 104 : 96}px;margin-top:auto}
.body{font-size:${tall ? 42 : 38}px;line-height:1.32;margin-top:28px;opacity:.94;max-width:900px}
.foot{display:flex;justify-content:space-between;margin-top:44px;font-size:28px;font-weight:600;opacity:.85}`,
    `${bg}<div class="wrap">${brandRow(b, '#fff')}<div style="margin-top:auto"></div>${d.eyebrow ? `<p class="eyebrow">${esc(d.eyebrow)}</p>` : ''}<h1 style="margin-top:0">${esc(d.title)}</h1>${d.body ? `<p class="body">${esc(d.body)}</p>` : ''}<div class="foot"><span>${esc(b.url)}</span>${d.total && d.total > 1 ? `<span>${(d.index ?? 0) + 1} / ${d.total}</span>` : ''}</div></div>`,
  )
}

/** Diapositiva de texto (lista numerada o un punto grande). */
export function textSlide(b: Brand, d: SlideData, size: { w: number; h: number } = SIZES.feed) {
  const tall = size.h > 1500
  const list = d.items?.length
    ? `<ol>${d.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`
    : ''
  const shot = d.screenshot ? `<div class="shot"><img src="${d.screenshot}"></div>` : d.illustration ? `<div class="illu"><img src="${d.illustration}"></div>` : ''
  return shell(
    b,
    size.w,
    size.h,
    `.wrap{height:100%;display:flex;flex-direction:column;padding:${tall ? '140px 88px 200px' : '84px 88px 72px'}}
.mid{margin:auto 0;display:flex;flex-direction:column}
.mid.with-shot{flex:1;margin:56px 0 0;min-height:0}
.wrap .eyebrow{margin:0 0 22px}
h1{font-size:${d.items?.length || shot ? 72 : 88}px}
.body{font-size:40px;line-height:1.35;margin-top:30px;color:${b.ink};opacity:.82}
ol{list-style:none;counter-reset:i;display:grid;gap:36px;margin-top:56px}
li{counter-increment:i;position:relative;padding-left:96px;font-size:48px;line-height:1.3;opacity:.88}
li::before{content:counter(i);position:absolute;left:0;top:0;width:62px;height:62px;border-radius:50%;display:grid;place-items:center;background:${b.primary};color:${onColor(b.primary)};font-size:32px;font-weight:700}
.shot{flex:1;min-height:0;display:flex;justify-content:center;align-items:flex-end;margin-top:40px}
.shot img{max-height:100%;max-width:70%;border-radius:36px;box-shadow:0 30px 70px -20px rgba(0,0,0,.35);border:10px solid ${b.ink}}
.illu{flex:1;min-height:0;margin-top:40px;border-radius:36px;overflow:hidden}
.illu img{width:100%;height:100%;object-fit:cover;display:block}
.foot{display:flex;justify-content:space-between;margin-top:auto;padding-top:36px;font-size:28px;font-weight:600;opacity:.6}`,
    `<div class="wrap">${brandRow(b)}<div class="mid${shot ? ' with-shot' : ''}">${d.eyebrow ? `<p class="eyebrow">${esc(d.eyebrow)}</p>` : ''}<h1>${esc(d.title)}</h1>${d.body ? `<p class="body">${esc(d.body)}</p>` : ''}${list}${shot}</div><div class="foot"><span>${esc(b.url)}</span>${d.total && d.total > 1 ? `<span>${(d.index ?? 0) + 1} / ${d.total}</span>` : ''}</div></div>`,
  )
}

/** Cierre con llamado a la acción en el color principal. */
export function ctaSlide(b: Brand, d: SlideData, size: { w: number; h: number } = SIZES.feed) {
  const fg = onColor(b.primary)
  const tall = size.h > 1500
  return shell(
    b,
    size.w,
    size.h,
    `body{background:${b.primary};color:${fg}}
.wrap{height:100%;display:flex;flex-direction:column;padding:${tall ? '140px 88px 200px' : '84px 88px 72px'}}
h1{font-size:104px;margin-top:auto}
.body{font-size:42px;line-height:1.32;margin-top:30px;opacity:.88}
.pill{display:inline-block;margin-top:52px;padding:26px 44px;border-radius:999px;background:${fg};color:${b.primary};font-size:36px;font-weight:700}
.foot{margin-top:56px;font-size:28px;font-weight:600;opacity:.75}`,
    `<div class="wrap">${brandRow(b, fg)}<h1>${esc(d.title)}</h1>${d.body ? `<p class="body">${esc(d.body)}</p>` : ''}<div><span class="pill">${esc(b.url)}</span></div><div class="foot">${d.total && d.total > 1 ? `${(d.index ?? 0) + 1} / ${d.total}` : ''}</div></div>`,
  )
}

/** Foto de perfil: logo centrado en el color de la marca, sin texto (se ve a 110 px). */
export function profilePhoto(b: Brand) {
  const fg = onColor(b.primary)
  return shell(
    b,
    1080,
    1080,
    `body{background:${b.primary};display:grid;place-items:center}
img{width:620px;height:620px;object-fit:contain}
.mono{font-size:420px;font-weight:800;color:${fg};letter-spacing:-.06em}`,
    b.logo ? `<img src="${b.logo}">` : `<div class="mono">${esc(b.name.slice(0, 1).toUpperCase())}</div>`,
  )
}

/** Portada de destacada (story 9:16 con una palabra centrada). */
export function highlightCover(b: Brand, label: string) {
  const fg = onColor(b.primary)
  return shell(
    b,
    1080,
    1920,
    `body{background:${b.primary};display:grid;place-items:center;color:${fg}}
.c{width:640px;height:640px;border-radius:50%;border:10px solid ${fg};display:grid;place-items:center;text-align:center;padding:60px}
span{font-size:84px;font-weight:750;letter-spacing:-.02em;line-height:1.05}`,
    `<div class="c"><span>${esc(label)}</span></div>`,
  )
}
