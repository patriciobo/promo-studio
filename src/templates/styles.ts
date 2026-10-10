// Plantillas de cada estilo de diseño (catálogo en src/lib/styles.ts). Mismo contrato que las clásicas de html.ts:
// portada (imagen a sangre o recuadro), diapositiva de texto (con ilustración o captura) y cierre con llamado a la acción.
import type { DesignStyleId } from '@/lib/styles'
import { lum, onColor, type Brand } from './brand'
import { brandRow, coverSlide, ctaSlide, esc, shell, SIZES, textSlide, type SlideData } from './html'

type Size = { w: number; h: number }
type Render = (b: Brand, d: SlideData, size?: Size) => string
export interface StyleTemplates {
  cover: Render
  text: Render
  cta: Render
}

const counter = (d: SlideData) => (d.total && d.total > 1 ? `${(d.index ?? 0) + 1} / ${d.total}` : '')
const pad2 = (n: number) => String(n).padStart(2, '0')
/** Tamaño del título según el largo: los estilos de letra grande no pueden desbordar. */
const fit = (text: string, sizes: [number, number, number, number]) => (text.length <= 22 ? sizes[0] : text.length <= 40 ? sizes[1] : text.length <= 60 ? sizes[2] : sizes[3])
const media = (d: SlideData) => (d.screenshot ? { src: d.screenshot, shot: true } : d.illustration ? { src: d.illustration, shot: false } : null)
const opt = (v: string | undefined, html: (s: string) => string) => (v ? html(esc(v)) : '')
const items = (d: SlideData, li: (x: string, i: number) => string) => (d.items?.length ? `<ol>${d.items.map((x, i) => li(esc(x), i)).join('')}</ol>` : '')
/** Un color de la marca que se lea sobre fondo oscuro (o blanco hueso si no hay). */
const bright = (b: Brand) => [b.primary, b.accent].find((c) => lum(c) > 0.12) ?? '#f4f2ec'
const GRAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='.22'/></svg>")`
const grain = `body::after{content:'';position:absolute;inset:0;background:${GRAIN};mix-blend-mode:multiply;pointer-events:none;z-index:50}`

// ---------------------------------------------------------------------------
// Tipografía XL: póster negro, letra condensada enorme, color de marca como neón.
// ---------------------------------------------------------------------------
const posterBase = (b: Brand, tall: boolean) => {
  const p = bright(b)
  return `body{background:#0e0e0e;color:#f4f2ec}
h1{font-family:'Anton',sans-serif;font-weight:400;text-transform:uppercase;letter-spacing:0;line-height:.92}
.wrap{position:relative;height:100%;display:flex;flex-direction:column;padding:${tall ? '130px 72px 190px' : '68px 72px 84px'}}
.top{display:flex;justify-content:space-between;align-items:center;font-size:28px;font-weight:700;letter-spacing:.1em;position:relative;z-index:2}
.tag{display:inline-block;background:${p};color:${onColor(p)};font-size:30px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:10px 18px;margin-bottom:26px}
.body{font-size:38px;line-height:1.3;margin-top:28px;opacity:.82;max-width:900px}
.bar{position:absolute;left:0;bottom:0;height:18px;width:38%;background:${p}}
.hl{color:${p}}`
}

const poster: StyleTemplates = {
  cover(b, d, size = SIZES.feed) {
    const tall = size.h > 1500
    const p = bright(b)
    const pic = d.background
      ? `<div class="pic"><img src="${d.background}"><div class="tint"></div><div class="fade"></div></div>`
      : `<div class="pic"><div class="tint" style="opacity:.25"></div><div class="fade"></div></div>`
    return shell(
      b,
      size.w,
      size.h,
      `${posterBase(b, tall)}
.pic{position:absolute;left:0;right:0;top:0;height:${tall ? 62 : 60}%;overflow:hidden}
.pic img{width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.2)}
.tint{position:absolute;inset:0;background:${p};mix-blend-mode:multiply;opacity:.85}
.fade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(14,14,14,.55) 0%,rgba(14,14,14,0) 22%,rgba(14,14,14,0) 60%,#0e0e0e 100%)}
.bottom{margin-top:auto;position:relative}
h1{font-size:${fit(d.title, tall ? [200, 160, 128, 104] : [180, 144, 116, 96])}px}`,
      `${pic}<div class="wrap"><div class="top">${brandRow(b, '#f4f2ec')}<span>${counter(d)}</span></div><div class="bottom">${opt(d.eyebrow, (s) => `<span class="tag">${s}</span>`)}<h1>${esc(d.title)}</h1>${opt(d.body, (s) => `<p class="body">${s}</p>`)}</div></div><div class="bar"></div>`,
      ['Anton'],
    )
  },
  text(b, d, size = SIZES.feed) {
    const tall = size.h > 1500
    const p = bright(b)
    const m = media(d)
    return shell(
      b,
      size.w,
      size.h,
      `${posterBase(b, tall)}
.num{font-family:'Anton';font-size:${m ? 170 : 240}px;line-height:.85;color:transparent;-webkit-text-stroke:3px ${p};margin:${m ? 36 : 60}px 0 24px}
h1{font-size:${fit(d.title, m || d.items?.length ? [112, 92, 76, 64] : [150, 124, 100, 84])}px}
ol{list-style:none;margin-top:44px;display:grid}
li{font-size:42px;line-height:1.25;padding:22px 0;border-top:2px solid #ffffff26;display:flex;gap:24px}
li b{color:${p};font-family:'Anton';font-weight:400}
.media{flex:1;min-height:0;margin-top:40px;display:flex;justify-content:center}
.media img{width:100%;height:100%;object-fit:cover;border:5px solid ${p}}
.media.shot img{width:auto;max-width:72%;object-fit:contain;border-radius:28px;border-width:8px}`,
      `<div class="wrap"><div class="top">${brandRow(b, '#f4f2ec')}<span>${counter(d)}</span></div>${d.total && d.total > 1 ? `<div class="num">${pad2((d.index ?? 0) + 1)}</div>` : '<div style="height:60px"></div>'}${opt(d.eyebrow, (s) => `<div><span class="tag">${s}</span></div>`)}<h1>${esc(d.title)}</h1>${opt(d.body, (s) => `<p class="body">${s}</p>`)}${items(d, (x) => `<li><b>→</b><span>${x}</span></li>`)}${m ? `<div class="media${m.shot ? ' shot' : ''}"><img src="${m.src}"></div>` : ''}</div><div class="bar"></div>`,
      ['Anton'],
    )
  },
  cta(b, d, size = SIZES.feed) {
    const tall = size.h > 1500
    const p = bright(b)
    const fg = onColor(p)
    return shell(
      b,
      size.w,
      size.h,
      `${posterBase(b, tall)}
body{background:${p};color:${fg}}
h1{font-size:${fit(d.title, [190, 150, 120, 100])}px;margin-top:auto}
.url{display:inline-block;margin-top:48px;background:#0e0e0e;color:${p};font-size:40px;font-weight:800;padding:24px 34px;letter-spacing:.02em}`,
      `<div class="wrap"><div class="top">${brandRow(b, fg)}<span>${counter(d)}</span></div><h1>${esc(d.title)}</h1>${opt(d.body, (s) => `<p class="body">${s}</p>`)}<div><span class="url">${esc(b.url)} →</span></div></div>`,
      ['Anton'],
    )
  },
}

