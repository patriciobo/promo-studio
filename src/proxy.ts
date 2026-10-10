// Protege la interfaz: todo pide login salvo la media pública, las páginas de links, el webhook de WAHA (con su token), la política de privacidad y el propio login.
import { NextResponse } from 'next/server'
import { auth } from '@/auth'

const PUBLIC = [/^\/media\//, /^\/l\//, /^\/privacidad/, /^\/login/, /^\/api\/auth/, /^\/api\/waha/, /^\/_next/, /^\/favicon/]

export default auth((req) => {
  if (process.env.NODE_ENV !== 'production' && process.env.AUTH_BYPASS === '1') return NextResponse.next()
  if (PUBLIC.some((r) => r.test(req.nextUrl.pathname))) return NextResponse.next()
  if (!req.auth) return NextResponse.redirect(new URL('/login', req.url))
  return NextResponse.next()
})

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] }
