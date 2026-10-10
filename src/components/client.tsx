'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'

export function CopyButton({ text, label = 'Copiar' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="btn sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1500)
      }}
    >
      {done ? 'Copiado' : label}
    </button>
  )
}

/** Botón de dos pasos para acciones con costo o irreversibles (sin diálogos del navegador). */
export function ConfirmButton({ action, label, confirm, className = 'btn sm' }: { action: () => Promise<unknown>; label: string; confirm: string; className?: string }) {
  const [armed, setArmed] = useState(false)
  const [pending, start] = useTransition()
  if (!armed)
    return (
      <button type="button" className={className} onClick={() => setArmed(true)}>
        {label}
      </button>
    )
  return (
    <span className="row">
      <span className="small">{confirm}</span>
      <button type="button" className="btn sm primary" disabled={pending} onClick={() => start(async () => void (await action(), setArmed(false)))}>
        {pending ? '…' : 'Confirmar'}
      </button>
      <button type="button" className="btn sm ghost" onClick={() => setArmed(false)}>
        Cancelar
      </button>
    </span>
  )
}

export function SubmitButton({ children, className = 'btn primary', pendingText = 'Procesando…' }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus()
  return (
    <button className={className} disabled={pending}>
      {pending ? pendingText : children}
    </button>
  )
}

/** Botón con `formAction` propio dentro de un form con varios: mientras corre, solo el tocado muestra el texto de espera. */
export function ActionButton({ action, children, pendingText, className = 'btn sm', disabled }: { action: (f: FormData) => Promise<void>; children: React.ReactNode; pendingText: string; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus()
  const [clicked, setClicked] = useState(false)
  const run = async (f: FormData) => {
    try {
      await action(f)
    } finally {
      setClicked(false)
    }
  }
  return (
    <button className={className} formAction={run} formNoValidate disabled={disabled || pending} onClick={() => setClicked(true)} aria-busy={clicked && pending}>
      {clicked && pending ? pendingText : children}
    </button>
  )
}

/** Recarga los datos de la página cada tantos segundos mientras haya algo en proceso. */
export function AutoRefresh({ every = 4000 }: { every?: number }) {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => router.refresh(), every)
    return () => clearInterval(t)
  }, [router, every])
  return null
}