// ---------------------------------------------------------------------------
// Revista: papel crema, serif, foto enmarcada con epígrafe, doble filete.
// ---------------------------------------------------------------------------
const SERIF = 'Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..700'
const editorialBase = (b: Brand, tall: boolean) => `body{background:#f2ede3;color:#1b1a17}
h1{font-family:'Fraunces',serif;font-weight:500;letter-spacing:-.02em;line-height:1.03}
.wrap{height:100%;display:flex;flex-direction:column;padding:${tall ? '130px 80px 190px' : '70px 80px 70px'}}
.mast{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:16px;border-bottom:7px double #1b1a17;font-size:26px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}
.mast .brand{font-size:28px;letter-spacing:.16em;text-transform:uppercase}
.mast .brand img{width:44px;height:44px}
.kicker{font-size:26px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:${b.primary};margin:36px 0 18px}
.body{font-family:'Fraunces',serif;font-size:36px;line-height:1.42;margin-top:26px;color:#3a3833}
.foot{display:flex;justify-content:space-between;margin-top:auto;padding-top:22px;border-top:2px solid #1b1a17;font-size:24px;font-weight:600;letter-spacing:.12em;text-transform:uppercase}
figure{margin-top:34px}
figure img{width:100%;height:100%;object-fit:cover;display:block}
figcaption{font-family:'Fraunces',serif;font-style:italic;font-size:24px;color:#6b665c;margin-top:12px}`
const mast = (b: Brand, d: SlideData) => `<div class="mast">${brandRow(b)}<span>Nº ${pad2((d.index ?? 0) + 1)}</span></div>`

const editorial: StyleTemplates = {
  cover(b, d, size = SIZES.feed) {
    const tall = size.h > 1500
    return shell(
      b,
      size.w,
      size.h,
      `${editorialBase(b, tall)}
figure{height:${tall ? 900 : 610}px}
h1{font-size:${fit(d.title, d.background ? [104, 88, 74, 62] : [150, 124, 104, 88])}px${d.background ? '' : ';margin-top:auto'}}`,
      `<div class="wrap">${mast(b, d)}${d.background ? `<figure style="height:${tall ? 900 : 610}px"><img src="${d.background}"></figure>` : ''}${opt(d.eyebrow, (s) => `<p class="kicker">${s}</p>`)}<h1>${esc(d.title)}</h1>${opt(d.body, (s) => `<p class="body">${s}</p>`)}<div class="foot"><span>${esc(b.url)}</span><span>${counter(d)}</span></div></div>`,
      [SERIF],
    )
  },
  text(b, d, size = SIZES.feed) {
    const tall = size.h > 1500
    const m = media(d)
    return shell(
      b,
      size.w,
      size.h,
      `${editorialBase(b, tall)}
h1{font-size:${fit(d.title, m || d.items?.length ? [92, 78, 66, 56] : [120, 100, 84, 72])}px}
.body::first-letter{font-family:'Fraunces';font-weight:600;float:left;font-size:122px;line-height:.85;padding:8px 14px 0 0;color:${b.primary}}
ol{list-style:none;margin-top:36px}
li{display:flex;gap:26px;font-size:38px;line-height:1.32;padding:22px 0;border-top:1px solid #1b1a1733}
li i{font-family:'Fraunces';font-size:44px;color:${b.primary};min-width:48px}
figure{flex:1;min-height:0;display:flex;flex-direction:column}
figure .frame{flex:1;min-height:0;display:flex;justify-content:center}
figure.shot img{width:auto;max-width:70%;object-fit:contain;border:2px solid #1b1a17}`,
      `<div class="wrap">${mast(b, d)}${opt(d.eyebrow, (s) => `<p class="kicker">${s}</p>`)}${d.eyebrow ? '' : '<div style="height:40px"></div>'}<h1>${esc(d.title)}</h1>${opt(d.body, (s) => `<p class="body">${s}</p>`)}${items(d, (x, i) => `<li><i>${['i', 'ii', 'iii', 'iv', 'v', 'vi'][i] ?? i + 1}.</i><span>${x}</span></li>`)}${m ? `<figure class="${m.shot ? 'shot' : ''}"><div class="frame"><img src="${m.src}"></div></figure>` : ''}<div class="foot"><span>${esc(b.url)}</span><span>${counter(d)}</span></div></div>`,
      [SERIF],
    )
  },
  cta(b, d, size = SIZES.feed) {
    const tall = size.h > 1500
    return shell(
      b,
      size.w,
      size.h,
      `${editorialBase(b, tall)}
.c{margin:auto 0;text-align:center}
h1{font-style:italic;font-size:${fit(d.title, [130, 108, 90, 76])}px}
.rule{width:160px;height:3px;background:#1b1a17;margin:44px auto}
.url{font-family:'Fraunces',serif;font-size:48px;color:${b.primary};text-decoration:underline;text-underline-offset:10px;text-decoration-thickness:3px}`,
      `<div class="wrap">${mast(b, d)}<div class="c"><h1>${esc(d.title)}</h1>${opt(d.body, (s) => `<p class="body">${s}</p>`)}<div class="rule"></div><span class="url">${esc(b.url)}</span></div><div class="foot"><span>${esc(b.name)}</span><span>${counter(d)}</span></div></div>`,
      [SERIF],
    )
  },
}

