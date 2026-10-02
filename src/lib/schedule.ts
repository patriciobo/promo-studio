// Horarios de la semana por app: qué tipo de pieza va cada día y a qué hora (en la zona horaria de la app).
import type { PostType } from '@prisma/client'

export interface Cadence {
  feed: number
  reels: number
  stories: number
}

export interface Slot {
  type: PostType
  /** 0 = lunes … 6 = domingo */
  day: number
  at: Date
}

/** Diferencia (minutos) entre la zona horaria y UTC en un instante dado. */
function tzOffsetMinutes(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  )
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  return (asUtc - date.getTime()) / 60000
}

/** Fecha y hora local de una zona horaria → instante UTC. */
export function zonedTime(y: number, m: number, d: number, hh: number, mm: number, timeZone: string) {
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm))
  return new Date(guess.getTime() - tzOffsetMinutes(guess, timeZone) * 60000)
}

/** Lunes (fecha local, a las 00:00 UTC) de la semana siguiente a `from`. */
export function nextMonday(from = new Date()) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  const dow = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() + (7 - dow))
  return d
}

const FEED_DAYS = [0, 2, 4, 6, 1, 3, 5] // lunes, miércoles, viernes, domingo…
const STORY_DAYS = [1, 3, 5, 6, 0, 2, 4] // martes, jueves, sábado…

/**
 * Reparte la semana: los posts de feed en días alternos (el último como reel si corresponde)
 * y las stories en los días libres, más tarde que el post.
 */
export function weekSlots(weekStart: Date, cadence: Cadence, postTime: string, timeZone: string): Slot[] {
  const [hh, mm] = postTime.split(':').map(Number)
  const at = (day: number, h: number, m: number) => {
    const d = new Date(weekStart)
    d.setUTCDate(d.getUTCDate() + day)
    return zonedTime(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), h, m, timeZone)
  }
  const feedDays = FEED_DAYS.slice(0, Math.min(7, cadence.feed)).sort((a, b) => a - b)
  const reels = Math.min(cadence.reels, feedDays.length)
  const slots: Slot[] = feedDays.map((day, i) => ({
    day,
    type: i >= feedDays.length - reels ? 'REEL' : i % 2 === 0 ? 'CAROUSEL' : 'IMAGE',
    at: at(day, hh, mm),
  }))
  const storyDays = STORY_DAYS.filter((d) => !feedDays.includes(d)).concat(STORY_DAYS.filter((d) => feedDays.includes(d)))
  for (const day of storyDays.slice(0, cadence.stories)) slots.push({ day, type: 'STORY', at: at(day, Math.min(23, hh + 9), mm) })
  return slots.sort((a, b) => a.at.getTime() - b.at.getTime())
}
