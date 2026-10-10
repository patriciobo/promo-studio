import { saveSecrets } from '@/app/actions'
import { CopyButton, SubmitButton } from '@/components/client'
import { spentThisMonth } from '@/lib/budget'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { getSecret, mask, type SecretKey } from '@/lib/settings'
import { webhookUrl } from '@/lib/whatsapp'
import { usd } from '@/lib/view'

const FIELDS: { key: SecretKey; label: string; hint: string }[] = [
  { key: 'META_TOKEN', label: 'Token de Meta (usuario de sistema)', hint: 'Paso A.5 de la guía. No vence.' },
  { key: 'OPENROUTER_API_KEY', label: 'API key de OpenRouter', hint: 'openrouter.ai/keys — poné un límite de crédito a la key.' },
  { key: 'GITHUB_TOKEN', label: 'Token de GitHub (fine-grained)', hint: 'Lectura de Contents y Metadata en los repos; para abrir PRs, escritura en Contents y Pull requests.' },
  { key: 'WAHA_URL', label: 'WAHA: URL', hint: 'WhatsApp (opcional): aprobación de los clientes y avisos, p. ej. http://waha:3000' },
  { key: 'WAHA_API_KEY', label: 'WAHA: API key', hint: 'Si tu WAHA la pide.' },
  { key: 'WAHA_CHAT_ID', label: 'WAHA: número de origen', hint: 'El número conectado a WAHA, p. ej. 5493511234567: desde ahí salen los mensajes a los clientes y ahí llegan sus respuestas. Los avisos para vos van al chat con vos mismo de ese número.' },
]

export default async function Config() {
  const values = await Promise.all(FIELDS.map((f) => getSecret(f.key)))
  const [global, byApp] = await Promise.all([spentThisMonth(), db.usageLedger.groupBy({ by: ['appId', 'kind'], _sum: { costUsd: true }, _count: true, where: { createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } })])
  const apps = await db.app.findMany({ select: { id: true, name: true } })
  const name = (id: string | null) => apps.find((a) => a.id === id)?.name ?? 'Sin app (asistentes)'
  return (
    <div className="stack" style={{ gap: 20, maxWidth: 820 }}>
      <div className="page-head">
        <div>
          <h1>Configuración</h1>
          <p>Las claves se guardan cifradas. Dejá un campo vacío para no cambiarlo; escribí __borrar__ para quitarlo.</p>
        </div>
      </div>
      <form action={saveSecrets} className="card stack">
        <h2>Claves</h2>
        {FIELDS.map((f, i) => (
          <label key={f.key}>
            {f.label} {values[i] ? <span className="badge ok">{mask(values[i])}</span> : <span className="badge">sin cargar</span>}
            <input name={f.key} type="password" autoComplete="off" placeholder={values[i] ? 'Cargado — escribí para reemplazar' : ''} />
            <span className="hint">{f.hint}</span>
          </label>
        ))}
        <div>
          <SubmitButton pendingText="Guardando…">Guardar claves</SubmitButton>
        </div>
      </form>
      <section className="card stack-sm">
        <h2>Respuestas de los clientes por WhatsApp</h2>
        <p className="small">
          Para que las respuestas aprueben las publicaciones, en la sesión de WAHA del número de origen agregá un webhook con el evento <code>message</code> y esta URL (o poné <code>WHATSAPP_HOOK_URL</code> y <code>WHATSAPP_HOOK_EVENTS=message</code> en el WAHA):
        </p>
        <p className="row" style={{ gap: 8 }}>
          <code style={{ overflowWrap: 'anywhere' }}>{webhookUrl()}</code> <CopyButton text={webhookUrl()} />
        </p>
        <p className="xs muted">El WhatsApp de cada cliente se carga en los Ajustes de su app. Lo que el cliente escriba y no sea una aprobación te llega como aviso.</p>
      </section>
      <section className="card stack">
        <h2>Gasto en OpenRouter este mes</h2>
        <p>
          <strong className="num">{usd(global)}</strong> de {usd(env.globalBudgetUsd)} (tope global, variable GLOBAL_BUDGET_USD)
        </p>
        <table>
          <thead>
            <tr>
              <th>App</th>
              <th>Tipo</th>
              <th>Llamadas</th>
              <th>Costo</th>
            </tr>
          </thead>
          <tbody>
            {byApp.map((r) => (
              <tr key={`${r.appId}-${r.kind}`}>
                <td>{name(r.appId)}</td>
                <td>{r.kind === 'image' ? 'Imágenes' : 'Texto'}</td>
                <td className="num">{r._count}</td>
                <td className="num">{usd(r._sum.costUsd ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card stack">
        <h2>Servicio</h2>
        <p className="small">
          URL pública: <code>{env.publicUrl}</code> {/^https:\/\//.test(env.publicUrl) ? <span className="badge ok">HTTPS</span> : <span className="badge warn">Instagram necesita HTTPS público</span>}
        </p>
      </section>
    </div>
  )
}
