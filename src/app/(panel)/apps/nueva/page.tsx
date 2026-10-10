import { createApp } from '@/app/actions'
import { SubmitButton } from '@/components/client'
import { ImageModelPicker } from '@/components/ModelPicker'
import { imagesPerMonth } from '@/lib/models'
import { listSamples } from '@/lib/style-samples'
import { imageModels } from '@/lib/openrouter'

export default async function NewApp() {
  const images = await imageModels().catch(() => [])
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Conectar app</h1>
          <p>Paso 1 de 3: el repositorio. Después el asistente arma el promo.yaml y conectás la cuenta de Instagram.</p>
        </div>
      </div>
      <form action={createApp} className="card stack" style={{ maxWidth: 960 }}>
        <label>
          Repositorio de GitHub
          <input name="repo" required placeholder="https://github.com/usuario/mi-app" />
          <span className="hint">El token de GitHub (Configuración) tiene que tener acceso a este repo.</span>
        </label>
        <div className="form-grid">
          <label>
            Nombre
            <input name="name" placeholder="Mi App" />
          </label>
          <label>
            Identificador
            <input name="slug" placeholder="mi-app" pattern="[a-z0-9-]*" />
            <span className="hint">Para las URLs (/l/mi-app)</span>
          </label>
          <label>
            Rama
            <input name="branch" defaultValue="main" />
          </label>
        </div>
        <div className="stack-sm">
          <strong>Modelo de imagen de OpenRouter</strong>
          <span className="hint">Lo podés cambiar después en Ajustes. El estimado mensual usa la cadencia por defecto (3 posts y 2 stories por semana).</span>
          <ImageModelPicker current={null} quality={null} kind={null} imagesPerMonth={imagesPerMonth({ feed: 3, reels: 1, stories: 2 })} available={images} designStyle={null} samples={await listSamples()} />
        </div>
        <div>
          <SubmitButton pendingText="Conectando…">Conectar y seguir</SubmitButton>
        </div>
      </form>
    </>
  )
}