// ---------------------------------------------------------------------------
// Minimal blanco: mucho aire, filetes finos, imagen chica en tarjeta.
// ---------------------------------------------------------------------------
const papelBase = (b: Brand, tall: boolean) => `body{background:#ffffff;color:${b.ink}}
h1{font-weight:650;letter-spacing:-.035em;line-height:1.06}
.wrap{height:100%;display:flex;flex-direction:column;padding:${tall ? '140px 88px 200px' : '84px 88px 76px'}}
.top{display:flex;justify-content:space-between;align-items:center;font-size:26px;color:#8a8f98}
.top .brand{color:${b.ink};font-size:30px}
.pill{display:inline-block;border:2px solid ${b.primary};color:${b.primary};border-radius:999px;padding:8px 22px;font-size:26px;font-weight:600;margin-bottom:26px}
.body{font-size:36px;line-height:1.45;margin-top:26px;color:#5d636c}
.foot{display:flex;justify-content:space-between;align-items:center;margin-top:auto;padding-top:28px;border-top:1px solid #e6e7ea;font-size:26px;color:#8a8f98}
.arrow{width:72px;height:72px;border-radius:50%;background:${b.primary};color:${onColor(b.primary)};display:grid;place-items:center;font-size:34px}
.card{border-radius:32px;overflow:hidden;background:#f4f5f7}
.card img{width:100%;height:100%;object-fit:cover;display:block}`

const papel: StyleTemplates = {
  cover(b, d, size = SIZES.feed) {
    const tall = size.h > 1500
    return shell(
      b,
      size.w,
      size.h,
      `${papelBase(b, tall)}
.card{height:${tall ? 860 : 560}px;margin-top:56px}
.mid{margin-top:auto}
h1{font-size:${fit(d.title, [100, 86, 72, 62])}px}`,
      `<div class="wrap"><div class="top">${brandRow(b)}<span>${counter(d)}</span></div>${d.background ? `<div class="card"><img src="${d.background}"></div>` : ''}<div class="mid">${opt(d.eyebrow, (s) => `<span class="pill">${s}</span>`)}<h1>${esc(d.title)}</h1>${opt(d.body, (s) => `<p class="body">${s}</p>`)}</div><div class="foot"><span>${esc(b.url)}</span><span class="arrow">→</span></div></div>`,
    )
  },
  text(b, d, size = SIZES.feed) {
    const tall = size.h > 1500
    const m = media(d)
    return shell(
      b,
      size.w,
      size.h,
      `${papelBase(b, tall)}

.mid{margin-top:${m ? '64px' : 'auto'};${m ? 'flex:1;min-height:0;display:flex;flex-direction:column' : 'margin-bottom:auto'}}
h1{font-size:${fit(d.title, m || d.items?.length ? [80, 70, 60, 52] : [100, 86, 72, 62])}px}
ol{list-style:none;margin-top:40px}
li{display:flex;gap:26px;align-items:flex-start;font-size:40px;line-height:1.32;padding:26px 0;border-top:1px solid #e6e7ea}
li:last-child{border-bottom:1px solid #e6e7ea}
li b{flex:none;width:44px;height:44px;margin-top:4px;border-radius:50%;border:2px solid ${b.primary};color:${b.primary};display:grid;place-items:center;font-size:24px}
.card{flex:1;min-height:0;margin-top:44px}
.card.shot{background:#f4f5f7;display:flex;justify-content:center;align-items:flex-end;padding:44px 0 0}
.card.shot img{width:auto;max-width:62%;object-fit:contain;border-radius:28px 28px 0 0;box-shadow:0 20px 60px -20px rgba(0,0,0,.25)}`,
      `<div class="wrap"><div class="top">${brandRow(b)}<span>${counter(d)}</span></div><div class="mid">${opt(d.eyebrow, (s) => `<div><span class="pill">${s}</span></div>`)}<h1>${esc(d.title)}</h1>${opt(d.body, (s) => `<p class="body">${s}</p>`)}${items(d, (x) => `<li><b>✓</b><span>${x}</span></li>`)}${m ? `<div class="card${m.shot ? ' shot' : ''}"><img src="${m.src}"></div>` : ''}</div><div class="foot"><span>${esc(b.url)}</span><span>${counter(d) ? 'deslizá →' : ''}</span></div></div>`,
    )
  },
  cta(b, d, size = SIZES.feed) {
    const tall = size.h > 1500
    return shell(
      b,
      size.w,
      size.h,
      `${papelBase(b, tall)}
.mid{margin:auto 0}
h1{font-size:${fit(d.title, [116, 96, 80, 68])}px}
.go{display:flex;align-items:center;gap:30px;margin-top:60px;font-size:40px;font-weight:600}
.go .arrow{width:120px;height:120px;font-size:52px}`,
      `<div class="wrap"><div class="top">${brandRow(b)}<span>${counter(d)}</span></div><div class="mid"><h1>${esc(d.title)}</h1>${opt(d.body, (s) => `<p class="body">${s}</p>`)}<div class="go"><span class="arrow">→</span><span>${esc(b.url)}</span></div></div></div>`,
    )
  },
}

