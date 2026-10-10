// Kit de publicaciones iniciales: 9 posts que presentan el negocio en una cuenta nueva (o sin publicaciones),
// para que quien llegue al perfil entienda en segundos qué es, para quién y cómo empezar, y para que Instagram
// aprenda de qué trata la cuenta (mismo nicho, palabras clave en el texto) antes del ritmo semanal.
import type { PostType } from '@prisma/client'
import { zonedTime, type Slot } from './schedule'

export interface StarterTopic {
  id: string
  type: PostType
  /** Va fijado arriba del perfil (Instagram deja fijar hasta 3, a mano desde la app). */
  pin?: boolean
  label: string
  /** Para qué sirve, en la web. */
  why: string
  /** Qué tiene que hacer el modelo con ese post. */
  brief: string
}

/** En el orden en que se publican: los 3 fijados el primer día, después uno por día. */
export const STARTER_TOPICS: StarterTopic[] = [
  {
    id: 'presentacion',
    type: 'CAROUSEL',
    pin: true,
    label: 'Quiénes somos y nuestra misión',
    why: 'Lo primero que ve quien llega al perfil: qué es, para quién y por qué existe.',
    brief:
      'Introduce the business to someone who has never heard of it. Cover: what it is in one plain sentence (with the main search keyword), who it is for, the problem it solves, and its mission (why it exists). Last slide: invite to follow for more.',
  },
  {
    id: 'servicios',
    type: 'CAROUSEL',
    pin: true,
    label: 'Qué ofrecemos',
    why: 'Los servicios o funciones, uno por diapositiva, con el beneficio concreto de cada uno.',
    brief: 'Present the services / features offered, one per slide, each with the concrete benefit for the customer (not just the name). Use only features listed in the app data. Last slide: how to get it.',
  },
  {
    id: 'empezar',
    type: 'CAROUSEL',
    pin: true,
    label: 'Cómo empezar o contactarnos',
    why: 'Quita fricción: pasos para empezar, dónde está el link y cómo escribir.',
    brief: 'Explain step by step how to start (sign up, buy, book or get in touch), mentioning the link in bio and the contact options present in the app data. Make it practical and short. Last slide: the call to action.',
  },
  {
    id: 'problema',
    type: 'REEL',
    label: 'El problema que resolvemos',
    why: 'Los reels son lo que más llega a gente que todavía no te sigue: una situación con la que se identifiquen.',
    brief: 'A relatable everyday situation of the audience that shows the problem (first scene is the hook, a pain they recognize), then how this business solves it. No hard selling.',
  },
  {
    id: 'como-funciona',
    type: 'CAROUSEL',
    label: 'Cómo funciona, paso a paso',
    why: 'Contenido para guardar: los guardados y los envíos pesan más que los "me gusta".',
    brief: 'A step-by-step guide of how it works or how to get the most out of it, so useful that people save it. One step per slide.',
  },
  {
    id: 'para-quien',
    type: 'IMAGE',
    label: 'Para quién es',
    why: 'Le marca el nicho al algoritmo y ayuda a que la persona indicada diga "esto es para mí".',
    brief: 'Describe clearly who this is for (and, if it helps, who it is not for), using the audience in the app data. Invite people to tag or send it to someone who needs it.',
  },
  {
    id: 'diferencial',
    type: 'CAROUSEL',
    label: 'Objetivos, valores y por qué elegirnos',
    why: 'Lo que lo hace distinto y lo que busca lograr con sus clientes.',
    brief: 'What makes this business different and the goals it pursues for its customers, plus its values. Only real differences from the app data, no invented comparisons or claims about competitors.',
  },
  {
    id: 'historia',
    type: 'REEL',
    label: 'Nuestra historia',
    why: 'La parte humana: por qué empezó. Genera confianza y comentarios.',
    brief: 'The origin story: why it was created and what drives it, told in a human way from the description in the app data. If the data does not tell the story, focus on the purpose and the day to day without inventing facts, names or dates.',
  },
  {
    id: 'preguntas',
    type: 'CAROUSEL',
    label: 'Preguntas frecuentes',
    why: 'Responde las dudas que frenan a un cliente nuevo; también se guarda y se comparte.',
    brief: 'Answer the 3-5 questions a new customer would ask before trying it (price model, how it works, who it is for, what is needed), one per slide, only with information present in the app data; if something is unknown, invite to ask by message. Last slide: invite to send a message.',
  },
]

/** Día local (AAAA-MM-DD) de un instante en una zona horaria. */
export const localDay = (d: Date, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

/**
 * Cadencia del kit: el primer día los 3 que se fijan (para que el perfil nunca se vea vacío), separados unas horas;
 * después uno por día. Publicar los 9 juntos haría competir a los posts entre sí por los mismos seguidores
 * y Instagram muestra pocos posts seguidos de una misma cuenta; de a uno, cada post tiene su propia prueba de alcance.
 */
export function starterSlots(start: Date, postTime: string, timeZone: string): Slot[] {
  const [hh, mm] = postTime.split(':').map(Number)
  let day = 0
  return STARTER_TOPICS.map((t, i) => {
    if (i >= 3) day++
    const d = new Date(start)
    d.setUTCDate(d.getUTCDate() + day)
    const h = i < 3 ? Math.min(22, hh + i * 3) : hh
    const at = zonedTime(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), h, mm, timeZone)
    return { type: t.type, day: (d.getUTCDay() + 6) % 7, at }
  })
}

/** Primer día sugerido: en dos días, para revisar (o que el cliente apruebe) antes del primer post. */
export const starterStart = (timeZone: string, now = new Date()) => localDay(new Date(now.getTime() + 2 * 864e5), timeZone)

/** Cuántos días dura el kit (para avisar dónde termina). */
export const STARTER_DAYS = STARTER_TOPICS.length - 2
