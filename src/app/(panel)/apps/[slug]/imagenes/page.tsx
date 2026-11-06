import Link from 'next/link'
import { importStockItem, setImageArchived, updateImage, uploadImages } from '@/app/actions'
import { AutoRefresh, Progress, SubmitButton } from '@/components/client'
import { ImageShrinker } from '@/components/ImageShrinker'
import { VideoUpload } from '@/components/VideoUpload'
import { db } from '@/lib/db'
import type { Manifest } from '@/lib/manifest'
import { mediaSrc } from '@/lib/media'
import { availableSources, geocode, RADII_KM, searchCommonsNear, searchStock, SOURCE_LABEL, type Place, type StockKind, type StockSearch, type StockSource } from '@/lib/stock'

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')
const PER_PAGE = 24

export default async function Images({ params, searchParams }: PageProps<'/apps/[slug]/imagenes'>) {
  const { slug } = await params
  const sp = await searchParams
  const q = one(sp.q).trim().slice(0, 100)
  const tipo: StockKind = one(sp.tipo) === 'photo' ? 'photo' : 'video'
  const banco = (['pexels', 'pixabay', 'commons', 'openverse'] as const).find((b) => b === one(sp.banco))
  const cerca = one(sp.cerca).trim().slice(0, 100)
  const km = RADII_KM.find((r) => String(r) === one(sp.km)) ?? 3
  const pag = Math.min(50, Math.max(1, Number(one(sp.pag)) || 1))
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const images = await db.appImage.findMany({ where: { appId: app.id }, orderBy: [{ archived: 'asc' }, { createdAt: 'desc' }] })
  const sources = await availableSources()
  // Cerca de un lugar: lo que Commons tiene sacado ahí (de lo más cercano a lo más lejano). Si no, por palabras en los bancos.
  let place: Place | null = null
  let found: StockSearch | null = null
  if (cerca) {
    place = await geocode(cerca).catch(() => null)
    found = place
      ? await searchCommonsNear(place, tipo, km, PER_PAGE, pag)
          .then((items) => ({ items, errors: [], more: items.length >= PER_PAGE }))
          .catch((e) => ({ items: [], errors: [`Wikimedia Commons: ${(e as Error).message}`], more: false }))
      : { items: [], errors: [`No encontré “${cerca}” en Wikipedia. Probá con el nombre del lugar como figura ahí (“Cerro Champaquí”, “Mina Clavero”) o con coordenadas (-31.72, -65.00).`], more: false }
  } else if (q) found = await searchStock(q, tipo, banco ? [banco] : undefined, PER_PAGE, { page: pag, ai: { appId: app.id, model: app.textModel } })
  const pageLink = (n: number) => `?${new URLSearchParams({ ...(cerca ? { cerca, km: String(km) } : { q, ...(banco ? { banco } : {}) }), tipo, pag: String(n) })}#buscar`
  const imported = new Set(images.flatMap((i) => (i.source && i.sourceId ? [`${i.source}:${i.sourceId}`] : [])))
  const location = (app.manifest as unknown as Manifest | null)?.location
  // El worker las describe en segundos; si no pudo (sin crédito, modelo sin visión), el plan lo reintenta al usarlas.
  const recent = new Date(new Date().getTime() - 3 * 60e3)
  const describing = images.some((i) => !i.description && i.createdAt > recent)
  return (
    <div className="stack" style={{ gap: 24 }}>
      {describing && <AutoRefresh />}
      <section className="card stack">
        <div className="stack-sm">
          <h2>Imágenes y videos de la app</h2>
          <p className="small muted">
            Capturas de pantalla o fotos reales para basar publicaciones en ellas. Al subirlas, el modelo de texto las describe una vez (centavos de centavo); después el plan semanal las usa cuando
            encajan y las diapositivas que las muestran no generan ilustración con IA. También podés elegirlas en Crear ahora o al generar una semana.
          </p>
        </div>
        <form action={uploadImages.bind(null, slug)} className="stack">
          <ImageShrinker />
          <label>
            Imágenes <span className="hint">JPG, PNG o WebP; las grandes se achican solas antes de subir</span>
            <input type="file" name="images" accept="image/jpeg,image/png,image/webp" multiple required />
          </label>
          <label>
            Nota <span className="hint">opcional: qué muestran o para qué usarlas</span>
            <input name="imageNote" maxLength={500} />
          </label>
          <div className="row">
            <SubmitButton pendingText="Subiendo…" expect={6}>Subir</SubmitButton>
          </div>
        </form>
      </section>
      <section className="card stack">
        <div className="stack-sm">
          <h2>Videos propios</h2>
          <p className="small muted">Tomas reales del lugar o del negocio: en los reels de tipo “Material real” cada escena es un tramo de uno de estos videos, y en las piezas fijas se usa un cuadro. Es lo que mejor funciona en Instagram (contenido original).</p>
        </div>
        <VideoUpload slug={slug} />
      </section>
      <section className="card stack" id="buscar">
        <div className="stack-sm">
          <h2>Buscar material real</h2>
          <p className="small muted">
            Videos y fotos de bancos libres para usar en redes: {sources.map((s) => SOURCE_LABEL[s]).join(', ')}
            {sources.length < 4 && (
              <>
                {' '}
                (para sumar {['pexels', 'pixabay'].filter((s) => !sources.includes(s as StockSource)).map((s) => SOURCE_LABEL[s as StockSource]).join(' y ')}, cargá su clave gratis en <Link href="/configuracion">Configuración</Link>)
              </>
            )}
            . Los de Wikimedia Commons y Flickr que piden citar al autor llevan el crédito solo al final de la descripción del post. Escribí en español o en inglés (se busca en los dos) y con el lugar
            {location ? ` (p. ej. “cascada ${location}”)` : ' (p. ej. “Los Gigantes Córdoba Argentina”)'}; ojo con “Córdoba” sola, que trae fotos de España. Para un lugar puntual, lo más preciso es “Cerca de un lugar”: las fotos sacadas ahí mismo.
          </p>
        </div>
        <form method="get" action="#buscar" className="row">
          <input name="q" defaultValue={cerca ? '' : q} placeholder="Por palabras: cascada Los Gigantes Córdoba" style={{ flex: 1, minWidth: 220 }} required aria-label="Buscar por palabras" />
          <select name="tipo" defaultValue={tipo} aria-label="Tipo">
            <option value="video">Videos</option>
            <option value="photo">Fotos</option>
          </select>
          <select name="banco" defaultValue={banco ?? ''} aria-label="Banco">
            <option value="">Todos los bancos</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
          <button className="btn">Buscar</button>
        </form>
        <form method="get" action="#buscar" className="row">
          <input name="cerca" defaultValue={cerca} placeholder="Cerca de un lugar: Mina Clavero, Cerro Champaquí o -31.72, -65.00" style={{ flex: 1, minWidth: 220 }} required aria-label="Cerca de un lugar" />
          <select name="km" defaultValue={String(km)} aria-label="Radio">
            {RADII_KM.map((r) => (
              <option key={r} value={r}>
                a menos de {r} km
              </option>
            ))}
          </select>
          <select name="tipo" defaultValue={tipo} aria-label="Tipo">
            <option value="photo">Fotos</option>
            <option value="video">Videos</option>
          </select>
          <button className="btn">Buscar cerca</button>
        </form>
        {place && (
          <p className="small muted">
            {SOURCE_LABEL.commons}: {tipo === 'video' ? 'videos' : 'fotos'} sacadas a menos de {km} km de <strong>{place.name}</strong> ({place.lat.toFixed(3)}, {place.lon.toFixed(3)}, según {place.from}), de la más cercana a la más lejana.
          </p>
        )}
        {found?.queries && (found.queries.es !== q || found.queries.en !== q) && (
          <p className="xs muted">
            Buscado como “{found.queries.es}” y “{found.queries.en}”.
          </p>
        )}
        {one(sp.error) && <p className="notice bad small">{one(sp.error)}</p>}
        {found?.errors.map((e) => (
          <p key={e} className="notice warn small">
            {e}
          </p>
        ))}
        {found && !found.items.length && !place && <p className="small muted">Sin resultados. Probá con menos palabras, con la región (“Traslasierra”, “Punilla”) o con “Cerca de un lugar”.</p>}
        {found && !found.items.length && place && <p className="small muted">{pag > 1 ? 'No hay más.' : 'Commons no tiene nada sacado tan cerca: probá con un radio más grande o buscá por palabras.'}</p>}
        {found && found.items.length > 0 && (
          <div className="grid">
            {found.items.map((it) => {
              const done = imported.has(`${it.source}:${it.id}`)
              return (
                <article key={`${it.source}:${it.id}`} className="card stack-sm library-card">
                  {it.kind === 'video' && it.clip ? (
                    // Se reproduce desde el banco: nada se baja hasta importar.
                    <video src={it.clip} poster={it.preview || undefined} controls muted playsInline loop preload={it.preview ? 'none' : 'metadata'} aria-label={it.title || 'Video'} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.preview} alt={it.title || 'Resultado'} loading="lazy" />
                  )}
                  <div className="row" style={{ gap: 6 }}>
                    <span className="badge">{SOURCE_LABEL[it.source]}</span>
                    {it.kind === 'video' && it.duration ? <span className="badge info">Video {Math.round(it.duration)} s</span> : null}
                    {it.credit && <span className="badge warn">pide atribución</span>}
                  </div>
                  {it.title && <p className="xs">{it.title.slice(0, 140)}</p>}
                  <p className="xs muted">
                    {it.author} · {it.license} ·{' '}
                    <a href={it.pageUrl} target="_blank" rel="noreferrer">
                      ver en {SOURCE_LABEL[it.source]}
                    </a>
                  </p>
                  {done ? (
                    <span className="badge ok">Ya está en la biblioteca</span>
                  ) : (
                    <form action={importStockItem.bind(null, slug)} className="stack-sm">
                      <input type="hidden" name="item" value={JSON.stringify(it)} />
                      <input type="hidden" name="back" value={pageLink(pag)} />
                      <input name="note" placeholder="Qué lugar es (opcional)" maxLength={500} />
                      <SubmitButton className="btn sm" pendingText="Importando…" expect={it.kind === 'video' ? 20 : 6}>
                        Importar a la biblioteca
                      </SubmitButton>
                    </form>
                  )}
                </article>
              )
            })}
          </div>
        )}
        {found && (pag > 1 || found.more) && (
          <div className="row">
            {pag > 1 && (
              <Link className="btn sm" href={pageLink(pag - 1)}>
                ← Anteriores
              </Link>
            )}
            <span className="small muted">Página {pag}</span>
            {found.more && (
              <Link className="btn sm" href={pageLink(pag + 1)}>
                Más resultados →
              </Link>
            )}
          </div>
        )}
      </section>
      {!images.length && <div className="card empty">Todavía no hay imágenes.</div>}
      <div className="grid">
        {images.map((i) => (
          <article key={i.id} className={`card stack library-card${i.archived ? ' archived' : ''}`}>
            {i.videoPath ? (
              <video src={mediaSrc(i.videoPath)} poster={i.path ? mediaSrc(i.path) : undefined} controls preload="none" muted playsInline style={{ width: '100%', borderRadius: 8, background: '#000' }} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaSrc(i.path)} alt={i.description ?? 'Imagen subida'} loading="lazy" />
            )}
            {(i.videoPath || (i.source && i.source !== 'upload')) && (
              <p className="xs muted">
                {i.videoPath && <span className="badge info">Video{i.duration ? ` ${Math.round(i.duration)} s` : ''}</span>}{' '}
                {i.source && i.source !== 'upload' && (
                  <>
                    {SOURCE_LABEL[i.source as StockSource] ?? i.source}
                    {i.author ? ` · ${i.author}` : ''}
                    {i.license ? ` · ${i.license}` : ''}
                    {i.sourceUrl && (
                      <>
                        {' '}
                        ·{' '}
                        <a href={i.sourceUrl} target="_blank" rel="noreferrer">
                          original
                        </a>
                      </>
                    )}
                  </>
                )}
              </p>
            )}
            {i.credit && <p className="xs muted">Se cita en la descripción: 📷 {i.credit}</p>}
            <p className="small">{i.description ?? <span className="muted">{describing ? 'Describiendo…' : 'Sin descripción todavía: se describe cuando el plan la use.'}</span>}</p>
            {!i.description && i.createdAt > recent && <Progress since={i.createdAt} expect={15} />}
            <form action={updateImage.bind(null, i.id)} className="stack-sm">
              <label>
                Nota
                <input name="note" defaultValue={i.note ?? ''} maxLength={500} />
              </label>
              <label>
                Tipo
                <select name="kind" defaultValue={i.kind}>
                  <option value="SCREENSHOT">Captura: va enmarcada junto al texto</option>
                  <option value="PHOTO">Foto: ocupa el lugar de la ilustración</option>
                </select>
              </label>
              <div className="row">
                <SubmitButton className="btn sm">Guardar</SubmitButton>
              </div>
            </form>
            <form action={setImageArchived.bind(null, i.id, !i.archived)}>
              <SubmitButton className="btn sm ghost">{i.archived ? 'Volver a usar' : 'Archivar'}</SubmitButton>
            </form>
          </article>
        ))}
      </div>
    </div>
  )
}
