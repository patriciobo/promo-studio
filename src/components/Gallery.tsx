'use client'
// Miniaturas de un post que se abren en grande (clic): imágenes con flechas para recorrer las diapositivas,
// y reels con su reproductor al mismo tamaño.
import { useCallback, useEffect, useRef, useState } from 'react'

export type GalleryItem = { src: string; video?: boolean; poster?: string }

export function Gallery({ items, vertical }: { items: GalleryItem[]; vertical: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const player = useRef<HTMLVideoElement>(null)
  const [i, setI] = useState(0)
  const open = (n: number) => (setI(n), ref.current?.showModal())
  const close = () => ref.current?.close()
  const step = useCallback((d: number) => setI((n) => (n + d + items.length) % items.length), [items.length])
  useEffect(() => {
    const dlg = ref.current
    const onKey = (e: KeyboardEvent) => {
      if (!dlg?.open) return
      if (e.key === 'ArrowRight') step(1)
      if (e.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])
  const item = items[i]
  const label = item?.video ? 'reel' : `diapositiva ${i + 1}`
  return (
    <>
      <div className={`thumbs${vertical ? ' vertical' : ''}`}>
        {items.map((it, n) => (
          <button key={it.src} type="button" className="thumb-btn" onClick={() => open(n)} aria-label={it.video ? 'Ver el reel' : `Ampliar diapositiva ${n + 1}`}>
            {it.video ? (
              <span className="thumb-video">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {it.poster ? <img src={it.poster} alt="" loading="lazy" /> : <video src={it.src} muted playsInline preload="metadata" />}
                <span className="play" aria-hidden>
                  ▶
                </span>
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.src} alt="" loading="lazy" />
            )}
          </button>
        ))}
      </div>
      {/* Al cerrar se pausa el reel: el <dialog> sigue montado. */}
      <dialog ref={ref} className="lightbox" onClose={() => player.current?.pause()} onClick={(e) => e.target === e.currentTarget && close()}>
        {item?.video ? (
          <video ref={player} key={item.src} src={item.src} poster={item.poster} controls autoPlay playsInline />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item?.src} alt={`Diapositiva ${i + 1} de ${items.length}`} />
        )}
        <div className="lightbox-bar">
          {items.length > 1 && (
            <button type="button" className="btn sm" onClick={() => step(-1)} aria-label="Anterior">
              ←
            </button>
          )}
          {items.length > 1 && (
            <span className="small">
              {i + 1} / {items.length}
            </span>
          )}
          {items.length > 1 && (
            <button type="button" className="btn sm" onClick={() => step(1)} aria-label="Siguiente">
              →
            </button>
          )}
          <a className="btn sm ghost" href={item?.src} target="_blank" rel="noreferrer" aria-label={`Abrir ${label} en tamaño real`}>
            Tamaño real ↗
          </a>
          <button type="button" className="btn sm" onClick={close}>
            Cerrar
          </button>
        </div>
      </dialog>
    </>
  )
}
