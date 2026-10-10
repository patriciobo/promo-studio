'use client'
// Paneles interactivos: asistente de promo.yaml, conexión con Meta y kit de perfil.
import { useState, useTransition } from 'react'
import { discover, draftManifestAction, openManifestPR, profileKitAction, runHealthCheck, saveConnection, validateManifestAction, type DiscoverResult } from '@/app/actions'
import type { Check } from '@/lib/onboarding/meta-health'
import type { ProfileKit } from '@/lib/onboarding/profile-kit'
import { CopyButton, Progress } from './client'

export function ManifestWizard({ slug, initialYaml, repo }: { slug: string; initialYaml: string; repo: string }) {
  const [yaml, setYaml] = useState(initialYaml)
  const [msg, setMsg] = useState<{ tone: string; text: string; url?: string } | null>(null)
  const [pending, start] = useTransition()
  const [expect, setExpect] = useState(10)
  const act = (fn: () => Promise<void>, secs = 5) => {
    setExpect(secs)
    start(async () => fn().catch((e) => setMsg({ tone: 'bad', text: e.message })))
  }
  return (
    <div className="stack">
      <div className="row">
        <button
          type="button"
          className="btn primary"
          disabled={pending}
          onClick={() =>
            act(async () => {
              setMsg({ tone: '', text: 'Leyendo el repositorio y armando el borrador…' })
              const r = await draftManifestAction(slug)
              if (r.yaml) setYaml(r.yaml)
              setMsg(r.error ? { tone: 'warn', text: `Borrador con ajustes pendientes: ${r.error}` } : { tone: 'ok', text: 'Borrador listo. Revisalo y editalo antes de guardarlo.' })
            }, 45)
          }
        >
          {yaml ? 'Regenerar borrador desde el repo' : 'Generar borrador desde el repo'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={pending || !yaml}
          onClick={() =>
            act(async () => {
              const r = await validateManifestAction(yaml)
              setMsg(r.ok ? { tone: 'ok', text: 'El promo.yaml es válido.' } : { tone: 'bad', text: r.error })
            })
          }
        >
          Validar
        </button>
        <button
          type="button"
          className="btn"
          disabled={pending || !yaml}
          onClick={() =>
            act(async () => {
              const r = await openManifestPR(slug, yaml)
              setMsg(r.url ? { tone: 'ok', text: 'Pull request abierto. Al mergearlo, sincronizá la app.', url: r.url } : { tone: 'bad', text: r.error ?? 'Error' })
            }, 10)
          }
        >
          Abrir pull request en {repo}
        </button>
        <a className="btn ghost" href={`data:text/yaml;charset=utf-8,${encodeURIComponent(yaml)}`} download="promo.yaml">
          Descargar
        </a>
      </div>
      {pending && <Progress expect={expect} />}
      {msg && (
        <p className={`notice ${msg.tone}`}>
          {msg.text}{' '}
          {msg.url && (
            <a href={msg.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
              Ver PR ↗
            </a>
          )}
        </p>
      )}
      <textarea className="mono" value={yaml} onChange={(e) => setYaml(e.target.value)} rows={28} spellCheck={false} placeholder="# El borrador aparece acá" />
    </div>
  )
}

export function ConnectionPanel({ slug, current }: { slug: string; current: { igUserId: string | null; adAccountId: string | null } }) {
  const [found, setFound] = useState<DiscoverResult | null>(null)
  const [checks, setChecks] = useState<Check[] | null>(null)
  const [pending, start] = useTransition()
  return (
    <div className="stack">
      <div className="row">
        <button type="button" className="btn" disabled={pending} onClick={() => start(async () => setFound(await discover()))}>
          Buscar cuentas
        </button>
        <button type="button" className="btn" disabled={pending} onClick={() => start(async () => setChecks(await runHealthCheck(slug, false)))}>
          Probar conexión
        </button>
        <button type="button" className="btn ghost" disabled={pending} onClick={() => start(async () => setChecks(await runHealthCheck(slug, true)))}>
          Probar con contenedor de prueba
        </button>
        {pending && <span className="small muted">Consultando a Meta…</span>}
      </div>
      {pending && <Progress expect={10} />}
      {found && !found.ok && (
        <p className="notice bad">
          <strong>{found.title}.</strong> {found.cause} {found.fix}
        </p>
      )}
      {found?.ok && (
        <form action={saveConnection.bind(null, slug)} className="card stack">
          {found.accounts.length === 0 && <p className="notice warn">El token no llega a ninguna página. Revisá B.4 y B.5.</p>}
          <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="small muted">Cuenta de Instagram de esta app</legend>
            {found.accounts.map((a) => (
              <label key={a.pageId} className="check">
                <input type="radio" name="account" value={`${a.pageId}|${a.igUserId ?? ''}|${a.igUsername ?? ''}`} defaultChecked={a.igUserId === current.igUserId} disabled={!a.igUserId} />
                {a.igUsername ? `@${a.igUsername}` : 'Sin Instagram vinculado (B.1/B.3)'} · página {a.pageName}
                {a.followers != null && <span className="muted"> · {a.followers} seguidores</span>}
              </label>
            ))}
          </fieldset>
          <label>
            Cuenta publicitaria <span className="hint">opcional hasta usar anuncios</span>
            <select name="adAccountId" defaultValue={current.adAccountId ?? ''}>
              <option value="">Sin cuenta publicitaria</option>
              {current.adAccountId && !found.ads.some((a) => a.id === current.adAccountId) && <option value={current.adAccountId}>{current.adAccountId} (guardada, el token no la ve)</option>}
              {found.ads.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency}){a.active ? '' : ' · inactiva'}
                  {a.via === 'asignada' ? '' : ` · ${a.via}, falta asignarla al usuario de sistema`}
                </option>
              ))}
            </select>
          </label>
          {found.ads.length === 0 && (
            <p className="notice warn small">
              El token no ve ninguna cuenta publicitaria. En Business Manager → Usuarios del sistema → tu usuario → Asignar activos → Cuentas publicitarias, dale &quot;Administrar campañas&quot;. Si el token
              se generó antes de asignarla, no hace falta regenerarlo.
              {found.adErrors.length > 0 && <span className="xs"> Meta respondió: {found.adErrors.join(' · ')}</span>}
            </p>
          )}
          <label>
            O escribí el id <span className="hint">p. ej. act_1234567890 (está en Administrador de anuncios, arriba a la izquierda)</span>
            <input name="adAccountManual" placeholder="act_…" pattern="(act_)?[0-9]+" />
          </label>
          <div>
            <button className="btn primary">Guardar conexión</button>
          </div>
        </form>
      )}
      {checks && (
        <div className="card">
          {checks.map((c) => (
            <div key={c.id} className="check-row">
              <span className={`dot ${c.ok ? 'ok' : 'bad'}`} />
              <div className="stack-sm">
                <strong className="small">{c.label}</strong>
                <span className="small muted">{c.detail}</span>
                {c.fix && <span className="small" style={{ color: 'var(--danger)' }}>→ {c.fix}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ProfileKitPanel({ slug, mediaBase }: { slug: string; mediaBase: string }) {
  const [kit, setKit] = useState<ProfileKit | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [done, setDone] = useState<Record<string, boolean>>({})
  const tick = (k: string) => (
    <input type="checkbox" checked={!!done[k]} onChange={(e) => setDone({ ...done, [k]: e.target.checked })} aria-label="Hecho" />
  )
  return (
    <div className="stack">
      <div className="row">
        <button
          type="button"
          className="btn primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await profileKitAction(slug)
              setKit(r.kit ?? null)
              setError(r.error ?? null)
            })
          }
        >
          {pending ? 'Generando…' : kit ? 'Regenerar kit' : 'Generar kit de perfil'}
        </button>
        <span className="small muted">Usa 1 llamada al modelo de texto.</span>
      </div>
      {pending && <Progress expect={40} />}
      {error && <p className="notice bad">{error}</p>}
      {kit && (
        <div className="grid-2">
          <section className="card stack">
            <h2 className="row">{tick('photo')} Foto de perfil</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${mediaBase}/${kit.photo}`} alt="Foto de perfil" style={{ width: 160, borderRadius: '50%', border: '1px solid var(--border)' }} />
            <a className="btn sm" href={`${mediaBase}/${kit.photo}`} download>
              Descargar PNG
            </a>
          </section>
          <section className="card stack">
            <h2 className="row">{tick('name')} Nombre (campo buscable, máx. 30)</h2>
            {kit.names.map((n) => (
              <div key={n} className="row between">
                <span>{n}</span>
                <CopyButton text={n} />
              </div>
            ))}
          </section>
          <section className="card stack">
            <h2 className="row">{tick('bio')} Bio (máx. 150)</h2>
            {kit.bios.map((b) => (
              <div key={b} className="row between" style={{ alignItems: 'flex-start' }}>
                <span className="small" style={{ flex: 1 }}>
                  {b} <span className="muted xs">({b.length})</span>
                </span>
                <CopyButton text={b} />
              </div>
            ))}
          </section>
          <section className="card stack">
            <h2 className="row">{tick('link')} Link y categoría</h2>
            <div className="row between">
              <span className="mono">{kit.link}</span>
              <CopyButton text={kit.link} />
            </div>
            <p className="small muted">Página de links con UTM: los clics se cuentan en Rendimiento.</p>
            <p className="small">
              Categoría sugerida: <strong>{kit.category}</strong>
            </p>
          </section>
          <section className="card stack" style={{ gridColumn: '1 / -1' }}>
            <h2 className="row">{tick('highlights')} Destacadas</h2>
            <p className="small muted">Publicá cada portada como story y agregala a una destacada desde el teléfono (la API no administra destacadas).</p>
            <div className="thumbs vertical">
              {kit.highlightCovers.map((h) => (
                <a key={h.path} href={`${mediaBase}/${h.path}`} download title={h.label}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${mediaBase}/${h.path}`} alt={h.label} />
                </a>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
