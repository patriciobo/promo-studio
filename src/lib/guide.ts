// Paso a paso para conectar las cuentas y tabla de errores (se muestra en /guia y en cada app).

/** Una indicación, opcionalmente con los clics exactos para hacerla. */
export type GuideItem = string | { text: string; steps: string[] }

export interface GuideStep {
  id: string
  title: string
  items: GuideItem[]
}

// Los nombres de menús y botones son los de Meta en español; si aparecen en inglés, va el original entre paréntesis.
// Meta cambia la interfaz seguido: si un nombre no coincide, buscá el más parecido en el mismo lugar.
export const STEPS_ONCE: GuideStep[] = [
  {
    id: 'A.1',
    title: 'Portfolio comercial',
    items: [
      {
        text: 'Creá el portfolio comercial (antes "Business Manager").',
        steps: [
          'Entrá a business.facebook.com con tu Facebook personal.',
          'Si ya tenés un portfolio, elegilo arriba a la izquierda y pasá al punto siguiente.',
          'Si no: "Crear una cuenta" (Create account) → nombre del negocio (tu nombre o el de tu estudio), tu nombre y un email de trabajo → "Enviar".',
          'Abrí el email que te manda Meta y confirmá la dirección.',
          'La configuración que usan todos los pasos siguientes está en business.facebook.com/settings ("Configuración del negocio" o "Configuración de la empresa").',
        ],
      },
      {
        text: 'Activá la verificación en dos pasos en tu perfil de Facebook: Meta la exige para administrar activos.',
        steps: [
          'En Facebook: tu foto → "Configuración y privacidad" → "Configuración".',
          '"Centro de cuentas" (Accounts Center) → "Contraseña y seguridad" → "Autenticación en dos pasos".',
          'Elegí tu cuenta de Facebook → "App de autenticación" (recomendado) → escaneá el QR con Google Authenticator, 1Password o similar → ingresá el código → "Siguiente".',
        ],
      },
    ],
  },
  {
    id: 'A.2',
    title: 'Cuenta publicitaria',
    items: [
      'Sólo hace falta para crear anuncios. Si por ahora sólo vas a publicar, podés saltear este paso y volver después.',
      {
        text: 'Creá la cuenta publicitaria dentro del portfolio.',
        steps: [
          'business.facebook.com/settings → menú izquierdo "Cuentas" → "Cuentas publicitarias" → "+ Agregar".',
          'Elegí "Crear una nueva cuenta publicitaria".',
          'Nombre (por ejemplo "Promo Studio"), zona horaria "America/Argentina/Buenos_Aires" y moneda (ARS o USD; después no se puede cambiar) → "Siguiente".',
          'En "¿Para quién es esta cuenta?" elegí "Mi negocio" → "Crear".',
          'En la ventana de personas, agregate a vos con "Administrar cuenta publicitaria" (control total) → "Asignar".',
        ],
      },
      {
        text: 'Agregá un medio de pago.',
        steps: [
          'Con la cuenta seleccionada, "Agregar información de pago" (o desde el Administrador de anuncios → "Facturación y pagos" → "Métodos de pago").',
          'País, moneda y tarjeta → "Guardar". No se cobra nada hasta que actives un anuncio: Promo Studio los crea siempre en pausa.',
        ],
      },
    ],
  },
  {
    id: 'A.3',
    title: 'App de Meta for Developers',
    items: [
      {
        text: 'Registrate como desarrollador (sólo la primera vez).',
        steps: [
          'Entrá a developers.facebook.com → "Comenzar" (Get started) arriba a la derecha.',
          'Aceptá los términos, verificá tu teléfono y tu email, y en "¿Qué te describe mejor?" elegí "Desarrollador" → "Completar registro".',
        ],
      },
      {
        text: 'Creá la app con los casos de uso de Instagram y de anuncios, vinculada al portfolio.',
        steps: [
          'developers.facebook.com → "Mis apps" (My Apps) → "Crear app" (Create app).',
          'Detalles: nombre "Promo Studio" y tu email → "Siguiente".',
          'Casos de uso: marcá "Administrar mensajes y contenido en Instagram" (Manage messaging & content on Instagram) y "Crear y administrar anuncios con la API de marketing" (Create & manage ads with Marketing API). Si no los ves, usá el filtro "Todos" o el buscador de la pantalla. Los que quedan en gris son incompatibles con lo ya marcado → "Siguiente".',
          'Portfolio comercial: elegí el del paso A.1 → "Siguiente".',
          'Requisitos: revisalos → "Siguiente" → "Ir al panel" (Go to dashboard).',
          'Ya no existe "Agregar producto": todo se configura desde "Casos de uso" en el menú izquierdo. Facebook Login for Business no se agrega aparte; Meta lo suma con el caso de uso si hace falta.',
          'Si ya creaste la app sin estos casos de uso: menú izquierdo "Casos de uso" → "Agregar caso de uso" (Add use case). Si alguno aparece en gris, es más simple crear una app nueva y elegirlos desde el principio.',
        ],
      },
      {
        text: 'Configurá Instagram para usarse con inicio de sesión con Facebook.',
        steps: [
          'Menú izquierdo "Casos de uso" → en "Administrar mensajes y contenido en Instagram" → "Personalizar" (Customize).',
          'Elegí "Configuración de API con inicio de sesión con Facebook" (API setup with Facebook login), NO la de inicio de sesión con Instagram: el token de usuario de sistema sólo funciona con la primera.',
          'Pestaña "Permisos y funciones" (Permissions and features): tocá "Agregar" en instagram_basic, instagram_content_publish, instagram_manage_insights, instagram_manage_comments, pages_show_list, pages_read_engagement y business_management (los que ya digan "Listo para probar" no hace falta tocarlos).',
        ],
      },
      {
        text: 'Revisá los permisos de anuncios.',
        steps: [
          '"Casos de uso" → "Crear y administrar anuncios con la API de marketing" → "Personalizar".',
          'En "Permisos y funciones", ads_management y ads_read tienen que figurar como agregados; si no, "Agregar".',
        ],
      },
      'La app puede quedar en modo "Desarrollo": como sólo usa cuentas de tu propio portfolio, no hace falta la revisión de apps (App Review). Para cuentas de clientes, ver C.1.',
    ],
  },
  {
    id: 'A.4',
    title: 'Usuario de sistema',
    items: [
      {
        text: 'Creá el usuario de sistema con rol Administrador.',
        steps: [
          'business.facebook.com/settings → menú izquierdo "Usuarios" → "Usuarios del sistema" → "+ Agregar".',
          'Si es el primero, aceptá las condiciones de usuarios del sistema.',
          'Nombre "promo-studio" y rol "Administrador" (Admin) → "Crear usuario del sistema".',
        ],
      },
      {
        text: 'Dale acceso a la app de Meta (sin esto no deja generar el token).',
        steps: [
          'Con el usuario seleccionado → "Asignar activos" (Assign assets).',
          'Tipo de activo "Apps" → marcá la app del paso A.3 → activá "Administrar app" / "Control total" → "Asignar activos" → "Listo".',
        ],
      },
    ],
  },
  {
    id: 'A.5',
    title: 'Token del usuario de sistema',
    items: [
      {
        text: 'Generá el token con vencimiento Nunca.',
        steps: [
          'business.facebook.com/settings → "Usuarios" → "Usuarios del sistema" → elegí "promo-studio" → "Generar nuevo token" (Generate new token).',
          'App: la del paso A.3 → "Siguiente".',
          'Vencimiento del token: "Nunca" (Never) → "Siguiente".',
          'Permisos: marcá instagram_basic, instagram_content_publish, instagram_manage_insights, instagram_manage_comments, pages_show_list, pages_read_engagement, business_management, ads_management y ads_read. Si falta alguno en la lista, agregalo en "Permisos y funciones" del caso de uso correspondiente (paso A.3).',
          '"Generar token" → copialo: Meta lo muestra una sola vez. Si lo perdés, generá otro.',
        ],
      },
      {
        text: 'Cargalo en Promo Studio. Se guarda cifrado y el servicio verifica los permisos.',
        steps: [
          'Promo Studio → "Configuración" → sección "Claves".',
          'Pegalo en "Token de Meta (usuario de sistema)" → "Guardar claves". El campo pasa a mostrar el token enmascarado.',
        ],
      },
    ],
  },
]

