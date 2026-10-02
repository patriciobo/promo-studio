// Login con GitHub: sólo entra el usuario de ALLOWED_GITHUB_LOGIN.
import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import { env } from '@/lib/env'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  trustHost: true,
  pages: { signIn: '/login' },
  callbacks: {
    signIn({ profile }) {
      return !!env.allowedGithubLogin && (profile as { login?: string } | undefined)?.login?.toLowerCase() === env.allowedGithubLogin.toLowerCase()
    },
  },
})

/** Para server actions y páginas: corta si no hay sesión (salvo el bypass de desarrollo). */
export async function requireUser() {
  if (env.authBypass) return { name: 'dev' }
  const s = await auth()
  if (!s?.user) throw new Error('No autorizado')
  return s.user
}
