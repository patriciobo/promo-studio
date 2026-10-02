'use client'
// Miniaturas de un post que se abren en grande (clic), con flechas para recorrer las diapositivas.
import { useCallback, useEffect, useRef, useState } from 'react'

export function Gallery({ images, vertical }: { images: string[]; vertical: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [i, setI] = useState(0)
  const open = (n: number) => (setI(n), ref.current?.showModal())
  const close = () => ref.current?.close()
  const step = useCallback((d: number) => setI((n) => (n + d + images.length) % images.length), [images.length])
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
  return (
    <>
      <div className={`thumbs${vertical ? ' vertical' : ''}`}>
        {images.map((src, n) => (
          <button key={src} type="button" className="thumb-btn" onClick={() => open(n)} aria-label={`Ampliar diapositiva ${n + 1}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" loading="lazy" />
          </button>
        ))}
      </div>
      <dialog ref={ref} className="lightbox" onClick={(e) => e.target === e.currentTarget && close()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[i]} alt={`Diapositiva ${i + 1} de ${images.length}`} />
        <div className="lightbox-bar">
          {images.length > 1 && (
            <button type="button" className="btn sm" onClick={() => step(-1)} aria-label="Anterior">
              ←
            </button>
          )}
          <span className="small">
            {i + 1} / {images.length}
          </span>
          {images.length > 1 && (
            <button type="button" className="btn sm" onClick={() => step(1)} aria-label="Siguiente">
              →
            </button>
          )}
          <a className="btn sm ghost" href={images[i]} target="_blank" rel="noreferrer">
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
