'use client'
// Achica en el navegador las fotos elegidas en un <input type="file" name="images"> antes de subirlas:
// una foto de celular pesa 3-12 MB y las piezas son de 1080 px, así que con 2160 px de lado mayor sobra.
// Sube más rápido y el formulario no pasa el límite de tamaño del servidor aunque se elijan varias.
import { useEffect } from 'react'

/** Lado mayor máximo de una imagen subida. */
const MAX_SIDE = 2160
/** Las que ya pesan menos que esto y no son más grandes que MAX_SIDE se suben tal cual. */
const KEEP_BYTES = 1.5 * 1024 * 1024

async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  const bmp = await createImageBitmap(file).catch(() => null)
  if (!bmp) return file
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  if (scale === 1 && file.size <= KEEP_BYTES) return file
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  // PNG (capturas de pantalla) sigue en PNG para que el texto quede nítido; el resto, JPEG.
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.88))
  if (!blob || blob.size >= file.size) return file
  return new File([blob], file.name.replace(/\.\w+$/, type === 'image/png' ? '.png' : '.jpg'), { type, lastModified: file.lastModified })
}

export function ImageShrinker() {
  useEffect(() => {
    const onChange = async (e: Event) => {
      const input = e.target as HTMLInputElement
      if (input.type !== 'file' || input.name !== 'images' || !input.files?.length || input.dataset.shrinking) return
      // Si hay más de un selector en la página, sólo uno lo procesa.
      input.dataset.shrinking = '1'
      // Mientras se achican, el formulario no se puede mandar (el navegador muestra el aviso).
      input.setCustomValidity('Preparando las imágenes, esperá un segundo…')
      try {
        const files = await Promise.all([...input.files].map((f) => shrink(f).catch(() => f)))
        const dt = new DataTransfer()
        for (const f of files) dt.items.add(f)
        input.files = dt.files
      } finally {
        input.setCustomValidity('')
        delete input.dataset.shrinking
      }
    }
    document.addEventListener('change', onChange)
    return () => document.removeEventListener('change', onChange)
  }, [])
  return null
}
