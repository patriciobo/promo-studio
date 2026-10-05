'use client'
// Sugerencias de la campaña con el modelo de texto: primero muestra el costo estimado, después el porqué de cada campo.
import { useEffect, useState, useTransition } from 'react'
import { suggestAction, suggestEstimateAction } from '@/app/actions'
import type { ResolvedSuggestion, SuggestInput } from '@/lib/ad-suggest'
import { CTAS, DETAIL_TYPES, EDUCATION, OBJECTIVES } from '@/lib/meta-ads-options'

const usd = (n: number) => `US$ ${n < 0.01 ? n.toFixed(4) : n.toFixed(3)}`.replace('.', ',')
const typeLabel = (t: string) => DETAIL_TYPES.find((d) => d.id === t)?.label ?? t

export function SuggestPanel({ slug, input, currency, onApply }: { slug: string; input: SuggestInput; currency: string; onApply: (s: ResolvedSuggestion) => void }) {
  const [open, setOpen] = useState(false)
  const [estimate, setEstimate] = useState<{ usd: number | null; model: string; inputTokens: number; outputTokens: number } | string | null>(null)
  const [result, setResult] = useState<ResolvedSuggestion | string | null>(null)
  const [applied, setApplied] = useState(false)
  const [pending, start] = useTransition()
  const key = JSON.stringify(input)

  // El costo depende de lo que se le manda (publicaciones elegidas, pieza nueva): se recalcula al cambiar.
  useEffect(() => {
    if (!open) return
    let live = true
    suggestEstimateAction(slug, JSON.parse(key)).then((r) => live && setEstimate(r.ok ? r : r.error))
    return () => {
      live = false
    }
  }, [open, key, slug])

  const s = typeof result === 'object' ? result : null
  return (
    <section className="card stack">
      <div className="row between">
        <div className="stack-sm">
          <h2>Sugerir con IA</h2>
          <p className="small muted">El modelo de texto de la app propone objetivo, presupuesto y, sobre todo, el público: intereses, cargos, sectores, estudios y más, según la app, las piezas elegidas y cómo rindieron tus campañas anteriores.</p>
        </div>
        {!open && (
          <button type="button" className="btn" onClick={() => setOpen(true)}>
            Ver costo y sugerir
          </button>
        )}
      </div>
      {open && (
        <>
          <p className="small">
            {estimate == null
              ? 'Calculando el costo…'
              : typeof estimate === 'string'
                ? `No se pudo estimar: ${estimate}`
                : estimate.usd != null
                  ? `Costo estimado: ~${usd(estimate.usd)} con ${estimate.model} (~${estimate.inputTokens.toLocaleString('es-AR')} tokens de entrada y ~${estimate.outputTokens.toLocaleString('es-AR')} de salida). Buscar las opciones en Meta no cuesta nada.`
                  : `No se encontró el precio de ${estimate.model} en OpenRouter; el costo real se muestra al terminar.`}
          </p>
          <div className="row">
            <button
              type="button"
              className="btn primary"
              disabled={pending || (!input.postIds.length && !input.newPostTopic)}
              onClick={() =>
                start(async () => {
                  setApplied(false)
                  const r = await suggestAction(slug, input)
                  setResult(r.ok ? r.suggestion : r.error)
                })
              }
            >
              {pending ? 'Pensando…' : s ? 'Volver a sugerir' : 'Generar sugerencias'}
            </button>
            {!input.postIds.length && !input.newPostTopic && <span className="xs muted">Elegí al menos una publicación o describí la pieza nueva.</span>}
          </div>
        </>
      )}
      {typeof result === 'string' && <p className="notice bad small">{result}</p>}
      {s && (
        <div className="stack">
          <dl className="suggest-list">
            <dt>Objetivo</dt>
            <dd>
              <strong>{OBJECTIVES.find((o) => o.id === s.objective)?.label}</strong> · botón {CTAS.find((c) => c.id === s.cta)?.label}
              <span className="muted"> — {s.objectiveWhy}</span>
            </dd>
            <dt>Presupuesto</dt>
            <dd>
              <strong>
                {s.budget} {currency} {s.budgetType === 'DAILY' ? 'por día' : 'en total'} · {s.days} días
              </strong>
              <span className="muted"> — {s.budgetWhy}</span>
            </dd>
            <dt>Público</dt>
            <dd>
              <strong>
                {s.resolvedPlaces.length ? s.resolvedPlaces.map((p) => p.name).join(', ') : s.countries.join(', ')} · {s.ageMin}–{s.ageMax} años
                {s.gender !== 'all' ? ` · ${s.gender === 'female' ? 'mujeres' : 'hombres'}` : ''}
                {s.education.length ? ` · ${s.education.map((id) => EDUCATION.find((e) => e.id === id)?.label).join(', ')}` : ''}
              </strong>
              <span className="muted"> — {s.audienceWhy}</span>
            </dd>
            {s.resolvedGroups.map((g, i) => (
              <div key={i} style={{ display: 'contents' }}>
                <dt>{i === 0 ? 'Segmentación' : 'Y además'}</dt>
                <dd className="row" style={{ gap: 6 }}>
                  {g.map((d) => (
                    <span key={`${d.type}-${d.id}`} className="badge info">
                      <span className="muted">{typeLabel(d.type)}:</span>&nbsp;{d.name}
                    </span>
                  ))}
                </dd>
              </div>
            ))}
            <dt>Advantage+</dt>
            <dd>
              <strong>{s.advantage ? 'Sí' : 'No'}</strong> · {s.placements === 'instagram' ? 'sólo Instagram' : 'Instagram y Facebook'}
              <span className="muted"> — {s.advantageWhy}</span>
            </dd>
          </dl>
          {s.missing.length > 0 && <p className="xs muted">Meta no tiene estas opciones (se omitieron): {s.missing.join(' · ')}</p>}
          {s.tips.length > 0 && (
            <ul className="small">
              {s.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          <div className="row">
            <button type="button" className="btn primary" onClick={() => (onApply(s), setApplied(true))}>
              {applied ? 'Aplicadas ✓' : 'Aplicar sugerencias al formulario'}
            </button>
            <span className="xs muted">Costo real: {usd(s.cost)}. Después de aplicar podés editar todo.</span>
          </div>
        </div>
      )}
    </section>
  )
}
