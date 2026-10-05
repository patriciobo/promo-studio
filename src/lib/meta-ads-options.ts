// Opciones de campaña sin dependencias del servidor: las usa también el formulario en el navegador.

export type Objective = 'TRAFFIC' | 'AWARENESS' | 'ENGAGEMENT' | 'WHATSAPP'

export const OBJECTIVES: { id: Objective; label: string; hint: string; meta: string; goal: string }[] = [
  { id: 'TRAFFIC', label: 'Visitas al sitio', hint: 'Clics al link de la app (con UTM para medirlos).', meta: 'OUTCOME_TRAFFIC', goal: 'LINK_CLICKS' },
  { id: 'AWARENESS', label: 'Alcance', hint: 'Que la vea la mayor cantidad de gente posible.', meta: 'OUTCOME_AWARENESS', goal: 'REACH' },
  { id: 'ENGAGEMENT', label: 'Interacción', hint: 'Me gusta, comentarios, guardados y compartidos.', meta: 'OUTCOME_ENGAGEMENT', goal: 'POST_ENGAGEMENT' },
  { id: 'WHATSAPP', label: 'Mensajes de WhatsApp', hint: 'Abre un chat con tu WhatsApp (tiene que estar vinculado a la página).', meta: 'OUTCOME_ENGAGEMENT', goal: 'CONVERSATIONS' },
]

export const CTAS: { id: string; label: string }[] = [
  { id: 'LEARN_MORE', label: 'Más información' },
  { id: 'SIGN_UP', label: 'Registrarte' },
  { id: 'DOWNLOAD', label: 'Descargar' },
  { id: 'SHOP_NOW', label: 'Comprar' },
  { id: 'CONTACT_US', label: 'Contactarnos' },
  { id: 'BOOK_TRAVEL', label: 'Reservar' },
]

/** Tipos de la segmentación detallada de Meta (cada uno es una clave de flexible_spec). */
export type DetailType = 'interests' | 'behaviors' | 'work_positions' | 'work_employers' | 'education_schools' | 'education_majors' | 'life_events' | 'industries' | 'income' | 'family_statuses'

/**
 * `search`: se busca por texto en la API (type=…). `browse`: Meta da la lista completa de la categoría
 * (adTargetingCategory) y se filtra acá.
 */
export const DETAIL_TYPES: { id: DetailType; label: string; mode: 'search' | 'browse'; api: string }[] = [
  { id: 'interests', label: 'Intereses', mode: 'search', api: 'adinterest' },
  { id: 'behaviors', label: 'Comportamientos', mode: 'browse', api: 'behaviors' },
  { id: 'work_positions', label: 'Cargos', mode: 'search', api: 'adworkposition' },
  { id: 'work_employers', label: 'Empleadores', mode: 'search', api: 'adworkemployer' },
  { id: 'industries', label: 'Sectores', mode: 'browse', api: 'industries' },
  { id: 'education_schools', label: 'Escuelas y universidades', mode: 'search', api: 'adeducationschool' },
  { id: 'education_majors', label: 'Carreras', mode: 'search', api: 'adeducationmajor' },
  { id: 'life_events', label: 'Acontecimientos importantes', mode: 'browse', api: 'life_events' },
  { id: 'family_statuses', label: 'Situación familiar', mode: 'browse', api: 'family_statuses' },
  { id: 'income', label: 'Ingresos', mode: 'browse', api: 'income' },
]

export interface Detail {
  type: DetailType
  id: string
  name: string
}

/** Ciudad (con radio en km) o provincia/estado: si hay alguna, reemplaza a los países. */
export interface GeoPlace {
  key: string
  name: string
  type: 'city' | 'region'
  radius?: number
}

/** Niveles educativos de Meta (education_statuses). */
export const EDUCATION: { id: number; label: string }[] = [
  { id: 13, label: 'Secundario incompleto' },
  { id: 1, label: 'Cursando el secundario' },
  { id: 4, label: 'Secundario completo' },
  { id: 5, label: 'Universitario incompleto' },
  { id: 2, label: 'Cursando la universidad' },
  { id: 6, label: 'Terciario / tecnicatura' },
  { id: 3, label: 'Universitario completo' },
  { id: 8, label: 'Posgrado incompleto' },
  { id: 7, label: 'Cursando un posgrado' },
  { id: 9, label: 'Maestría' },
  { id: 10, label: 'Título profesional' },
  { id: 11, label: 'Doctorado' },
]

export interface Targeting {
  countries: string[]
  places?: GeoPlace[]
  ageMin: number
  ageMax: number
  /** [] = todos; [1] hombres; [2] mujeres. */
  genders?: number[]
  education?: number[]
  /** Segmentación detallada: dentro de un grupo alcanza con una (O); entre grupos tienen que cumplirse todos (Y). */
  groups?: Detail[][]
  /** Intereses de campañas viejas (antes de los grupos): se suman al primer grupo. */
  interests: { id: string; name: string }[]
  /** Público Advantage+: Meta amplía más allá de lo elegido si encuentra mejores resultados. */
  advantage: boolean
}

/** Grupos de segmentación detallada, con los intereses viejos incluidos y sin grupos vacíos. */
export function detailGroups(t: Pick<Targeting, 'groups' | 'interests'>): Detail[][] {
  const legacy: Detail[] = (t.interests ?? []).map((i) => ({ type: 'interests', id: i.id, name: i.name }))
  const groups = (t.groups ?? []).map((g) => [...g])
  if (legacy.length) groups[0] = [...legacy, ...(groups[0] ?? [])]
  return groups.filter((g) => g.length)
}
