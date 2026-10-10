// Lámina de una alternativa de identidad: logo, paleta, tipografías, voz, gráfico de apoyo y dos aplicaciones.
// Se renderiza a JPEG (1600×1000) para verla en la sección Identidad de marca y compartirla.
import type { PatternId } from '@/lib/brand/concepts'
import { onColor } from './brand'
import { esc } from './html'

export const BOARD = { w: 1600, h: 1000 } as const

export interface BoardData {
  brandName: string
  conceptName: string
  tagline: string
  palette: { hex: string; name: string; role: string }[]
  fonts: { display: string; text: string }
  voice?: { tone: string; sample: string }
  pattern: PatternId
  /** data: URI del logo (generado o del repo). Sin logo se muestra el nombre con la tipografía de títulos. */
  logo?: string
  /** data: URI del ícono (favicon, avatar). Sin ícono, el avatar usa el logo. */
  icon?: string
  /** Etiqueta chica arriba a la derecha (p. ej. "Alternativa 2 · ronda 1"). */
  label: string
}

/** Fondo CSS del gráfico de apoyo con dos colores de la paleta. */
export function patternCss(p: PatternId, a: string, b: string) {
  switch (p) {
    case 'puntos':
      return `background:${b};background-image:radial-gradient(${a} 22%,transparent 23%);background-size:44px 44px`
    case 'rayas':
      return `background:repeating-linear-gradient(135deg,${a} 0 18px,${b} 18px 44px)`
    case 'grilla':
      return `background:${b};background-image:linear-gradient(${a} 2px,transparent 2px),linear-gradient(90deg,${a} 2px,transparent 2px);background-size:48px 48px`
    case 'arcos':
      return `background:${b};background-image:radial-gradient(circle at 0 100%,transparent 38%,${a} 39%,${a} 47%,transparent 48%);background-size:96px 96px`
    case 'ondas':
      return `background:${b};background-image:radial-gradient(circle at 50% 0,transparent 30%,${a} 31%,${a} 41%,transparent 42%);background-size:72px 36px`
    case 'manchas':
      return `background:radial-gradient(40% 50% at 20% 30%,${a} 98%,transparent),radial-gradient(35% 40% at 75% 70%,${a}cc 98%,transparent),radial-gradient(25% 30% at 80% 15%,${a}88 98%,transparent),${b}`
    default:
      return `background:${b}`
  }
}

