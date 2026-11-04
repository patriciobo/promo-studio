import Link from 'next/link'
import { importStockItem, setImageArchived, updateImage, uploadImages } from '@/app/actions'
import { AutoRefresh, Progress, SubmitButton } from '@/components/client'
import { ImageShrinker } from '@/components/ImageShrinker'
import { VideoUpload } from '@/components/VideoUpload'
import { db } from '@/lib/db'
import type { Manifest } from '@/lib/manifest'
import { mediaSrc } from '@/lib/media'
import { availableSources, searchStock, SOURCE_LABEL, type StockKind, type StockSource } from '@/lib/stock'

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')

export default async function Images({ params, searchParams }: PageProps<'/apps/[slug]/imagenes'>) {
  const { slug } = await params
  const sp = await searchParams
  const q = one(sp.q).trim().slice(0, 100)
  const tipo: StockKind = one(sp.tipo) === 'photo' ? 'photo' : 'video'
  const banco = (['pexels', 'pixabay', 'commons'] as const).find((b) => b === one(sp.banco))
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const images = await db.appImage.findMany({ where: { appId: app.id }, orderBy: [{ archived: 'asc' }, { createdAt: 'desc' }] })
  const sources = await availableSources()
  const found = q ? await searchStock(q, tipo, banco ? [banco] : undefined, 12) : null
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
            {sources.length < 3 && (
              <>
                {' '}
                (para sumar {['pexels', 'pixabay'].filter((s) => !sources.includes(s as StockSource)).map((s) => SOURCE_LABEL[s as StockSource]).join(' y ')}, cargá su clave gratis en <Link href="/configuracion">Configuración</Link>)
              </>
            )}
            . Los de Wikimedia Commons piden citar al autor: se agrega solo al final de la descripción del post. Buscá en inglés y con el lugar
            {location ? ` (p. ej. “waterfall ${location}”)` : ' (p. ej. “Los Gigantes Cordoba Argentina”)'}; ojo con “Córdoba” sola, que trae fotos de España.
          </p>
        </div>
        <form method="get" action="#buscar" className="row">
          <input name="q" defaultValue={q} placeholder="Por ejemplo: Champaqui Cordoba Argentina" style={{ flex: 1, minWidth: 220 }} required />
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
        {one(sp.error) && <p className="notice bad small">{one(sp.error)}</p>}
        {found?.errors.map((e) => (
          <p key={e} className="notice warn small">
            {e}
          </p>
        ))}
        {found && !found.items.length && <p className="small muted">Sin resultados. Probá en inglés, con menos palabras o con la región (“Traslasierra”, “Punilla”).</p>}
        {found && found.items.length > 0 && (
          <div className="grid">
            {found.items.map((it) => {
              const done = imported.has(`${it.source}:${it.id}`)
              return (
                <article key={`${it.source}:${it.id}`} className="card stack-sm library-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.preview} alt={it.title || 'Resultado'} loading="lazy" />
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
                      <input type="hidden" name="q" value={q} />
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
