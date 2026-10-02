// Login con usuario y contraseña (ADMIN_USER + ADMIN_PASSWORD_HASH, o ADMIN_PASSWORD en texto plano).
// Hash con scrypt; comparaciones en tiempo constante; bloqueo temporal tras varios intentos fallidos.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEYLEN = 64
export const MIN_PASSWORD = 12

/** "scrypt:<sal>:<hash>" en base64url (sin "$", para que .env y Coolify no lo interpreten). */
export function hashPassword(password: string) {
  const salt = randomBytes(16)
  return `scrypt:${salt.toString('base64url')}:${scryptSync(password, salt, KEYLEN).toString('base64url')}`
}

export function verifyPassword(password: string, stored: string) {
  const [kind, salt, hash] = stored.split(':')
  if (kind !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64url')
  const actual = scryptSync(password, Buffer.from(salt, 'base64url'), expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

type Env = Record<string, string | undefined>

const sameText = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())

/** Qué falta configurar para poder entrar (null si está todo). */
export function loginConfigError(env: Env = process.env) {
  if (!env.ADMIN_USER) return 'Falta ADMIN_USER'
  if (env.ADMIN_PASSWORD_HASH) return env.ADMIN_PASSWORD_HASH.startsWith('scrypt:') ? null : 'ADMIN_PASSWORD_HASH no tiene el formato de npm run password'
  if (!env.ADMIN_PASSWORD) return 'Falta ADMIN_PASSWORD_HASH (o ADMIN_PASSWORD)'
  if (env.ADMIN_PASSWORD.length < MIN_PASSWORD) return `ADMIN_PASSWORD tiene que tener al menos ${MIN_PASSWORD} caracteres`
  return null
}

export function checkCredentials(user: string, password: string, env: Env = process.env) {
  if (loginConfigError(env)) return false
  const okUser = sameText(user.trim().toLowerCase(), env.ADMIN_USER!.trim().toLowerCase())
  const okPass = env.ADMIN_PASSWORD_HASH ? verifyPassword(password, env.ADMIN_PASSWORD_HASH) : sameText(password, env.ADMIN_PASSWORD!)
  return okUser && okPass
}

// --- Intentos fallidos (en memoria: la web corre en un solo proceso) -----------------

const MAX_FAILS = 5
const WINDOW_MS = 15 * 60e3
const fails = new Map<string, { n: number; first: number }>()

export function isLocked(key: string, now = Date.now()) {
  const f = fails.get(key)
  if (!f) return false
  if (now - f.first > WINDOW_MS) return fails.delete(key), false
  return f.n >= MAX_FAILS
}

export function recordFail(key: string, now = Date.now()) {
  const f = fails.get(key)
  if (!f || now - f.first > WINDOW_MS) fails.set(key, { n: 1, first: now })
  else f.n++
}

export const clearFails = (key: string) => fails.delete(key)
