// Selector compacto de tipo y modelo de imagen para poner al lado de los botones de generar.
// Arranca en lo elegido en Ajustes de la app; lo elegido se usa sólo para esa generación.
import { parseKindChoice } from '@/lib/models'
import { ModelSelectFields } from './ModelSelectFields'

/** `kind`: tipo con el que arranca el selector si no es el de Ajustes (p. ej. el que ya tiene la publicación). */
export function ModelSelect({ app, label = 'Modelo de imagen', kind }: { app: { imageModel: string | null; imageQuality: string | null; imageKind: string | null }; label?: string; kind?: string | null }) {
  // Sólo estos campos llegan al cliente.
  return <ModelSelectFields imageModel={app.imageModel} imageQuality={app.imageQuality} imageKind={parseKindChoice(kind) ?? parseKindChoice(app.imageKind) ?? 'illustration'} label={label} />
}
