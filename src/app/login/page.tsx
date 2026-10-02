import { signIn } from '@/auth'

export default function Login() {
  return (
    <main className="login">
      <div className="card stack">
        <h1>Promo Studio</h1>
        <p className="muted">Contenido automático para Instagram de tus apps.</p>
        <form
          action={async () => {
            'use server'
            await signIn('github', { redirectTo: '/' })
          }}
        >
          <button className="btn primary block">Entrar con GitHub</button>
        </form>
      </div>
    </main>
  )
}
