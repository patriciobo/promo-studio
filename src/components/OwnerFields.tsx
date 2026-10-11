'use client'
// De quién es la cuenta de Instagram de la app: propia o de un cliente. Las de clientes se ven aparte en la barra lateral.
import Link from 'next/link'
import { useState } from 'react'

export function OwnerFields({ owner, clientName }: { owner: string; clientName: string | null }) {
  const [client, setClient] = useState(owner === 'client')
  return (
    <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend>
        <strong>¿De quién es la cuenta?</strong>
      </legend>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <label className="check">
          <input type="radio" name="owner" value="own" checked={!client} onChange={() => setClient(false)} /> Mía
        </label>
        <label className="check">
          <input type="radio" name="owner" value="client" checked={client} onChange={() => setClient(true)} /> De un cliente
        </label>
      </div>
      {client && (
        <label>
          Cliente <span className="hint">nombre de la persona o el negocio; agrupa sus apps en la barra lateral</span>
          <input name="clientName" defaultValue={clientName ?? ''} maxLength={80} placeholder="Ej.: Panadería Don Juan" />
        </label>
      )}
      {client && (
        <span className="xs muted">
          La cuenta sigue siendo del cliente: te la comparte como socio. Pasos en la <Link href="/guia#clientes">Guía de conexión, sección C</Link>.
        </span>
      )}
    </fieldset>
  )
}