const family = (f: string) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;600;700;800`

export function brandBoardHtml(d: BoardData) {
  const pal = d.palette.length ? d.palette : [{ hex: '#222222', name: 'Tinta', role: 'texto' }]
  const role = (r: string) => pal.find((c) => c.role === r)?.hex
  const primary = role('principal') ?? pal[0].hex
  const bg = role('fondo') ?? '#f6f5f1'
  const ink = role('texto') ?? '#151515'
  const accent = role('acento') ?? pal.find((c) => c.hex !== primary && c.hex !== bg && c.hex !== ink)?.hex ?? primary
  const fonts = [...new Set([d.fonts.display, d.fonts.text])]
  const wordmark = (color: string, size: number) => `<span class="word" style="color:${color};font-size:${size}px">${esc(d.brandName)}</span>`
  const logo = (size: number, color = ink) => (d.logo ? `<img class="logo" src="${d.logo}" style="max-height:${size}px">` : wordmark(color, size * 0.45))
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fonts.map(family).join('&')}&display=block">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${BOARD.w}px;height:${BOARD.h}px;overflow:hidden}
body{background:${bg};color:${ink};font-family:'${d.fonts.text}',Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased;display:grid;grid-template-columns:620px 1fr;gap:28px;padding:40px}
.d{font-family:'${d.fonts.display}','${d.fonts.text}',system-ui,sans-serif}
.panel{border-radius:22px;overflow:hidden;position:relative}
.hero{background:#fff;display:grid;place-items:center;padding:48px;box-shadow:0 1px 0 rgba(0,0,0,.06)}
.logo{max-width:100%;object-fit:contain;display:block}
.word{font-family:'${d.fonts.display}',system-ui,sans-serif;font-weight:800;letter-spacing:-.03em;line-height:1}
.right{display:grid;grid-template-rows:auto auto 1fr auto;gap:22px;min-width:0}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px}
.top h1{font-size:64px;font-weight:800;letter-spacing:-.035em;line-height:1}
.top p{font-size:24px;opacity:.75;margin-top:10px;max-width:640px}
.tag{font-size:15px;letter-spacing:.08em;text-transform:uppercase;opacity:.6;white-space:nowrap;text-align:right}
.tag b{display:block;color:${primary};opacity:1;font-size:17px;margin-top:4px}
.palette{display:grid;grid-template-columns:repeat(${pal.length},1fr);gap:10px}
.sw{border-radius:16px;height:120px;padding:14px;display:flex;flex-direction:column;justify-content:flex-end;font-size:14px;border:1px solid rgba(0,0,0,.08)}
.sw b{font-size:16px}
.mid{display:grid;grid-template-columns:1.1fr 1fr;gap:22px;min-height:0}
.type{background:#fff;border-radius:16px;padding:24px;display:grid;gap:10px;align-content:start}
.type .aa{font-size:96px;font-weight:800;line-height:.9;color:${primary}}
.type small{font-size:14px;opacity:.6;letter-spacing:.06em;text-transform:uppercase}
.type p{font-size:19px;line-height:1.45}
.voice{border-radius:16px;padding:24px;background:${ink};color:${bg};display:grid;gap:12px;align-content:start}
.voice small{font-size:14px;opacity:.65;letter-spacing:.06em;text-transform:uppercase}
.voice q{font-size:24px;line-height:1.3}
.voice p{font-size:16px;opacity:.8}
.apps{display:grid;grid-template-columns:200px 1fr 220px;gap:22px;height:220px}
/* Avatar de redes: los logos generados vienen sobre blanco, así que va en un círculo blanco con borde del color principal. */
.avatar{border-radius:50%;background:#fff;border:8px solid ${primary};display:grid;place-items:center;overflow:hidden;width:200px;height:200px;align-self:center}
.avatar img{max-width:78%;max-height:78%;object-fit:contain}
.avatar.icon{border:0}
.avatar.icon img{max-width:100%;max-height:100%;width:100%;height:100%;object-fit:cover}
.card{border-radius:16px;background:${primary};color:${onColor(primary)};padding:26px;display:flex;flex-direction:column;justify-content:space-between}
.card .word{color:${onColor(primary)};font-size:40px}
.card span{font-size:16px;opacity:.85}
.pattern{border-radius:16px;${patternCss(d.pattern, accent, bg === accent ? primary : bg)}}
</style></head><body>
<div class="panel hero">${logo(380)}</div>
<div class="right">
  <div class="top"><div><h1 class="d">${esc(d.brandName)}</h1>${d.tagline ? `<p>${esc(d.tagline)}</p>` : ''}</div><div class="tag">${esc(d.label)}<b>${esc(d.conceptName)}</b></div></div>
  <div class="palette">${pal.map((c) => `<div class="sw" style="background:${c.hex};color:${onColor(c.hex)}"><b>${esc(c.name || c.role)}</b>${c.hex.toUpperCase()} · ${esc(c.role)}</div>`).join('')}</div>
  <div class="mid">
    <div class="type"><small>Títulos · ${esc(d.fonts.display)}</small><div class="aa d">Aa Bb 123</div><small>Textos · ${esc(d.fonts.text)}</small><p>${esc(d.tagline || d.voice?.sample || 'Así se ven los textos de la marca en redes, la web y las piezas impresas.')}</p></div>
    ${d.voice ? `<div class="voice"><small>Tono de voz</small><q>${esc(d.voice.sample)}</q><p>${esc(d.voice.tone)}</p></div>` : `<div class="pattern"></div>`}
  </div>
  <div class="apps">
    ${d.icon ? `<div class="avatar icon"><img src="${d.icon}"></div>` : `<div class="avatar">${d.logo ? `<img src="${d.logo}">` : wordmark(primary, 34)}</div>`}
    <div class="card">${wordmark(onColor(primary), 40)}<span>${esc(d.tagline || d.conceptName)}</span></div>
    <div class="pattern"></div>
  </div>
</div>
</body></html>`
}
