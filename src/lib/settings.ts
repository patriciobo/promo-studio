// Secretos cargados desde la web, cifrados con AES-256-GCM. Si no hay valor guardado, se usa la variable de entorno.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { db } from './db'
import { env } from './env'

export const SECRET_KEYS = {
  META_TOKEN: 'META_TOKEN',
  OPENROUTER_API_KEY: 'OPENROUTER_API_KEY',
  GITHUB_TOKEN: 'GITHUB_TOKEN',
  WAHA_URL: 'WAHA_URL',
  WAHA_API_KEY: 'WAHA_API_KEY',
  WAHA_CHAT_ID: 'WAHA_CHAT_ID',
} as const
export type SecretKey = keyof typeof SECRET_KEYS

const key = () => createHash('sha256').update(env.appSecret).digest()

export function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.')
}

export function decrypt(blob: string): string {
  const [iv, tag, data] = blob.split('.').map((s) => Buffer.from(s, 'base64'))
  const d = createDecipheriv('aes-256-gcm', key(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(data), d.final()]).toString('utf8')
}

export async function getSecret(k: SecretKey): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { key: k } })
  if (row) return decrypt(row.value)
  return process.env[k] || null
}

export async function setSecret(k: SecretKey, value: string) {
  if (!value) return db.setting.deleteMany({ where: { key: k } })
  const enc = encrypt(value)
  return db.setting.upsert({ where: { key: k }, create: { key: k, value: enc }, update: { value: enc } })
}

/** Últimos 4 caracteres, para mostrar en la web sin exponer el secreto. */
export const mask = (v: string | null) => (v ? `••••${v.slice(-4)}` : null)
