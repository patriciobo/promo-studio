'use client'
// Subida de videos a la biblioteca: uno por vez, directo al disco del servidor (PUT /api/library/<app>), con progreso.
// No pasa por una server action porque los videos de celular superan su límite de tamaño.
import { useRouter } from 'next/navigation'
import { useState } from 'react'

function put(url: string, file: File, onProgress: (p: number) => void) {
  return new Promise<void>((ok, fail) => {
    const x = new XMLHttpRequest()
    x.open('PUT', url)
    x.setRequestHeader('Content-Type', file.type || 'video/mp4')
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    x.onload = () => {
      if (x.status < 300) return ok()
      let msg = `HTTP ${x.status}`
      try {
        msg = (JSON.parse(x.responseText) as { error?: string }).error ?? msg
      } catch {}
      fail(new Error(msg))
    }
    x.onerror = () => fail(new Error('se cortó la conexión'))
    x.send(file)
  })
}

export function VideoUpload({ slug }: { slug: string }) {
  const router = useRouter()
  const [files, setFiles] = useState<File[]>([])
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  async function upload() {
    setBusy(true)
    setErrors([])
    const errs: string[] = []
    for (const [i, f] of files.entries()) {
      const name = `${f.name} (${i + 1}/${files.length})`
      try {
        setStatus(`Subiendo ${name}…`)
        await put(`/api/library/${encodeURIComponent(slug)}?note=${encodeURIComponent(note)}`, f, (p) => setStatus(p < 1 ? `Subiendo ${name}: ${Math.round(p * 100)}%` : `Procesando ${name}…`))
      } catch (e) {
        errs.push(`${f.name}: ${(e as Error).message}`)
      }
    }
    setErrors(errs)
    setStatus(null)
    setBusy(false)
    setFiles([])
    router.refresh()
  }

  return (
    <div className="stack">
      <label>
        Videos <span className="hint">MP4, MOV o WebM, hasta 300 MB cada uno. Lo mejor: tomas propias de 5 a 30 segundos, verticales o horizontales.</span>
        <input type="file" accept="video/mp4,video/quicktime,video/webm" multiple disabled={busy} onChange={(e) => setFiles([...(e.target.files ?? [])])} />
      </label>
      <label>
        Nota <span className="hint">opcional: qué lugar es (ayuda a que el plan lo nombre bien)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} disabled={busy} placeholder="Por ejemplo: Cascada de Los Hornillos, Traslasierra" />
      </label>
      <div className="row">
        <button type="button" className="btn primary" disabled={busy || !files.length} onClick={upload}>
          {busy ? 'Subiendo…' : `Subir ${files.length > 1 ? `${files.length} videos` : 'video'}`}
        </button>
        {status && <span className="small muted">{status}</span>}
      </div>
      {errors.map((e) => (
        <p key={e} className="notice bad small">
          {e}
        </p>
      ))}
    </div>
  )
}
