import { AuthError } from 'next-auth'
import { redirect } from 'next/navigation'
import { signIn } from '@/auth'
import { SubmitButton } from '@/components/client'
import { loginConfigError } from '@/lib/password'

const ERRORS: Record<string, string> = {
  locked: 'Demasiados intentos fallidos. Probá de nuevo en 15 minutos.',
  credentials: 'Usuario o contraseña incorrectos.',
}

export default async function Login({ searchParams }: PageProps<'/login'>) {
  const { error, code } = await searchParams
  const misconfigured = loginConfigError()
  return (
    <main className="login">
      <div className="card stack">
        <h1>Promo Studio</h1>
        <p className="muted">Contenido automático para Instagram de tus apps.</p>
        {misconfigured && <p className="notice bad small">Login sin configurar: {misconfigured}. Revisá las variables de entorno.</p>}
        {typeof error === 'string' && <p className="notice bad small">{ERRORS[typeof code === 'string' ? code : error] ?? ERRORS.credentials}</p>}
        <form
          className="stack"
          action={async (f: FormData) => {
            'use server'
            try {
              await signIn('credentials', { username: f.get('username'), password: f.get('password'), redirectTo: '/' })
            } catch (e) {
              // signIn redirige lanzando una excepción: sólo se atajan los errores de login.
              if (e instanceof AuthError) redirect(`/login?error=${(e as AuthError & { code?: string }).code === 'locked' ? 'locked' : 'credentials'}`)
              throw e
            }
          }}
        >
          <label>
            Usuario
            <input name="username" autoComplete="username" required autoFocus />
          </label>
          <label>
            Contraseña
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <SubmitButton className="btn primary block" pendingText="Entrando…">
            Entrar
          </SubmitButton>
        </form>
      </div>
    </main>
  )
}
