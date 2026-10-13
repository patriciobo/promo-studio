// Variedad de las imágenes IA: cada post sortea su gente, escenario, encuadre, luz y una variación de la técnica,
// así las semanas no repiten siempre las mismas personas ni el mismo dibujo. Dentro de un post se mantiene todo igual.
import type { ImageKind, KindChoice } from './models'

export type Rng = () => number

/** Lo sorteado para un post: tipo de imagen, estética final y la escena que el modelo de texto usa en sus imagePrompts. */
export interface Look {
  kind: ImageKind
  /** Estética completa (en inglés) que se manda con cada imagen del post. */
  style: string
  people: string
  setting: string
  framing: string
  light: string
}

const pick = <T>(xs: readonly T[], rng: Rng): T => xs[Math.floor(rng() * xs.length) % xs.length]

/** Mezcla (Fisher-Yates): para repartir sin repetir entre los posts de una semana. */
export function shuffle<T>(xs: readonly T[], rng: Rng): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Saca `n` elementos rotando una mezcla: no se repite ninguno hasta agotar la lista. */
const draw = <T>(xs: readonly T[], n: number, rng: Rng): T[] => {
  const out: T[] = []
  while (out.length < n) out.push(...shuffle(xs, rng))
  return out.slice(0, n)
}

const AGES = ['a teenager', 'a person in their early twenties', 'a person around thirty', 'a person in their forties', 'a person in their fifties', 'a person in their sixties', 'an older person in their seventies']
const GENDERS = ['woman', 'man', 'woman', 'man', 'non-binary person']
const LOOKS = [
  'dark brown skin and short curly hair',
  'light olive skin and long straight dark hair',
  'pale freckled skin and messy red hair',
  'east asian features and a short bob',
  'tan skin and a shaved head',
  'gray hair and thick glasses',
  'black box braids',
  'a full beard and wavy hair',
  'a headscarf',
  'wavy blond hair going a bit gray',
  'indigenous south american features and long black hair',
  'medium brown skin and a high ponytail',
  'a receding hairline and stubble',
  'curly dyed hair and small earrings',
  'south asian features and a neat side part',
]
const BUILDS = ['slim', 'average build', 'plus-size', 'stocky', 'tall and lanky', 'short and sturdy', 'with a bit of a belly']
const CLOTHES = ['a worn hoodie', 'work overalls', 'a plain faded t-shirt', 'a chunky knitted sweater', 'a button-down shirt with rolled sleeves', 'old sportswear', 'a shop apron', 'a denim jacket', 'pajamas', 'a raincoat', 'a uniform polo shirt', 'a flannel shirt']
const GROUPS = ['one person', 'one person', 'two people', 'a small group of three or four people', 'just the hands of one person (no face)', 'a parent and a child', 'two friends of very different ages']

export const SETTINGS = [
  'a cluttered home kitchen',
  'a crowded bus or subway car',
  'a small neighborhood shop counter',
  'a park bench',
  'a busy sidewalk',
  'a living room couch with a messy blanket',
  'an improvised home office corner',
  'a small café table',
  'a balcony with potted plants',
  'a workshop or garage',
  'inside a parked car',
  'a school or university hallway',
  'the sideline of a local sports field',
  'a bedroom at night',
  'an outdoor market stall',
  'an office break room',
  'a waiting room',
  'a doorstep or building entrance',
]
export const FRAMINGS = [
  'close-up on hands and the phone',
  'medium shot from the side',
  'wide shot where the person is small in the scene',
  'over-the-shoulder view',
  'high angle from above',
  'low angle from below',
  'person seen partly from behind',
  'off-center composition with lots of empty space on one side',
]
const LIGHTS = ['early morning light', 'flat midday light', 'warm late-afternoon light', 'gray overcast daylight', 'warm indoor lamps in the evening', 'night, lit mostly by the screen', 'mixed window light and indoor bulbs']

/** Técnicas para el clásico sin brand.imageStyle: el vector plano siempre igual era lo que más se repetía. */
export const TECHNIQUES = [
  'flat vector illustration with grainy texture and bold color blocks',
  'gouache painting illustration, visible brush strokes, matte colors',
  'editorial illustration with thick outlines and exaggerated proportions',
  'isometric illustration with small detailed figures',
  'linocut print illustration, carved lines, two or three inks',
  'watercolor and ink illustration, loose washes, delicate linework',
  'colored pencil illustration, visible hatching, paper texture',
  'cut paper illustration, layered shapes with soft shadows',
  'geometric minimal illustration, simple shapes, no outlines',
  'comic book illustration, inked lines, halftone shading',
  'risograph illustration, overlapping inks, slight misregistration',
  'storybook digital painting with soft textured brushes',
  'naive marker drawing, bold uneven lines, flat fills',
]
/** Giros sobre un estilo de diseño fijo: lo cambian un poco sin salirse de él. */
const TWISTS = ['bolder outlines', 'a grainy textured finish', 'a more detailed background', 'an almost empty background', 'an unusual tight crop', 'exaggerated character proportions', 'pattern-filled shapes', 'looser, sketchier rendering', 'more geometric simplified shapes']
/** Cómo "se sacó" la foto: le saca lo de estudio. */
const CAPTURES = [
  'shot on an older phone, slightly soft focus',
  'snapshot with harsh direct phone flash',
  'slightly tilted, imperfect framing',
  'a bit of motion blur from someone moving',
  'mixed color temperature from daylight and indoor bulbs',
  'shot through a window with reflections',
  'part of the frame blocked by an out-of-focus object in the foreground',
  'slightly overexposed bright areas',
  'grainy low-light phone photo',
]