// ---------------------------------------------------------------------------
// Collage: papel kraft, polaroid con cinta, títulos en recortes, marcador.
// ---------------------------------------------------------------------------
const collageBase = (b: Brand, tall: boolean) => `body{background:#e8dcc6;color:#1d1a16;position:relative}
${grain}
h1{font-family:'Archivo Black',sans-serif;font-weight:400;letter-spacing:-.01em;line-height:1.32;transform:rotate(-1.5deg);transform-origin:left}
h1 span{background:#fffdf7;padding:2px 18px;box-decoration-break:clone;-webkit-box-decoration-break:clone;box-shadow:4px 6px 0 rgba(0,0,0,.12)}
.marker{font-family:'Permanent Marker',cursive;color:${b.primary};font-size:46px;transform:rotate(-4deg);display:inline-block;margin-bottom:18px}
.wrap{position:relative;height:100%;display:flex;flex-direction:column;padding:${tall ? '130px 76px 190px' : '64px 76px 72px'}}
.top{display:flex;justify-content:space-between;align-items:center;font-size:28px;font-weight:700}
.body{font-size:36px;line-height:1.38;margin-top:30px;background:#fffdf7;padding:22px 28px;max-width:860px;transform:rotate(.6deg);box-shadow:4px 6px 0 rgba(0,0,0,.1)}
.pol{background:#fff;padding:20px 20px 70px;box-shadow:0 18px 40px -14px rgba(0,0,0,.45);position:relative}
.pol img{width:100%;height:100%;object-fit:cover;display:block}
.tape{position:absolute;width:190px;height:54px;background:rgba(255,250,235,.62);box-shadow:0 1px 3px rgba(0,0,0,.12)}
.sticker{position:absolute;width:190px;height:190px;border-radius:50%;background:${b.primary};color:${onColor(b.primary)};display:grid;place-items:center;font-family:'Permanent Marker';font-size:46px;transform:rotate(12deg);box-shadow:0 10px 24px -8px rgba(0,0,0,.4);z-index:3;text-align:center}`
const words = (t: string) => `<span>${esc(t)}</span>`
const tapes = `<div class="tape" style="top:-22px;left:-40px;transform:rotate(-28deg)"></div><div class="tape" style="top:-22px;right:-40px;transform:rotate(26deg)"></div>`

const collage: StyleTemplates = {
  cover(b, d, size = SIZES.feed) {
    const tall = size.h > 1500
    return shell(
      b,
      size.w,
      size.h,
      `${collageBase(b, tall)}
.pol{width:82%;height:${tall ? 980 : 690}px;margin:46px 0 0 6%;transform:rotate(2.5deg)}
.sticker{top:${tall ? 240 : 150}px;right:46px}
.mid{margin-top:auto}
h1{font-size:${fit(d.title, [96, 80, 66, 56])}px}`,
      `<div class="wrap"><div class="top">${brandRow(b)}<span>${counter(d)}</span></div>${d.background ? `<div class="pol"><img src="${d.background}">${tapes}</div>` : ''}<div class="sticker">${counter(d) ? `${(d.index ?? 0) + 1}/${d.total}` : '★'}</div><div class="mid">${opt(d.eyebrow, (s) => `<span class="marker">${s}</span>`)}<h1>${words(d.title)}</h1>${opt(d.body, (s) => `<p class="body">${s}</p>`)}</div></div>`,
      ['Archivo Black', 'Permanent Marker'],
    )
  },
  text(b, d, size = SIZES.feed) {
    const tall = size.h > 1500
    const m = media(d)
    return shell(
      b,
      size.w,
      size.h,
      `${collageBase(b, tall)}
.mid{margin-top:56px;${m ? 'flex:1;min-height:0;display:flex;flex-direction:column' : ''}}
h1{font-size:${fit(d.title, m || d.items?.length ? [76, 66, 56, 48] : [96, 80, 66, 56])}px}
ol{list-style:none;margin-top:44px;display:grid;gap:22px}
li{background:#fffdf7;padding:22px 30px;font-size:38px;line-height:1.3;display:flex;gap:22px;box-shadow:4px 6px 0 rgba(0,0,0,.1)}
li:nth-child(odd){transform:rotate(-.8deg)}li:nth-child(even){transform:rotate(.9deg);margin-left:30px}
li b{font-family:'Permanent Marker';font-weight:400;color:${b.primary};font-size:44px;line-height:1}
.pol{flex:1;min-height:0;margin:56px 40px 0;transform:rotate(-2deg)}
.pol.shot{background:transparent;box-shadow:none;padding:0;display:flex;justify-content:center}
.pol.shot img{width:auto;max-width:66%;object-fit:contain;border:12px solid #fff;border-radius:30px;box-shadow:0 18px 40px -14px rgba(0,0,0,.45)}`,
      `<div class="wrap"><div class="top">${brandRow(b)}<span>${counter(d)}</span></div><div class="mid">${opt(d.eyebrow, (s) => `<div><span class="marker">${s}</span></div>`)}<h1>${words(d.title)}</h1>${opt(d.body, (s) => `<p class="body">${s}</p>`)}${items(d, (x, i) => `<li><b>${i + 1}</b><span>${x}</span></li>`)}${m ? `<div class="pol${m.shot ? ' shot' : ''}"><img src="${m.src}">${m.shot ? '' : tapes}</div>` : ''}</div></div>`,
      ['Archivo Black', 'Permanent Marker'],
    )
  },
  cta(b, d, size = SIZES.feed) {
    const tall = size.h > 1500
    const fg = onColor(b.primary)
    return shell(
      b,
      size.w,
      size.h,
      `${collageBase(b, tall)}
body{background:${b.primary}}
.top{color:${fg}}
h1{font-size:${fit(d.title, [110, 92, 76, 64])}px;margin-top:auto}
.marker{color:${fg};font-size:58px;margin-top:56px}
.sticker{background:#fffdf7;color:#1d1a16;top:${tall ? 300 : 180}px;right:70px;width:230px;height:230px;font-size:40px;line-height:1.1;padding:20px}`,
      `<div class="wrap"><div class="top">${brandRow(b, fg)}<span>${counter(d)}</span></div><div class="sticker">¡Probalo!</div><h1>${words(d.title)}</h1>${opt(d.body, (s) => `<p class="body">${s}</p>`)}<div><span class="marker">→ ${esc(b.url)}</span></div></div>`,
      ['Archivo Black', 'Permanent Marker'],
    )
  },
}

