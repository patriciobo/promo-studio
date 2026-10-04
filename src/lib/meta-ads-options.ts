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

export interface Targeting {
  countries: string[]
  ageMin: number
  ageMax: number
  interests: { id: string; name: string }[]
  /** Público Advantage+: Meta amplía más allá de los intereses si encuentra mejores resultados. */
  advantage: boolean
}