export const STEPS_PER_APP: GuideStep[] = [
  {
    id: 'B.1',
    title: 'Cuenta de Instagram tipo Empresa',
    items: [
      {
        text: 'Pasá la cuenta de la app a profesional de tipo Empresa (no Creador: con Creador no se pueden publicar stories por la API).',
        steps: [
          'En la app de Instagram, entrá con la cuenta de esa app → tu perfil → menú ☰ arriba a la derecha.',
          '"Configuración y actividad" → "Tipo de cuenta y herramientas" → "Cambiar a cuenta profesional" → "Continuar".',
          'Categoría: "Aplicación" o la temática de la app → "Listo".',
          'Tipo: "Empresa" (Business) → "Siguiente". Si ofrece conectar una página de Facebook, podés saltearlo: se hace en B.3.',
          'Si ya era Creador: mismo menú → "Tipo de cuenta y herramientas" → "Cambiar a cuenta de empresa".',
        ],
      },
    ],
  },
  {
    id: 'B.2',
    title: 'Página de Facebook',
    items: [
      {
        text: 'Creá la página de la app con el mismo nombre y logo si todavía no existe.',
        steps: [
          'Lo más simple es crearla desde el portfolio, así ya queda agregada (y te salteás B.4 para la página): business.facebook.com/settings → "Cuentas" → "Páginas" → "+ Agregar" → "Crear una nueva página".',
          'Nombre de la app, categoría (por ejemplo "Aplicación" o "Software") y descripción corta → "Crear página".',
          'Subí el logo como foto de perfil y una portada → "Guardar".',
        ],
      },
    ],
  },
  {
    id: 'B.3',
    title: 'Vincular Instagram y la página',
    items: [
      {
        text: 'Vinculá la cuenta de Instagram a la página, iniciando sesión en la cuenta de esa app.',
        steps: [
          'En Facebook, cambiá al perfil de la página: tu foto arriba a la derecha → elegí la página.',
          '"Configuración" → "Cuentas vinculadas" (Linked accounts) → "Instagram" → "Conectar cuenta".',
          'Si pregunta por el acceso a los mensajes de Instagram, podés dejarlo activado o no: Promo Studio no los usa → "Continuar".',
          'Iniciá sesión con usuario y contraseña de la cuenta de Instagram de ESA app → "Confirmar".',
          'Verificá en "Cuentas vinculadas" que figure el @usuario correcto: con 3 cuentas abiertas es fácil vincular la equivocada.',
        ],
      },
    ],
  },
  {
    id: 'B.4',
    title: 'Sumar los activos al portfolio',
    items: [
      {
        text: 'Agregá la página al portfolio (si la creaste desde ahí en B.2, ya está).',
        steps: [
          'business.facebook.com/settings → "Cuentas" → "Páginas" → "+ Agregar" → "Agregar una página".',
          'Escribí el nombre o la URL de la página → "Agregar página".',
        ],
      },
      {
        text: 'Agregá la cuenta de Instagram al portfolio.',
        steps: [
          'business.facebook.com/settings → "Cuentas" → "Cuentas de Instagram" → "+ Agregar".',
          '"Conectar tu cuenta de Instagram" → iniciá sesión con la cuenta de la app → "Confirmar".',
          'Verificá que aparezca en la lista con el @usuario correcto.',
        ],
      },
    ],
  },
  {
    id: 'B.5',
    title: 'Dar acceso al usuario de sistema',
    items: [
      {
        text: 'Asigná la página, la cuenta de Instagram y la cuenta publicitaria al usuario de sistema.',
        steps: [
          'business.facebook.com/settings → "Usuarios" → "Usuarios del sistema" → "promo-studio" → "Asignar activos".',
          'Tipo "Páginas" → marcá la página → activá "Control total" (todas las opciones encendidas) → "Asignar activos".',
          'Otra vez "Asignar activos" → tipo "Cuentas de Instagram" → marcá la cuenta → "Control total" → "Asignar activos".',
          'Otra vez "Asignar activos" → tipo "Cuentas publicitarias" → marcá la cuenta → "Administrar campañas" (o "Control total") → "Asignar activos".',
          'Verificá en la pestaña "Activos" del usuario que figuren los tres. No hace falta generar otro token: el de A.5 ya llega a los activos nuevos.',
        ],
      },
    ],
  },
  {
    id: 'B.6',
    title: 'Autorizar Instagram en la cuenta publicitaria',
    items: [
      {
        text: 'Conectá la cuenta de Instagram a la cuenta publicitaria. Sin esto no se pueden crear anuncios con sus posts.',
        steps: [
          'business.facebook.com/settings → "Cuentas" → "Cuentas de Instagram" → elegí la cuenta de la app.',
          '"Activos conectados" (Connected assets) → "Conectar activos" → tipo "Cuentas publicitarias".',
          'Marcá la cuenta publicitaria del paso A.2 → "Agregar" / "Conectar".',
        ],
      },
    ],
  },
  {
    id: 'B.7',
    title: 'Elegir la cuenta en Promo Studio',
    items: [
      {
        text: 'Elegí la cuenta de Instagram y la cuenta publicitaria de la app.',
        steps: [
          'Promo Studio → la app → pestaña "Instagram" → "Buscar cuentas".',
          'En "Cuenta de Instagram de esta app", marcá el @usuario correcto. Si dice "Sin Instagram vinculado", revisá B.1 y B.3.',
          '"Cuenta publicitaria": elegila, o dejá "Sin cuenta publicitaria" hasta usar anuncios → "Guardar conexión".',
        ],
      },
    ],
  },
  {
    id: 'B.8',
    title: 'Probar la conexión',
    items: [
      {
        text: '"Probar conexión" verifica token, permisos, cuenta, URL pública de media, cupo y cuenta publicitaria.',
        steps: [
          'En la misma pestaña "Instagram" → "Probar conexión". Cada punto tiene que quedar en verde.',
          'Si algo sale en rojo, el texto dice qué falta; la tabla de errores frecuentes tiene el arreglo.',
          'Opcional: "Probar con contenedor de prueba" sube una imagen a Instagram sin publicarla, para confirmar que Meta puede descargar la media.',
        ],
      },
      {
        text: 'Hacé la primera prueba real con una story: desaparece sola en 24 h. Después desactivá la simulación.',
        steps: [
          'Pestaña "Ajustes" de la app → destildá "Simulación: genera y "publica" sin tocar Instagram" → guardá.',
          'Dejá corriendo el worker (npm run worker o el contenedor worker): es el que publica lo programado.',
        ],
      },
    ],
  },
]

