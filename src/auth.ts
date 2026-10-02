// Login con usuario y contraseña (ADMIN_USER y ADMIN_PASSWORD_HASH en el entorno). Sesión en cookie firmada con AUTH_SECRET.
import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { env } from '@/lib/env'
import { checkCredentials, clearFails, isLocked, recordFail } from '@/lib/password'

class Locked extends CredentialsSignin {
  code = 'locked'
}

const clientIp = (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'local'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: { username: { label: 'Usuario' }, password: { label: 'Contraseña', type: 'password' } },
      async authorize(c, req) {
        const ip = clientIp(req)
        if (isLocked(ip)) throw new Locked()
        const user = String(c?.username ?? '')
        if (checkCredentials(user, String(c?.password ?? ''))) {
          clearFails(ip)
          return { id: 'admin', name: user.trim() }
        }
        recordFail(ip)
        await new Promise((r) => setTimeout(r, 1000)) // frena la fuerza bruta
        return null
      },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 30 * 24 * 3600 },
  trustHost: true,
  pages: { signIn: '/login' },
})

/** Para server actions y páginas: corta si no hay sesión (salvo el bypass de desarrollo). */
export async function requireUser() {
  if (env.authBypass) return { name: 'dev' }
  const s = await auth()
  if (!s?.user) throw new Error('No autorizado')
  return s.user
}
