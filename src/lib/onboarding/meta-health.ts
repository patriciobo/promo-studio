// Control de salud de la conexión de una app con Meta: cada paso en verde o en rojo, con el arreglo.
import { db } from '../db'
import { env } from '../env'
import { actId, adAccounts, discoverAccounts, graph, publishingQuota, token, tokenScopes } from '../instagram'
import { explain } from '../meta-errors'

export interface Check {
  id: string
  label: string
  ok: boolean
  detail: string
  fix?: string
}

export async function healthCheck(appId: string, opts: { createTestContainer?: boolean } = {}): Promise<Check[]> {
  const app = await db.app.findUniqueOrThrow({ where: { id: appId } })
  const checks: Check[] = []
  const add = (c: Check) => (checks.push(c), c.ok)

  let t: string
  try {
    t = await token()
  } catch {
    add({ id: 'token', label: 'Token de Meta cargado', ok: false, detail: 'No hay token.', fix: 'Paso A.5: generá el token del usuario de sistema y cargalo en Configuración → Claves.' })
    return checks
  }
  const g = graph(t)
  try {
    const s = await tokenScopes(t)
    add({ id: 'token', label: 'Token válido', ok: s.valid, detail: s.valid ? `Tipo ${s.type ?? '?'}${s.expiresAt ? `, vence ${s.expiresAt.toLocaleDateString('es-AR')}` : ', no vence'}` : 'El token no es válido.', fix: s.valid ? undefined : 'Generá un token nuevo (A.5).' })
    add({ id: 'scopes', label: 'Permisos completos', ok: s.missing.length === 0, detail: s.missing.length ? `Faltan: ${s.missing.join(', ')}` : 'Todos los permisos necesarios.', fix: s.missing.length ? 'Regenerá el token marcando los permisos que faltan (A.5).' : undefined })
  } catch (e) {
    const x = explain(e)
    add({ id: 'token', label: 'Token válido', ok: false, detail: x.cause, fix: x.fix })
    return checks
  }

  try {
    const accounts = await discoverAccounts(g)
    const mine = accounts.find((a) => a.igUserId === app.igUserId)
    add({
      id: 'account',
      label: 'Cuenta de Instagram conectada',
      ok: !!mine,
      detail: mine ? `@${mine.igUsername} (página ${mine.pageName}, ${mine.followers ?? 0} seguidores)` : app.igUserId ? 'El token ya no llega a la cuenta guardada.' : 'Todavía no elegiste la cuenta de esta app.',
      fix: mine ? undefined : 'Usá "Buscar cuentas". Si no aparece: cuenta Empresa (B.1), vinculada a la página (B.3) y asignada al usuario de sistema (B.5).',
    })
  } catch (e) {
    const x = explain(e)
    add({ id: 'account', label: 'Cuenta de Instagram conectada', ok: false, detail: x.cause, fix: x.fix })
  }

  // Instagram descarga la media desde PUBLIC_URL: tiene que ser HTTPS público.
  const testUrl = `${env.publicUrl}/media/_health.jpg`
  const isPublic = /^https:\/\//.test(env.publicUrl) && !/localhost|127\.0\.0\.1/.test(env.publicUrl)
  let reachable = false
  try {
    const r = await fetch(testUrl, { method: 'HEAD', redirect: 'manual' })
    reachable = r.status === 200 && (r.headers.get('content-type') ?? '').startsWith('image/')
  } catch {
    reachable = false
  }
  add({ id: 'media', label: 'URL pública de media', ok: isPublic && reachable, detail: `${testUrl} → ${reachable ? 'responde' : 'no responde'}${isPublic ? '' : ' (no es HTTPS público)'}`, fix: isPublic && reachable ? undefined : 'Configurá PUBLIC_URL con el subdominio HTTPS del VPS (sin redirecciones ni login).' })

  if (app.igUserId) {
    try {
      const q = await publishingQuota(g, app.igUserId)
      add({ id: 'quota', label: 'Cupo de publicación', ok: q.used < q.total, detail: `${q.used} de ${q.total} en las últimas 24 h` })
    } catch (e) {
      const x = explain(e)
      add({ id: 'quota', label: 'Cupo de publicación', ok: false, detail: x.cause, fix: x.fix })
    }
    if (opts.createTestContainer && isPublic && reachable) {
      try {
        await g.post(`${app.igUserId}/media`, { image_url: testUrl, caption: 'Prueba de Promo Studio (no se publica)' })
        add({ id: 'container', label: 'Contenedor de prueba', ok: true, detail: 'Instagram aceptó la imagen de prueba. No se publicó; vence sola en 24 h.' })
      } catch (e) {
        const x = explain(e)
        add({ id: 'container', label: 'Contenedor de prueba', ok: false, detail: x.cause, fix: x.fix })
      }
    }
  }

  try {
    const { accounts, errors } = await adAccounts(g)
    const acc = app.adAccountId ? accounts.find((a) => a.id === actId(app.adAccountId!)) : undefined
    // El usuario de sistema sólo puede crear anuncios en cuentas que le asignaron (no alcanza con que sea del Business).
    const assigned = acc?.via === 'asignada'
    add({
      id: 'ads',
      label: 'Cuenta publicitaria',
      ok: !!acc?.active && assigned,
      detail: acc
        ? `${acc.name} (${acc.currency}) ${acc.active ? 'activa' : 'inactiva'}${assigned ? '' : ` · visible por ${acc.via}, pero no asignada al usuario de sistema`}`
        : app.adAccountId
          ? `El token no llega a ${app.adAccountId}.${errors.length ? ` ${errors[0]}` : ''}`
          : 'Sin cuenta publicitaria elegida (opcional hasta usar anuncios).',
      fix: acc?.active && assigned ? undefined : 'Business Manager → Usuarios del sistema → Asignar activos → Cuentas publicitarias: dar "Administrar campañas". La cuenta necesita medio de pago (A.2, B.5, B.6).',
    })
  } catch (e) {
    const x = explain(e)
    add({ id: 'ads', label: 'Cuenta publicitaria', ok: false, detail: x.cause, fix: x.fix })
  }
  return checks
}
