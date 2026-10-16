import { createApp } from '@/app/actions'
import { SubmitButton } from '@/components/client'
import { OwnerFields } from '@/components/OwnerFields'
import { ImageModelPicker } from '@/components/ModelPicker'
import { imagesPerMonth } from '@/lib/models'
import { listSamples } from '@/lib/style-samples'
import { imageModels } from '@/lib/openrouter'

export default async function NewApp({ searchParams }: PageProps<'/apps/nueva'>) {
  const { de, sin } = await searchParams
  const client = de === 'cliente'
  // Sin repositorio: el promo.yaml se arma con una descripción del negocio y queda guardado en Promo Studio.
  const noRepo = sin === 'repo'
  const toggle = `/apps/nueva?${new URLSearchParams({ ...(client ? { de: 'cliente' } : {}), ...(noRepo ? {} : { sin: 'repo' }) })}`
  const images = await imageModels().catch(() => [])
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{client ? 'Conectar cuenta de un cliente' : 'Conectar app'}</h1>
          <p>
            {noRepo
              ? 'Paso 1 de 3: contá qué es el negocio. Con eso se arma el promo.yaml (lo revisás en el paso siguiente) y después conectás la cuenta de Instagram.'
              : 'Paso 1 de 3: el repositorio. Después el asistente arma el promo.yaml y conectás la cuenta de Instagram.'}{' '}
            <a href={toggle} style={{ textDecoration: 'underline' }}>
              {noRepo ? 'Tiene repositorio en GitHub' : 'No tiene repositorio (un comercio, un profesional, una marca)'}
            </a>
          </p>
        </div>
      </div>
      <form action={createApp} className="card stack" style={{ maxWidth: 960 }}>
        {noRepo ? (
          <label>
            Descripción del negocio
            <textarea name="description" rows={7} maxLength={4000} required placeholder="Ej.: Panadería de masa madre en Palermo, abierta desde 2019. Hacemos pan, facturas y tortas por encargo; también vendemos por WhatsApp con envío en el barrio. Clientes: familias y oficinas de la zona. Queremos transmitir algo artesanal y cálido. Web: panaderia.com.ar · Instagram: @panaderia" />
            <span className="hint">Qué vende o hace, para quién, dónde, cómo se lo contacta y cómo quiere que se la vea. Cuanto más concreto, mejor: el modelo no inventa lo que no está.</span>
          </label>
        ) : (
          <label>
            Repositorio de GitHub
            <input name="repo" required placeholder="https://github.com/usuario/mi-app" />
            <span className="hint">El token de GitHub (Configuración) tiene que tener acceso a este repo.</span>
          </label>
        )}
        <OwnerFields owner={client ? 'client' : 'own'} clientName={null} />
        <div className="form-grid">
          <label>
            Nombre
            <input name="name" placeholder={noRepo ? 'Panadería Lupa' : 'Mi App'} required={noRepo} />
          </label>
          <label>
            Identificador
            <input name="slug" placeholder="mi-app" pattern="[a-z0-9-]*" />
            <span className="hint">Para las URLs (/l/mi-app)</span>
          </label>
          {!noRepo && (
            <label>
              Rama
              <input name="branch" defaultValue="main" />
            </label>
          )}
        </div>
        <div className="stack-sm">
          <strong>Modelo de imagen de OpenRouter</strong>
          <span className="hint">Lo podés cambiar después en Ajustes. El estimado mensual usa la cadencia por defecto (3 posts y 2 stories por semana).</span>
          <ImageModelPicker current={null} quality={null} kind={null} imagesPerMonth={imagesPerMonth({ feed: 3, reels: 1, stories: 2 })} available={images} designStyle={null} samples={await listSamples()} />
        </div>
        <div>
          <SubmitButton pendingText={noRepo ? 'Armando el promo.yaml…' : 'Conectando…'} expect={noRepo ? 40 : 10}>Conectar y seguir</SubmitButton>
        </div>
      </form>
    </>
  )
}
