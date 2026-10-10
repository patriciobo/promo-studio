import { chooseSampleAction, styleSamplesAction, suggestStylesAction } from '@/app/actions'
import { AutoRefresh } from '@/components/client'
import { SamplesBoard } from '@/components/SamplesBoard'
import { db } from '@/lib/db'
import type { Manifest } from '@/lib/manifest'
import { IMAGE_MODELS } from '@/lib/models'
import { exampleApp, genericOrigin, listSamples, samplesState } from '@/lib/style-samples'
import { parseDesignStyle, SAMPLE_MODEL, SAMPLE_QUALITIES, type StyleSuggestion } from '@/lib/styles'

export default async function Samples({ params, searchParams }: PageProps<'/apps/[slug]/muestras'>) {
  const { slug } = await params
  const { aviso, error } = await searchParams
  const app = await db.app.findUniqueOrThrow({ where: { slug } })
  const [generic, mine, origin, example, genericState, mineState] = await Promise.all([listSamples(), listSamples(slug), genericOrigin(), exampleApp(), samplesState(), samplesState(slug)])
  const isExample = example?.id === app.id
  // Las genéricas viejas (sin origen guardado) se hicieron con la marca de prueba.
  const hasGeneric = Object.keys(generic).length > 0
  const madeWith = origin ?? (hasGeneric ? 'Rumbo (marca de prueba)' : null)
  const exampleName = example ? ((example.manifest as unknown as Manifest | null)?.name ?? example.name) : null
  const outdated = hasGeneric && !!exampleName && madeWith !== exampleName
  const style = parseDesignStyle(app.designStyle)
  const q = SAMPLE_QUALITIES.find((x) => x === app.imageQuality)
  const running = genericState?.status === 'running' || mineState?.status === 'running'
  const choose = async (s: string, quality: string) => {
    'use server'
    await chooseSampleAction(slug, s, quality)
  }
  return (
    <div className="stack" style={{ maxWidth: 1100 }}>
      {running && <AutoRefresh every={5000} />}
      {aviso === 'muestras' && <p className="notice">Pedí las muestras: el worker las genera de a una y esta página se actualiza sola.</p>}
      {aviso === 'sugeridos' && <p className="notice ok">Listo: los estilos sugeridos quedaron primeros, con el porqué.</p>}
      {typeof error === 'string' && <p className="notice bad">{error}</p>}
      {!example && (
        <p className="notice warn small">
          No encontré la app Fogón: los ejemplos genéricos se hacen con una marca inventada. Para usar otra app de ejemplo, poné su identificador en <code>SAMPLES_APP</code>.
        </p>
      )}
      {isExample && <p className="notice small">{app.name} es la app de los ejemplos genéricos: sus muestras son las que ven todas las apps.</p>}
      <form className="stack">
        <SamplesBoard
          key={mineState?.started ?? 'idle'}
          appName={app.name}
          genericName={madeWith ?? exampleName ?? 'la marca de prueba'}
          exampleName={exampleName}
          outdated={outdated}
          isExample={isExample}
          generic={generic}
          mine={isExample ? generic : mine}
          suggestions={(app.styleSuggestions as StyleSuggestion[] | null) ?? []}
          prices={IMAGE_MODELS.find((m) => m.id === SAMPLE_MODEL)!.qualities!}
          current={style && q && app.imageModel === SAMPLE_MODEL ? { id: style, q } : null}
          state={{ mine: isExample ? null : mineState, generic: genericState }}
          actions={{ samples: styleSamplesAction.bind(null, slug, false), generic: styleSamplesAction.bind(null, slug, true), suggest: suggestStylesAction.bind(null, slug, 'muestras'), choose }}
        />
      </form>
    </div>
  )
}