// ---------------------------------------------------------------------------
// 3D suave: degradado pastel de la marca y tarjetas de vidrio esmerilado.
// ---------------------------------------------------------------------------
const suaveBg = (b: Brand, k = 1) =>
  `radial-gradient(60% 50% at 12% 8%, ${b.primary}${k > 1 ? '99' : '5c'}, transparent 70%), radial-gradient(55% 55% at 92% 32%, ${b.accent}${k > 1 ? '88' : '4d'}, transparent 70%), radial-gradient(70% 55% at 45% 100%, ${b.primary}${k > 1 ? '77' : '3d'}, transparent 70%), #f5f3fb`
const suaveBase = (b: Brand, tall: boolean) => `body{background:${suaveBg(b)};color:#1c1b2e;font-family:'Plus Jakarta Sans','${b.font}',sans-serif}
h1{font-weight:800;letter-spacing:-.035em;line-height:1.05}
.wrap{position:relative;height:100%;display:flex;flex-direction:column;padding:${tall ? '130px 64px 180px' : '60px 64px 64px'}}
.glass{background:rgba(255,255,255,.52);backdrop-filter:blur(28px) saturate(1.5);-webkit-backdrop-filter:blur(28px) saturate(1.5);border:2px solid rgba(255,255,255,.8);border-radius:56px;box-shadow:0 30px 80px -30px rgba(40,30,90,.35)}
.chip{display:inline-block;background:${b.primary};color:${onColor(b.primary)};border-radius:999px;padding:10px 24px;font-size:26px;font-weight:700;margin-bottom:24px}
.top{display:flex;justify-content:space-between;align-items:center}
.top .glass{border-radius:999px;padding:14px 26px 14px 18px}
.top .brand{font-size:30px}
.top .n{padding:14px 26px;font-size:26px;font-weight:700}
.body{font-size:36px;line-height:1.42;margin-top:24px;color:#4a4863}`

const suave3d: StyleTemplates = {
  cover(b, d, size = SIZES.feed) {
    const tall = size.h > 1500
    return shell(
      b,
      size.w,
      size.h,
      `${suaveBase(b, tall)}
.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.card{margin-top:auto;padding:52px 56px}
h1{font-size:${fit(d.title, [100, 86, 72, 62])}px}`,
      `${d.background ? `<img class="bg" src="${d.background}">` : ''}<div class="wrap"><div class="top"><div class="glass">${brandRow(b)}</div>${counter(d) ? `<div class="glass n">${counter(d)}</div>` : ''}</div><div class="glass card">${opt(d.eyebrow, (s) => `<span class="chip">${s}</span>`)}<h1>${esc(d.title)}</h1>${opt(d.body, (s) => `<p class="body">${s}</p>`)}</div></div>`,
      ['Plus Jakarta Sans:wght@500;700;800'],
    )
  },
  text(b, d, size = SIZES.feed) {
    const tall = size.h > 1500
    const m = media(d)
    return shell(
      b,
      size.w,
      size.h,
      `${suaveBase(b, tall)}
.card{margin-top:${m ? 40 : 0}px;padding:52px 56px;${m ? '' : 'margin-block:auto'}}
h1{font-size:${fit(d.title, m || d.items?.length ? [78, 68, 58, 50] : [100, 86, 72, 62])}px}
ol{list-style:none;margin-top:36px;display:grid;gap:18px}
li{display:flex;gap:22px;align-items:center;background:rgba(255,255,255,.6);border-radius:28px;padding:20px 24px;font-size:36px;line-height:1.28}
li b{flex:none;width:56px;height:56px;border-radius:50%;background:${b.primary};color:${onColor(b.primary)};display:grid;place-items:center;font-size:28px}
.media{flex:1;min-height:0;margin-top:32px;border-radius:56px;overflow:hidden;box-shadow:0 30px 80px -30px rgba(40,30,90,.45)}
.media img{width:100%;height:100%;object-fit:cover;display:block}
.media.shot{background:none;box-shadow:none;display:flex;justify-content:center;overflow:visible}
.media.shot img{width:auto;max-width:62%;object-fit:contain;border-radius:44px;border:10px solid rgba(255,255,255,.85);box-shadow:0 30px 80px -30px rgba(40,30,90,.5)}`,
      `<div class="wrap"><div class="top"><div class="glass">${brandRow(b)}</div>${counter(d) ? `<div class="glass n">${counter(d)}</div>` : ''}</div><div class="glass card">${opt(d.eyebrow, (s) => `<span class="chip">${s}</span>`)}<h1>${esc(d.title)}</h1>${opt(d.body, (s) => `<p class="body">${s}</p>`)}${items(d, (x, i) => `<li><b>${i + 1}</b><span>${x}</span></li>`)}</div>${m ? `<div class="media${m.shot ? ' shot' : ''}"><img src="${m.src}"></div>` : ''}</div>`,
      ['Plus Jakarta Sans:wght@500;700;800'],
    )
  },
  cta(b, d, size = SIZES.feed) {
    const tall = size.h > 1500
    return shell(
      b,
      size.w,
      size.h,
      `${suaveBase(b, tall)}
body{background:${suaveBg(b, 2)}}
.card{margin:auto 0;padding:72px 60px;text-align:center}
h1{font-size:${fit(d.title, [110, 92, 78, 66])}px}
.btn{display:inline-block;margin-top:48px;background:${b.primary};color:${onColor(b.primary)};border-radius:999px;padding:28px 52px;font-size:40px;font-weight:800;box-shadow:0 20px 40px -16px ${b.primary}}`,
      `<div class="wrap"><div class="top"><div class="glass">${brandRow(b)}</div>${counter(d) ? `<div class="glass n">${counter(d)}</div>` : ''}</div><div class="glass card"><h1>${esc(d.title)}</h1>${opt(d.body, (s) => `<p class="body">${s}</p>`)}<span class="btn">${esc(b.url)}</span></div></div>`,
      ['Plus Jakarta Sans:wght@500;700;800'],
    )
  },
}

