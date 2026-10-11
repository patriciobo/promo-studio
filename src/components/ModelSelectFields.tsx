'use client'
import { useEffect, useRef, useState } from 'react'
import { encodeImageChoice, IMAGE_KINDS, IMAGE_MODELS, parseImageChoice, SUGGESTED, TIERS, type ImageKind, type ImageQuality } from '@/lib/models'

const QUALITY_LABEL: Record<ImageQuality, string> = { low: 'baja', medium: 'media' }
const money = (n: number) => `US$ ${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`

export function ModelSelectFields({ imageModel, imageQuality, imageKind, label }: { imageModel: string | null; imageQuality: string | null; imageKind: ImageKind; label: string }) {
  const current = encodeImageChoice({ model: imageModel, quality: imageModel ? (imageQuality ?? IMAGE_MODELS.find((m) => m.id === imageModel)?.defaultQuality ?? null) : null })
  const [value, setValue] = useState(current)
  const [kind, setKind] = useState(imageKind)
  const [kindRef, ownImages] = useOwnImages()
  const tag = (v: string) => (v === current ? ' · Ajustes' : '')
  const custom = imageModel && !IMAGE_MODELS.some((m) => m.id === imageModel) ? imageModel : null
  const selected = IMAGE_MODELS.find((m) => m.id === parseImageChoice(value)?.model)
  const suggested = IMAGE_MODELS.find((m) => m.id === SUGGESTED[kind])!
  const star = (id: string) => (id === suggested.id ? ' ★' : '')
  const useSuggested = () => setValue(encodeImageChoice({ model: suggested.id, quality: suggested.defaultQuality ?? null }))
  return (
    <>
      <select ref={kindRef} name="imageKind" value={kind} onChange={(e) => setKind(e.target.value as ImageKind)} disabled={ownImages} aria-label="Tipo de imagen" title={ownImages ? 'Con imágenes tuyas no hace falta elegirlo: las piezas usan tus fotos (si alguna diapositiva queda sin foto, se usa el tipo de Ajustes).' : 'Tipo de imagen'} className="model-select">
        {IMAGE_KINDS.map((k) => (
          <option key={k.id} value={k.id}>
            {k.label}
            {k.id === imageKind ? ' · Ajustes' : ''}
          </option>
        ))}
      </select>
      <select name="imageChoice" value={value} onChange={(e) => setValue(e.target.value)} aria-label={label} title={label} className="model-select">
        {TIERS.map((t) => (
          <optgroup key={t.id} label={t.label}>
            {IMAGE_MODELS.filter((m) => m.tier === t.id).flatMap((m) =>
              m.qualities
                ? (Object.entries(m.qualities) as [ImageQuality, number][]).map(([q, price]) => {
                    const v = encodeImageChoice({ model: m.id, quality: q })
                    return (
                      <option key={v} value={v}>
                        {m.name} ({QUALITY_LABEL[q]}) · {money(price)}/img{star(m.id)}{tag(v)}
                      </option>
                    )
                  })
                : [
                    <option key={m.id} value={encodeImageChoice({ model: m.id, quality: null })}>
                      {m.name} · {money(m.priceUsd)}/img{star(m.id)}{tag(encodeImageChoice({ model: m.id, quality: null }))}
                    </option>,
                  ],
            )}
          </optgroup>
        ))}
        <optgroup label="Otros">
          {custom && (
            <option value={encodeImageChoice({ model: custom, quality: imageQuality })}>
              {custom} · Ajustes
            </option>
          )}
          <option value="none">Sin imagen IA (gratis){tag('none')}</option>
        </optgroup>
      </select>
      {selected && selected.fit[kind] !== 'ideal' && (
        <button type="button" className="btn sm ghost" onClick={useSuggested} title={`${selected.name} sale ${selected.fit[kind]} para ${kind === 'photo' ? 'fotos' : 'ilustraciones'}`}>
          Usar {suggested.name} ★
        </button>
      )}
    </>
  )
}

/**
 * ¿El formulario lleva imágenes propias (subidas o marcadas de la biblioteca)? Mira los campos del mismo formulario,
 * también los que están fuera de él con el atributo `form`. Con imágenes propias el tipo de imagen no hace falta.
 */
function useOwnImages() {
  const ref = useRef<HTMLSelectElement>(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const form = ref.current?.form
    if (!form) return
    const check = () => {
      const fields = [...form.elements] as HTMLInputElement[]
      setOn(fields.some((e) => (e.name === 'imageIds' && e.checked) || (e.name === 'images' && (e.files?.length ?? 0) > 0)))
    }
    const onChange = (e: Event) => {
      if ((e.target as HTMLInputElement).form === form) check()
    }
    check()
    document.addEventListener('change', onChange)
    form.addEventListener('reset', check)
    return () => {
      document.removeEventListener('change', onChange)
      form.removeEventListener('reset', check)
    }
  }, [])
  return [ref, on] as const
}
