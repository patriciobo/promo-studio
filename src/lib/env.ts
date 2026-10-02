// Configuración del servicio. Todo tiene un valor por defecto razonable para desarrollo.
import { resolve } from 'node:path'

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? '',
  /** URL pública del servicio (Instagram descarga la media desde acá). Sin barra final. */
  publicUrl: (process.env.PUBLIC_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  mediaDir: resolve(process.env.MEDIA_DIR ?? './data/media'),
  /** Clave para cifrar los secretos guardados desde la web (32+ caracteres). */
  appSecret: process.env.APP_SECRET ?? 'dev-secret-change-me-dev-secret-change-me',
  chromePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
  metaGraph: (process.env.META_GRAPH ?? 'https://graph.facebook.com/v23.0').replace(/\/$/, ''),
  /** Presupuesto global mensual en USD para OpenRouter (todas las apps). */
  globalBudgetUsd: Number(process.env.GLOBAL_BUDGET_USD ?? 20),
  /** En desarrollo se puede entrar sin login. */
  authBypass: process.env.NODE_ENV !== 'production' && process.env.AUTH_BYPASS === '1',
}
