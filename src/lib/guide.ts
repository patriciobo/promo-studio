// Paso a paso para conectar las cuentas y tabla de errores (se muestra en /guia y en cada app).

export interface GuideStep {
  id: string
  title: string
  items: string[]
}

export const STEPS_ONCE: GuideStep[] = [
  { id: 'A.1', title: 'Portfolio comercial', items: ['Entrá a business.facebook.com y creá el portfolio (Configuración del negocio).', 'Activá la verificación en dos pasos en tu perfil de Facebook: Meta la exige para administrar activos.'] },
  { id: 'A.2', title: 'Cuenta publicitaria', items: ['Configuración → Cuentas → Cuentas publicitarias → Crear.', 'Agregá un medio de pago y elegí la moneda (ARS o USD; después no se puede cambiar).'] },
  { id: 'A.3', title: 'App de Meta for Developers', items: ['developers.facebook.com → Mis apps → Crear app → tipo Business → vinculala al portfolio.', 'Agregá los productos Facebook Login for Business, Instagram (API con login de Facebook) y Marketing API.'] },
  { id: 'A.4', title: 'Usuario de sistema', items: ['Configuración del negocio → Usuarios → Usuarios del sistema → Agregar, con rol Administrador.'] },
  {
    id: 'A.5',
    title: 'Token del usuario de sistema',
    items: [
      '"Generar token" → elegí la app → vencimiento: Nunca.',
      'Permisos: instagram_basic, instagram_content_publish, instagram_manage_insights, instagram_manage_comments, pages_show_list, pages_read_engagement, business_management, ads_management, ads_read.',
      'Cargalo en Configuración → Claves. Se guarda cifrado y el servicio verifica los permisos.',
    ],
  },
]

export const STEPS_PER_APP: GuideStep[] = [
  { id: 'B.1', title: 'Cuenta de Instagram tipo Empresa', items: ['En Instagram: Configuración → Tipo de cuenta y herramientas → Cambiar a cuenta profesional → Empresa (no Creador).', 'Elegí una categoría (por ejemplo "Aplicación" o la temática de la app).'] },
  { id: 'B.2', title: 'Página de Facebook', items: ['Creá la página de la app con el mismo nombre y logo si todavía no existe.'] },
  { id: 'B.3', title: 'Vincular Instagram y la página', items: ['Desde la página: Configuración → Cuentas vinculadas → Instagram → Conectar, iniciando sesión en la cuenta de esa app.', 'Con 3 cuentas abiertas es fácil vincular la equivocada: revisá el @usuario.'] },
  { id: 'B.4', title: 'Sumar los activos al portfolio', items: ['Configuración del negocio → Cuentas → Páginas → Agregar, y Cuentas de Instagram → Agregar.'] },
  { id: 'B.5', title: 'Dar acceso al usuario de sistema', items: ['Usuario de sistema → Asignar activos: la página (control total), la cuenta de Instagram (control total) y la cuenta publicitaria (administrar campañas).'] },
  { id: 'B.6', title: 'Autorizar Instagram en la cuenta publicitaria', items: ['Cuentas publicitarias → Cuentas de Instagram conectadas → agregar la cuenta. Sin esto no se pueden crear anuncios con sus posts.'] },
  { id: 'B.7', title: 'Elegir la cuenta en Promo Studio', items: ['En la pestaña Instagram de la app: "Buscar cuentas", elegir la cuenta y la cuenta publicitaria, y guardar.'] },
  { id: 'B.8', title: 'Probar la conexión', items: ['"Probar conexión" verifica token, permisos, cuenta, URL pública de media, cupo y cuenta publicitaria.', 'La primera prueba real conviene que sea una story: desaparece sola en 24 h. Después desactivá la simulación en Ajustes.'] },
]

export const ERRORS: [string, string, string][] = [
  ['"Buscar cuentas" no muestra la cuenta', 'No es Empresa, no está vinculada a la página o la página no está asignada al usuario de sistema', 'Repetir B.1, B.3 y B.5'],
  ['190 OAuthException / token inválido', 'Token revocado, cambio de contraseña o usuario de sistema eliminado', 'Generar un token nuevo (A.5) y cargarlo'],
  ['10 o 200: permiso denegado', 'Falta un permiso o un activo sin asignar', 'Regenerar el token con todos los permisos; revisar B.5'],
  ['Stories: error de tipo de cuenta', 'La cuenta es Creador', 'Cambiarla a Empresa (B.1)'],
  ['9004 / 2207052: no se pudo descargar', 'La URL de media no es pública, no es HTTPS, redirige o pide login', 'Revisar PUBLIC_URL y el HTTPS del VPS'],
  ['36003: proporción no soportada', 'Feed fuera de 4:5 a 1.91:1, o story que no es 9:16', 'Volver a renderizar el post'],
  ['2207026: formato de video', 'Códec o perfil no soportado', 'Volver a renderizar (H.264 + AAC, yuv420p, faststart)'],
  ['9007 / media not ready', 'Se publicó antes de que Instagram terminara de procesar', 'Se reintenta solo'],
  ['Contenedor EXPIRED', 'Pasaron 24 h sin publicarse', 'Se vuelve a crear solo'],
  ['4, 17, 32, 613 / límite', 'Demasiados pedidos o cupo de 100 por día', 'Se reprograma solo'],
  ['Cuenta restringida', 'Cuenta nueva con muchas publicaciones de golpe, o contenido marcado', 'Arrancar con 2–3 por semana las primeras 2 semanas; revisar "Estado de la cuenta"'],
  ['Reel silenciado o bloqueado', 'Música con derechos de autor', 'Usar sólo música libre de derechos (campo music del promo.yaml) o sin música'],
  ['Anuncio: Instagram no autorizado', 'Falta B.6', 'Autorizar la cuenta de Instagram en la cuenta publicitaria'],
  ['Anuncio: cuenta deshabilitada o sin pago', 'Problema de pagos o de políticas', 'Resolverlo en el Administrador de anuncios'],
  ['Anuncio rechazado', 'Política de anuncios (afirmaciones médicas o de resultados)', 'Ajustar el campo avoid del promo.yaml, editar el texto y crear otro borrador'],
]