/** Cierre de cada prompt de foto: natural, improvisada, nada de modelos ni estudio. */
export const NATURAL_PHOTO =
  'Candid, unposed everyday photo taken by a friend with a phone, not a photoshoot: ordinary-looking real people (not models), real skin texture with pores, wrinkles and blemishes, untidy hair, lived-in clothes, cluttered real background, available light only, no studio lighting, no seamless backdrop, no retouching, no perfect symmetry, nobody posing for the camera.'
/** Cierre de cada prompt de ilustración: que nunca salga una foto. */
export const ILLUSTRATION_ONLY = 'This is a stylized ILLUSTRATION, clearly drawn or painted: not a photo, not photorealistic, no photographic rendering, no realistic skin or lens effects.'

/** Palabras de foto que el modelo de texto a veces mete en la escena de una ilustración y la vuelven realista. */
const PHOTO_OF = /\b(?:an?|the)\s+(?:[\w-]+\s+){0,3}?(?:photo|photograph|picture|shot|snapshot)\s+of\s+/gi
const PHOTO_WORDS = /\b(?:hyper-?realistic|photo-?realistic|realistic|photograph(?:y|ic)?|photo|DSLR|35 ?mm|bokeh|shallow depth of field|depth of field|lens|cinematic lighting|studio lighting|cinematic)\b/gi
export const forIllustration = (scene: string) =>
  scene
    .replace(PHOTO_OF, '')
    .replace(PHOTO_WORDS, '')
    .replace(/\s+([,.])/g, '$1')
    .replace(/([,.])(?:\s*[,.])+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.]+|[\s,.]+$/g, '')

/** Tipo de imagen de cada post: en la mezcla, mitad y mitad repartidas al azar. */
export function kindsFor(choice: KindChoice, n: number, rng: Rng = Math.random): ImageKind[] {
  if (choice !== 'mix') return Array.from({ length: n }, () => choice)
  const first: ImageKind = rng() < 0.5 ? 'illustration' : 'photo'
  const half = Array.from({ length: n }, (_, i): ImageKind => ((i % 2 === 0) === (first === 'illustration') ? 'illustration' : 'photo'))
  return shuffle(half, rng)
}

function person(rng: Rng) {
  return `${pick(AGES, rng)} (${pick(GENDERS, rng)}), ${pick(BUILDS, rng)}, with ${pick(LOOKS, rng)}, wearing ${pick(CLOTHES, rng)}`
}

function people(rng: Rng) {
  const group = pick(GROUPS, rng)
  if (group.startsWith('just the hands')) return `${group}: ${pick(AGES, rng)} wearing ${pick(CLOTHES, rng)}`
  const n = group === 'one person' ? 1 : group.startsWith('a small group') ? 3 : 2
  return `${group}: ${Array.from({ length: n }, () => person(rng)).join('; ')}`
}

/**
 * Sortea el look de cada post. `base`: la estética del estilo para cada tipo; `free`: si se puede cambiar la técnica
 * de la ilustración entera (clásico sin estilo propio en el promo.yaml) o sólo darle un giro.
 */
export function drawLooks(kinds: ImageKind[], base: Record<ImageKind, string>, opts: { free: boolean; colors: string[] }, rng: Rng = Math.random): Look[] {
  const n = kinds.length
  const [settings, framings, lights, techniques, twists, captures] = [draw(SETTINGS, n, rng), draw(FRAMINGS, n, rng), draw(LIGHTS, n, rng), draw(TECHNIQUES, n, rng), draw(TWISTS, n, rng), draw(CAPTURES, n, rng)]
  return kinds.map((kind, i) => {
    const lead = opts.colors.length ? ` Lead with ${pick(opts.colors, rng)} as the dominant brand color.` : ''
    const style =
      kind === 'photo'
        ? `${base.photo}, ${captures[i]}`
        : `${opts.free ? `${techniques[i]}, friendly characters, simplified app UI without readable text` : `${base.illustration}, with ${twists[i]}`}, not a photo.${lead}`
    return { kind, style, people: people(rng), setting: settings[i], framing: framings[i], light: lights[i] }
  })
}
