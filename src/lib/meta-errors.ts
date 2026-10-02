// Errores de la API de Meta traducidos a causa y arreglo (ver la guía de conexión en /guia).

export class MetaError extends Error {
  constructor(
    public code: number | undefined,
    public subcode: number | undefined,
    public metaMessage: string,
    public path: string,
  ) {
    super(`Meta ${code ?? ''}${subcode ? `/${subcode}` : ''}: ${metaMessage} (${path})`)
  }
}

export interface Explained {
  title: string
  cause: string
  fix: string
  /** Si conviene reintentar más tarde. */
  retry: boolean
}

const RULES: { match: (e: MetaError) => boolean; x: Explained }[] = [
  {
    match: (e) => e.code === 190,
    x: { title: 'Token inválido o vencido', cause: 'El token fue revocado, cambió la contraseña o se borró el usuario de sistema.', fix: 'Generá un token nuevo del usuario de sistema (paso A.5) y cargalo en Configuración.', retry: false },
  },
  {
    match: (e) => e.code === 10 || e.code === 200 || (e.code !== undefined && e.code >= 200 && e.code < 300),
    x: { title: 'Permiso denegado', cause: 'Falta un permiso en el token o el activo (página, Instagram o cuenta publicitaria) no está asignado al usuario de sistema.', fix: 'Regenerá el token marcando todos los permisos (A.5) y revisá la asignación de activos (B.5).', retry: false },
  },
  {
    match: (e) => [9004, 2207052, 2207003].includes(e.subcode ?? -1) || /download|fetch/i.test(e.metaMessage),
    x: { title: 'Instagram no pudo descargar el archivo', cause: 'La URL de la media no es pública, no es HTTPS, redirige, pide login o el certificado es inválido.', fix: 'Revisá PUBLIC_URL y el HTTPS del VPS. El control de salud prueba la URL.', retry: true },
  },
  {
    match: (e) => e.code === 36003 || /aspect ratio/i.test(e.metaMessage),
    x: { title: 'Proporción de imagen no soportada', cause: 'El feed acepta entre 4:5 y 1.91:1; las stories, 9:16.', fix: 'Volvé a renderizar el post (las plantillas usan 1080×1350 y 1080×1920).', retry: false },
  },
  {
    match: (e) => e.subcode === 2207026 || /video format|codec/i.test(e.metaMessage),
    x: { title: 'Formato de video no soportado', cause: 'Códec, perfil o contenedor no aceptados.', fix: 'Volvé a renderizar: el renderer exporta H.264 + AAC, yuv420p, faststart.', retry: false },
  },
  {
    match: (e) => e.code === 9007 || e.subcode === 2207027 || /not ready/i.test(e.metaMessage),
    x: { title: 'La media todavía se está procesando', cause: 'Se intentó publicar antes de que Instagram terminara.', fix: 'Se reintenta solo.', retry: true },
  },
  {
    match: (e) => [4, 17, 32, 613].includes(e.code ?? -1) || e.code === 9 || /limit/i.test(e.metaMessage),
    x: { title: 'Límite de la API alcanzado', cause: 'Demasiados pedidos o el cupo de 100 publicaciones por día.', fix: 'Se reprograma solo. Si se repite, bajá el ritmo de la app.', retry: true },
  },
  {
    match: (e) => /stories/i.test(e.metaMessage) && /(creator|business|account type)/i.test(e.metaMessage),
    x: { title: 'La cuenta no puede publicar stories por API', cause: 'La cuenta es de tipo Creador.', fix: 'Cambiala a cuenta Empresa (paso B.1).', retry: false },
  },
  {
    match: (e) => /instagram.*(not authorized|authoriz)|instagram_user_id|instagram_actor/i.test(e.metaMessage),
    x: { title: 'La cuenta de Instagram no está autorizada en la cuenta publicitaria', cause: 'Falta conectar la cuenta de Instagram a la cuenta publicitaria.', fix: 'Paso B.6: Cuentas publicitarias → Cuentas de Instagram conectadas.', retry: false },
  },
  {
    match: (e) => /payment|disabled|account_status/i.test(e.metaMessage),
    x: { title: 'Cuenta publicitaria inactiva', cause: 'Sin medio de pago, deshabilitada o con una restricción de políticas.', fix: 'Resolvelo en el Administrador de anuncios; el servicio no reintenta.', retry: false },
  },
  {
    match: (e) => e.code === 1 || e.code === 2,
    x: { title: 'Error temporal de Meta', cause: 'Falla del servicio de Meta.', fix: 'Se reintenta solo.', retry: true },
  },
]

export function explain(e: unknown): Explained {
  if (e instanceof MetaError) {
    const hit = RULES.find((r) => r.match(e))
    if (hit) return hit.x
    return { title: 'Error de Meta', cause: e.metaMessage, fix: 'Revisá el mensaje; si persiste, probá la conexión desde la app.', retry: false }
  }
  const msg = e instanceof Error ? e.message : String(e)
  return { title: 'Error', cause: msg, fix: 'Revisá la configuración.', retry: /ECONN|ETIMEDOUT|fetch failed/i.test(msg) }
}