// ---------------------------------------------------------------------------
// Bento oscuro: grilla de tarjetas, brillo del color de marca, etiquetas mono.
// ---------------------------------------------------------------------------
const bentoBase = (b: Brand, tall: boolean) => {
  const p = bright(b)
  return `body{background:radial-gradient(55% 35% at 88% 0%, ${p}55, transparent 70%), radial-gradient(45% 30% at 0% 100%, ${b.accent}33, transparent 70%), #0a0b0f;color:#f2f3f7}
h1{font-weight:750;letter-spacing:-.035em;line-height:1.05}
.wrap{height:100%;display:flex;flex-direction:column;gap:20px;padding:${tall ? '120px 56px 170px' : '56px'}}
.c{background:#14161dcc;border:1px solid rgba(255,255,255,.09);border-radius:34px;padding:34px 38px}
.mono{font-family:'JetBrains Mono',monospace;font-size:24px;letter-spacing:.04em;color:${p}}
.muted{color:#9aa0ad}
.row{display:flex;gap:20px}
.row .c{flex:1;display:flex;align-items:center;justify-content:space-between}
.body{font-size:34px;line-height:1.4;margin-top:20px;color:#b9bec9}
.pic{flex:1;min-height:0;padding:0;overflow:hidden;position:relative}
.pic img{width:100%;height:100%;object-fit:cover;display:block}`
}

const bento: StyleTemplates = {
  cover(b, d, size = SIZES.feed) {
    const tall = size.h > 1500
    const p = bright(b)
    return shell(
      b,
      size.w,
      size.h,
      `${bentoBase(b, tall)}
.ph{display:grid;place-items:center;background:radial-gradient(60% 60% at 50% 40%, ${p}66, transparent 70%), #14161d;font-size:300px;font-weight:800;color:${p}}
h1{font-size:${fit(d.title, [92, 78, 66, 56])}px}`,
      `<div class="wrap"><div class="row"><div class="c">${brandRow(b)}</div><div class="c" style="gap:16px"><span class="mono">${esc(d.eyebrow ? `// ${d.eyebrow}` : '// nuevo')}</span><span class="mono muted" style="white-space:nowrap">${counter(d)}</span></div></div>${d.background ? `<div class="c pic"><img src="${d.background}"></div>` : `<div class="c pic ph">${esc(b.name.slice(0, 1).toUpperCase())}</div>`}<div class="c"><h1>${esc(d.title)}</h1>${opt(d.body, (s) => `<p class="body">${s}</p>`)}</div></div>`,
      ['JetBrains Mono:wght@500;700'],
    )
  },
  text(b, d, size = SIZES.feed) {
    const tall = size.h > 1500
    const m = media(d)
    return shell(
      b,
      size.w,
      size.h,
      `${bentoBase(b, tall)}
h1{font-size:${fit(d.title, m || d.items?.length ? [72, 62, 54, 46] : [92, 78, 66, 56])}px;margin-top:18px}
ol{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:20px}
li{font-size:32px;line-height:1.3}
li .mono{display:block;margin-bottom:14px}
li:only-child,li:last-child:nth-child(odd){grid-column:span 2}
.pic.shot{display:flex;justify-content:center;align-items:flex-end;padding:40px 0 0;background:linear-gradient(180deg,#14161d,#1b1e28)}
.pic.shot img{width:auto;max-width:56%;object-fit:contain;border-radius:30px 30px 0 0;border:8px solid #2a2e3a;border-bottom:0}
${m || d.items?.length ? '' : '.main{flex:1;display:flex;flex-direction:column;justify-content:flex-end}'}`,
      `<div class="wrap"><div class="row"><div class="c">${brandRow(b)}</div><div class="c" style="flex:.6;justify-content:center"><span class="mono muted">${counter(d) || '—'}</span></div></div><div class="c main"><span class="mono">${esc(`// ${d.eyebrow ?? pad2((d.index ?? 0) + 1)}`)}</span><h1>${esc(d.title)}</h1>${opt(d.body, (s) => `<p class="body">${s}</p>`)}</div>${items(d, (x, i) => `<li class="c"><span class="mono">${pad2(i + 1)}</span>${x}</li>`)}${m ? `<div class="c pic${m.shot ? ' shot' : ''}"><img src="${m.src}"></div>` : ''}</div>`,
      ['JetBrains Mono:wght@500;700'],
    )
  },
  cta(b, d, size = SIZES.feed) {
    const tall = size.h > 1500
    const p = bright(b)
    return shell(
      b,
      size.w,
      size.h,
      `${bentoBase(b, tall)}
.big{flex:1;display:flex;flex-direction:column;justify-content:center;box-shadow:0 0 140px -30px ${p}88;border-color:${p}55;padding:64px}
h1{font-size:${fit(d.title, [112, 94, 78, 66])}px}
.btn{align-self:flex-start;margin-top:48px;background:${p};color:${onColor(p)};border-radius:20px;padding:26px 40px;font-size:38px;font-weight:750}`,
      `<div class="wrap"><div class="row"><div class="c">${brandRow(b)}</div><div class="c" style="flex:.6;justify-content:center"><span class="mono muted">${counter(d) || '—'}</span></div></div><div class="c big"><span class="mono">// empezá hoy</span><h1 style="margin-top:20px">${esc(d.title)}</h1>${opt(d.body, (s) => `<p class="body">${s}</p>`)}<span class="btn">${esc(b.url)} ↗</span></div></div>`,
      ['JetBrains Mono:wght@500;700'],
    )
  },
}

