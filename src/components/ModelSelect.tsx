// Selector compacto de tipo y modelo de imagen para poner al lado de los botones de generar.
// Arranca en lo elegido en Ajustes de la app; lo elegido se usa sólo para esa generación.
import { parseImageKind } from '@/lib/models'
import { ModelSelectFields } from './ModelSelectFields'

export function ModelSelect({ app, label = 'Modelo de imagen' }: { app: { imageModel: string | null; imageQuality: string | null; imageKind: string | null }; label?: string }) {
  // Sólo estos campos llegan al cliente.
  return <ModelSelectFields imageModel={app.imageModel} imageQuality={app.imageQuality} imageKind={parseImageKind(app.imageKind) ?? 'illustration'} label={label} />
}
