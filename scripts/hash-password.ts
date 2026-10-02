// Genera ADMIN_PASSWORD_HASH: npm run password -- 'tu contraseña'
import { hashPassword, MIN_PASSWORD } from '../src/lib/password'

const pw = process.argv[2]
if (!pw || pw.length < MIN_PASSWORD) {
  console.error(`Uso: npm run password -- 'contraseña de al menos ${MIN_PASSWORD} caracteres'`)
  process.exit(1)
}
console.log(`ADMIN_PASSWORD_HASH=${hashPassword(pw)}`)