// Cuentas de otras personas: el cliente sigue siendo dueño de su Instagram, su página y su cuenta publicitaria,
// y le da acceso a tu portfolio de clientes (separado del tuyo), que tiene su propia app, usuario de sistema y token.
export const STEPS_CLIENT: GuideStep[] = [
  {
    id: 'C.1',
    title: 'Una sola vez: el portfolio de clientes',
    items: [
      'Un portfolio comercial aparte para clientes (A.1), con el nombre que van a ver en las solicitudes (por ejemplo, el de tu empresa).',
      {
        text: 'Una app de Meta de ese portfolio. Una app es de un solo portfolio: la de tus apps propias no se puede usar acá ("no es de tu propiedad").',
        steps: [
          'developers.facebook.com → "Crear app" → nombre (por ejemplo "Promo Studio Clientes") → los mismos casos de uso de A.3.',
          'En "Portfolio comercial" elegí el de clientes.',
          'Casos de uso → Instagram → "Personalizar" → "Configuración de API con inicio de sesión con Facebook" → agregá los permisos de A.3 (y los de anuncios).',
        ],
      },
      {
        text: 'Un usuario de sistema del portfolio de clientes con la app asignada, y su token.',
        steps: [
          'Portfolio de clientes → "Usuarios" → "Usuarios del sistema" → "+ Agregar" → "promo-studio-clientes", rol Administrador.',
          '"Asignar activos" → "Apps" → la app nueva → "Administrar app" / "Control total". Sin esto, al generar el token dice "No hay permisos disponibles".',
          '"Generar nuevo token" → la app nueva → vencimiento "Nunca" → los permisos de A.5 → copialo.',
          'Promo Studio → "Configuración" → "Token de Meta para clientes" → pegalo → "Guardar claves".',
        ],
      },
      {
        text: 'Acceso avanzado para esa app: Meta lo exige para publicar en cuentas que no son tuyas. Tarda días: empezalo antes del primer cliente.',
        steps: [
          'Verificación del negocio del portfolio de clientes: business.facebook.com/settings → "Centro de seguridad" → "Verificación del negocio".',
          'developers.facebook.com → la app → "Revisión de la app" → "Permisos y funciones" → "Acceso avanzado" para instagram_basic, instagram_content_publish, instagram_manage_insights, instagram_manage_comments, pages_show_list, pages_read_engagement, business_management, ads_management y ads_read. Por cada uno, Meta pide para qué lo usás y un video corto (elegir la cuenta en Promo Studio y publicar una prueba).',
          'Aprobado: pasá la app de "Desarrollo" a "Activo" (Live) con el selector de arriba del panel.',
        ],
      },
    ],
  },
  {
    id: 'C.2',
    title: 'Lo que hace el cliente',
    items: [
      'Mandale la guía para clientes (PDF): pasa su Instagram a Empresa, lo conecta a su página de Facebook y te manda el link de la página, su @ de Instagram, el WhatsApp para aprobar y, si hay anuncios, el número de su cuenta publicitaria.',
    ],
  },
  {
    id: 'C.3',
    title: 'Pedir el acceso (lo hacés vos) y que el cliente lo apruebe',
    items: [
      {
        text: 'Con los datos del cliente, pedí acceso desde el portfolio de clientes.',
        steps: [
          'business.facebook.com/settings (portfolio de clientes) → "Cuentas" → "Páginas" → "+ Agregar" → "Solicitar acceso a una página" → el link de su página → permisos de control total (incluido Instagram, si lo ofrece) → "Solicitar acceso".',
          'Si hay anuncios: "Cuentas publicitarias" → "+ Agregar" → "Solicitar acceso a una cuenta publicitaria" → su número → "Administrar campañas".',
          'Avisale al cliente que la mandaste: la aprueba desde la notificación de Facebook o en business.facebook.com → "Configuración" → "Solicitudes".',
        ],
      },
      'Si no le llega o su Instagram no aparece después: plan B del PDF. El cliente te da acceso como socio con el identificador del portfolio de clientes ("Usuarios" → "Socios" → "Dar a un socio acceso a tus activos"), marcando página, Instagram y cuenta publicitaria.',
      'Verificá en el portfolio de clientes ("Cuentas" → "Páginas" / "Cuentas de Instagram" / "Cuentas publicitarias") que aparezcan sus activos.',
    ],
  },
  {
    id: 'C.4',
    title: 'Asignarlos al usuario de sistema de clientes',
    items: [
      {
        text: 'Igual que B.5, en el portfolio de clientes y con "promo-studio-clientes".',
        steps: [
          'Portfolio de clientes → "Usuarios del sistema" → "promo-studio-clientes" → "Asignar activos".',
          '"Páginas" → la del cliente → "Control total". Repetí con "Cuentas de Instagram" y "Cuentas publicitarias".',
          'No hace falta otro token: el de C.1 llega a cada cliente nuevo que asignes.',
        ],
      },
      'Para anuncios, su Instagram tiene que estar autorizado en su cuenta publicitaria (B.6). Eso se hace en el portfolio del cliente; si al crear un anuncio da error, pedíselo o hacelo vos si te dio control total.',
    ],
  },
  {
    id: 'C.5',
    title: 'Conectarla en Promo Studio',
    items: [
      '"+ Conectar cuenta de cliente" (o, en Ajustes de una app, "De un cliente"): esas apps usan el token para clientes.',
      'Ajustes: el WhatsApp del cliente para que apruebe, y la simulación activa hasta la primera prueba con una story.',
      'Pestaña "Instagram" → "Buscar cuentas" → elegí la del cliente → "Probar conexión" (B.7 y B.8). Si no aparece o da error 10 o 200: revisá C.3 y C.4, y que el acceso avanzado de C.1 esté aprobado.',
    ],
  },
]

export const ERRORS: [string, string, string][] = [
  ['"Buscar cuentas" no muestra la cuenta', 'No es Empresa, no está vinculada a la página o la página no está asignada al usuario de sistema', 'Repetir B.1, B.3 y B.5'],
  ['Cuenta de un cliente: no aparece o da 10 / 200', 'El cliente no compartió los activos, no están asignados al usuario de sistema o la app de Meta no tiene acceso avanzado', 'Repetir C.3 y C.4; si sigue, el acceso avanzado de C.1 (verificación del negocio y revisión de la app)'],
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
