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

/** Estimado sin datos reales: avanza parejo hasta el 90% en el tiempo esperado y después se arrastra hacia el 99%. */
const estimate = (secs: number, expect: number) => (secs < expect ? (0.9 * secs) / expect : 0.9 + 0.09 * (1 - Math.exp(-(secs - expect) / expect)))
const clock = (s: number) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`)

/**
 * Barra de progreso para lo que tarda más de 3 s. Con `value` (0 a 1) muestra el avance real;
 * sin él, uno estimado según `expect` (segundos que suele tardar). `since` es cuándo empezó (si no, al montarse).
 * Con `steps` (piezas en total), entre una pieza y la siguiente avanza según el tiempo, sin pasar la que está en curso.
 */
export function Progress({ value, steps, since, expect, label, delay = 3 }: { value?: number; steps?: number; since?: Date | string | number; expect: number; label?: string; delay?: number }) {
  const [start] = useState(() => (since ? new Date(since).getTime() : Date.now()))
  const [now, setNow] = useState(start)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [])
  const secs = Math.max(0, Math.round((now - start) / 1000))
  if (secs < delay) return null
  const guess = estimate(secs, expect)
  const p = Math.min(1, Math.max(0, value === undefined ? guess : steps ? Math.max(value, Math.min(value + 0.9 / steps, guess)) : value))
  const left = value === undefined || !value ? (secs < expect ? `quedan ~${clock(expect - secs)}` : 'casi listo…') : `quedan ~${clock(Math.round((secs * (1 - value)) / value))}`
  return (
    <span className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)} aria-label={label ?? 'Progreso'}>
      <span className="progress-track">
        <span className="progress-bar" style={{ width: `${p * 100}%` }} />
      </span>
      <span className="xs muted">
        {label ? `${label} · ` : ''}
        {Math.round(p * 100)}% · {clock(secs)}
        {left ? ` · ${left}` : ''}
      </span>
    </span>
  )
}

export function SubmitButton({ children, className = 'btn primary', pendingText = 'Procesando…', expect }: { children: React.ReactNode; className?: string; pendingText?: string; expect?: number }) {
  const { pending } = useFormStatus()
  const button = (
    <button className={className} disabled={pending}>
      {pending ? pendingText : children}
    </button>
  )
  if (!expect) return button
  return (
    <span className="with-progress">
      {button}
      {pending && <Progress expect={expect} />}
    </span>
  )
}

/** Botón con `formAction` propio dentro de un form con varios: mientras corre, solo el tocado muestra el texto de espera. */
export function ActionButton({ action, children, pendingText, className = 'btn sm', disabled, expect }: { action: (f: FormData) => Promise<void>; children: React.ReactNode; pendingText: string; className?: string; disabled?: boolean; expect?: number }) {
  const { pending } = useFormStatus()
  const [clicked, setClicked] = useState(false)
  const run = async (f: FormData) => {
    try {
      await action(f)
    } finally {
      setClicked(false)
    }
  }
  const button = (
    <button className={className} formAction={run} formNoValidate disabled={disabled || pending} onClick={() => setClicked(true)} aria-busy={clicked && pending}>
      {clicked && pending ? pendingText : children}
    </button>
  )
  if (!expect) return button
  return (
    <span className="with-progress">
      {button}
      {clicked && pending && <Progress expect={expect} />}
    </span>
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