// ---------------------------------------------------------------------------
// Retro: crema con rayos de sol, letra gruesa con sombra, imagen en arco, sticker de estrella.
// ---------------------------------------------------------------------------
const INK = '#2a1d14'
const STAR = 'polygon(50% 0%,61% 18%,82% 9%,79% 31%,100% 38%,84% 54%,96% 74%,73% 76%,68% 98%,50% 85%,32% 98%,27% 76%,4% 74%,16% 54%,0% 38%,21% 31%,18% 9%,39% 18%)'
const rays = (c: string, at = '50% 110%') => `repeating-conic-gradient(from 0deg at ${at}, ${c} 0deg 7deg, transparent 7deg 14deg)`
const retroBase = (b: Brand, tall: boolean) => `body{background:${rays(`${b.primary}1f`)}, #fbf0dc;color:${INK};position:relative}
${grain}
h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;letter-spacing:-.04em;line-height:.98;text-shadow:6px 6px 0 ${b.primary}}
.wrap{position:relative;height:100%;display:flex;flex-direction:column;padding:${tall ? '130px 76px 190px' : '64px 76px 72px'}}
.top{display:flex;justify-content:space-between;align-items:center;font-size:28px;font-weight:800}
.body{font-size:36px;line-height:1.38;margin-top:26px;font-weight:500}
.star{position:absolute;width:290px;height:290px;clip-path:${STAR};background:${b.primary};color:${onColor(b.primary)};display:grid;place-items:center;text-align:center;font-family:'Bricolage Grotesque';font-weight:800;font-size:24px;line-height:1.05;text-transform:uppercase;padding:62px;transform:rotate(10deg);z-index:2}
.arch{border:8px solid ${INK};overflow:hidden;background:#fff;box-shadow:14px 14px 0 ${INK}}
.arch img{width:100%;height:100%;object-fit:cover;display:block}`

const retro: StyleTemplates = {
  cover(b, d, size = SIZES.feed) {
    const tall = size.h > 1500
    return shell(
      b,
      size.w,
      size.h,
      `${retroBase(b, tall)}
.arch{width:800px;height:${tall ? 1000 : 640}px;margin:40px auto 0;border-radius:400px 400px 28px 28px}
.star{top:${tall ? 230 : 130}px;right:40px}
.mid{margin-top:auto;text-align:center}
h1{font-size:${fit(d.title, [116, 96, 80, 66])}px}`,
      `<div class="wrap"><div class="top">${brandRow(b)}<span>${counter(d)}</span></div>${d.background ? `<div class="arch"><img src="${d.background}"></div>` : ''}${opt(d.eyebrow, (s) => `<div class="star">${s}</div>`)}<div class="mid"><h1>${esc(d.title)}</h1>${opt(d.body, (s) => `<p class="body">${s}</p>`)}</div></div>`,
      ['Bricolage Grotesque:opsz,wght@12..96,500..800'],
    )
  },
  text(b, d, size = SIZES.feed) {
    const tall = size.h > 1500
    const m = media(d)
    return shell(
      b,
      size.w,
      size.h,
      `${retroBase(b, tall)}
.mid{margin-top:60px;${m ? 'flex:1;min-height:0;display:flex;flex-direction:column' : 'margin-bottom:auto'}}
.kick{display:inline-block;background:${INK};color:#fbf0dc;border-radius:999px;padding:10px 26px;font-size:26px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin-bottom:28px}
h1{font-size:${fit(d.title, m || d.items?.length ? [86, 74, 62, 54] : [116, 96, 80, 66])}px}
ol{list-style:none;margin-top:44px;display:grid;gap:20px}
li{display:flex;gap:24px;align-items:center;border:5px solid ${INK};border-radius:999px;background:#fffaf0;padding:16px 34px 16px 16px;font-size:36px;font-weight:600;line-height:1.25;box-shadow:7px 7px 0 ${INK}}
li b{flex:none;width:64px;height:64px;border-radius:50%;background:${b.primary};color:${onColor(b.primary)};display:grid;place-items:center;font-size:32px}
.arch{flex:1;min-height:0;margin:48px 14px 14px 0;border-radius:44px}
.arch.shot{background:${b.primary}33;display:flex;justify-content:center;align-items:flex-end;padding-top:40px}
.arch.shot img{width:auto;max-width:58%;object-fit:contain;border-radius:30px 30px 0 0;border:6px solid ${INK};border-bottom:0}`,
      `<div class="wrap"><div class="top">${brandRow(b)}<span>${counter(d)}</span></div><div class="mid">${opt(d.eyebrow, (s) => `<div><span class="kick">${s}</span></div>`)}<h1>${esc(d.title)}</h1>${opt(d.body, (s) => `<p class="body">${s}</p>`)}${items(d, (x, i) => `<li><b>${i + 1}</b><span>${x}</span></li>`)}${m ? `<div class="arch${m.shot ? ' shot' : ''}"><img src="${m.src}"></div>` : ''}</div></div>`,
      ['Bricolage Grotesque:opsz,wght@12..96,500..800'],
    )
  },
  cta(b, d, size = SIZES.feed) {
    const tall = size.h > 1500
    const fg = onColor(b.primary)
    return shell(
      b,
      size.w,
      size.h,
      `${retroBase(b, tall)}
body{background:${rays('rgba(255,255,255,.14)', '50% 50%')}, ${b.primary};color:${fg}}
.mid{margin:auto 0;text-align:center}
h1{color:#fbf0dc;text-shadow:7px 7px 0 ${INK};font-size:${fit(d.title, [130, 108, 90, 76])}px}
.btn{display:inline-block;margin-top:56px;background:#fbf0dc;color:${INK};border:6px solid ${INK};border-radius:999px;padding:24px 48px;font-size:40px;font-weight:800;box-shadow:9px 9px 0 ${INK}}`,
      `<div class="wrap"><div class="top">${brandRow(b, fg)}<span>${counter(d)}</span></div><div class="mid"><h1>${esc(d.title)}</h1>${opt(d.body, (s) => `<p class="body">${s}</p>`)}<span class="btn">${esc(b.url)}</span></div></div>`,
      ['Bricolage Grotesque:opsz,wght@12..96,500..800'],
    )
  },
}

// ---------------------------------------------------------------------------
// Hecho a mano: hoja cuadriculada, resaltador, subrayado y flechas dibujadas.
// ---------------------------------------------------------------------------
const HAND = 'Caveat:wght@500;700'
const squiggle = (c: string) => `<svg class="sq" viewBox="0 0 600 40" preserveAspectRatio="none"><path d="M4 26 C 60 6, 110 38, 170 20 S 280 6, 340 22 S 460 36, 520 16 S 580 14, 596 22" fill="none" stroke="${c}" stroke-width="9" stroke-linecap="round"/></svg>`
const arrow = (c: string) => `<svg class="ar" viewBox="0 0 160 120"><path d="M10 20 C 60 10, 120 30, 130 95" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round"/><path d="M104 78 L 131 100 L 148 68" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const amanoBase = (b: Brand, tall: boolean) => `body{background:linear-gradient(#e6ecf6 2px, transparent 2px) 0 0/54px 54px, linear-gradient(90deg, #e6ecf6 2px, transparent 2px) 0 0/54px 54px, #fffdf7;color:#1f2430}
h1{font-weight:800;letter-spacing:-.03em;line-height:1.12}
h1 span{background:linear-gradient(transparent 58%, ${b.primary}66 58%, ${b.primary}66 90%, transparent 90%);box-decoration-break:clone;-webkit-box-decoration-break:clone;padding:0 6px}
.hand{font-family:'Caveat',cursive;font-weight:700;color:${b.primary};font-size:58px;line-height:1;display:inline-block;transform:rotate(-2deg);margin-bottom:14px}
.wrap{position:relative;height:100%;display:flex;flex-direction:column;padding:${tall ? '130px 80px 190px' : '64px 80px 72px'}}
.top{display:flex;justify-content:space-between;align-items:center;font-size:28px}
.top .n{font-family:'Caveat';font-size:44px;font-weight:700}
.body{font-size:36px;line-height:1.42;margin-top:24px;color:#444b59}
.sq{display:block;width:62%;height:34px;margin-top:10px}
.ar{position:absolute;width:150px;height:112px;z-index:2}
.img{border:4px solid #1f2430;border-radius:255px 18px 225px 18px/18px 225px 18px 255px;overflow:hidden;background:#fff}
.img img{width:100%;height:100%;object-fit:cover;display:block}`

const amano: StyleTemplates = {
  cover(b, d, size = SIZES.feed) {
    const tall = size.h > 1500
    return shell(
      b,
      size.w,
      size.h,
      `${amanoBase(b, tall)}
.img{height:${tall ? 920 : 620}px;margin-top:44px;transform:rotate(-1deg)}
.ar{top:${tall ? 1090 : 760}px;right:70px;transform:scaleY(-1) rotate(-10deg)}
.mid{margin-top:auto}
h1{font-size:${fit(d.title, [100, 84, 70, 60])}px}`,
      `<div class="wrap"><div class="top">${brandRow(b)}<span class="n">${counter(d)}</span></div>${d.background ? `<div class="img"><img src="${d.background}"></div>${arrow(b.primary)}` : ''}<div class="mid">${opt(d.eyebrow, (s) => `<span class="hand">${s}</span>`)}<h1><span>${esc(d.title)}</span></h1>${squiggle(b.primary)}${opt(d.body, (s) => `<p class="body">${s}</p>`)}</div></div>`,
      [HAND],
    )
  },
  text(b, d, size = SIZES.feed) {
    const tall = size.h > 1500
    const m = media(d)
    return shell(
      b,
      size.w,
      size.h,
      `${amanoBase(b, tall)}
.mid{margin-top:56px;${m ? 'flex:1;min-height:0;display:flex;flex-direction:column' : 'margin-bottom:auto'}}
h1{font-size:${fit(d.title, m || d.items?.length ? [80, 68, 58, 50] : [100, 84, 70, 60])}px}
ol{list-style:none;margin-top:40px;display:grid;gap:26px}
li{display:flex;gap:24px;align-items:center;font-size:40px;line-height:1.3}
li b{flex:none;width:72px;height:68px;display:grid;place-items:center;font-family:'Caveat';font-size:50px;color:${b.primary};border:4px solid ${b.primary};border-radius:60% 45% 55% 40%/50% 60% 40% 55%}
.img{flex:1;min-height:0;margin-top:44px;transform:rotate(.8deg)}
.img.shot{border:0;background:none;display:flex;justify-content:center;overflow:visible}
.img.shot img{width:auto;max-width:62%;object-fit:contain;border:6px solid #1f2430;border-radius:40px}`,
      `<div class="wrap"><div class="top">${brandRow(b)}<span class="n">${counter(d)}</span></div><div class="mid">${opt(d.eyebrow, (s) => `<div><span class="hand">${s}</span></div>`)}<h1><span>${esc(d.title)}</span></h1>${opt(d.body, (s) => `<p class="body">${s}</p>`)}${items(d, (x, i) => `<li><b>${i + 1}</b><span>${x}</span></li>`)}${m ? `<div class="img${m.shot ? ' shot' : ''}"><img src="${m.src}"></div>` : ''}</div></div>`,
      [HAND],
    )
  },
  cta(b, d, size = SIZES.feed) {
    const tall = size.h > 1500
    return shell(
      b,
      size.w,
      size.h,
      `${amanoBase(b, tall)}
.mid{margin:auto 0}
h1{font-size:${fit(d.title, [116, 96, 80, 68])}px}
.url{display:inline-block;margin-top:56px;font-family:'Caveat';font-weight:700;font-size:78px;color:${b.primary};padding:14px 44px;border:5px solid ${b.primary};border-radius:58% 42% 52% 48%/55% 45% 58% 42%;transform:rotate(-2deg)}`,
      `<div class="wrap"><div class="top">${brandRow(b)}<span class="n">${counter(d)}</span></div><div class="mid">${opt(d.eyebrow, (s) => `<span class="hand">${s}</span>`)}<h1><span>${esc(d.title)}</span></h1>${opt(d.body, (s) => `<p class="body">${s}</p>`)}<div><span class="url">→ ${esc(b.url)}</span></div></div></div>`,
      [HAND],
    )
  },
}

const clasico: StyleTemplates = { cover: coverSlide, text: textSlide, cta: ctaSlide }

export const TEMPLATES: Record<DesignStyleId, StyleTemplates> = { clasico, poster, editorial, papel, collage, suave3d, bento, retro, amano }
