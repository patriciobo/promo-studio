# Promo Studio

Servicio que genera y publica contenido de Instagram (posts, carruseles, reels y stories) para promocionar tus apps,
cada una con su propia cuenta. Lee la información de cada app desde su repositorio (`promo.yaml`), arma un lote semanal
con un modelo de texto y otro de imagen de OpenRouter, te lo deja para revisar, lo publica a horario, mide cómo rinde
y crea anuncios **en pausa** con los mejores posts.

## Cómo funciona

| Paso | Cuándo | Qué hace |
|---|---|---|
| Sincronizar | domingo 18:00 y a pedido | Lee `promo.yaml`, logo, capturas y fuentes de la app |
| Planificar | después de sincronizar | **1 llamada** al modelo de texto arma la semana (tipo, gancho, descripción, textos y prompt de imagen) |
| Generar | igual | **1 imagen por pieza** con el modelo de imagen (sin texto) |
| Renderizar | igual | Plantillas HTML con la marca → JPEG 1080×1350 / 1080×1920; reels con ffmpeg |
| Revisión | 48 h | Editás, regenerás, aprobás o rechazás. Lo no revisado se aprueba solo |
| Publicar | a la hora programada | API de Instagram, con reintentos y errores explicados |
| Medir | 24 h, 72 h y 7 días | Alcance, guardados, compartidos… → puntaje de **potencial** |
| Anunciar | a pedido | Campaña, conjunto y anuncio con el post como creatividad, **siempre en pausa** |

**Ritmo por defecto** (configurable en `promo.yaml → cadence`): 3 posts de feed (lunes carrusel, miércoles imagen, viernes reel)
y 2 stories por semana. Unas 5 imágenes de IA por app y por semana: con modelos de ~US$ 0,03–0,04 por imagen, **US$ 2–3 por mes
para las 3 apps**. Hay tope mensual por app y uno global; al llegar, deja de generar y te avisa.

## Desarrollo

```bash
cp .env.example .env          # AUTH_BYPASS=1 y OPENROUTER_MOCK=1 para probar sin claves ni gastos
docker compose up -d db       # Postgres en el puerto 5434
npm install
npx prisma migrate deploy
npm run dev                   # web en http://localhost:3000
npm run worker                # tareas: lote semanal, publicación (cada minuto), métricas (cada hora)
npm test                      # tests de manifiesto, calendario, puntaje, pedidos a Instagram y Meta
```

Para probar sin GitHub, el repositorio de una app puede ser local: `file:/ruta/al/repo`.
Cada app arranca en **simulación** (no publica en Instagram); se desactiva en Ajustes cuando la conexión está verificada.

## Producción (VPS con Docker)

1. Subdominio HTTPS apuntando al VPS (por ejemplo `promo.tudominio.com`). Instagram descarga la media desde `PUBLIC_URL/media/...`.
2. `.env` desde `.env.example`: `PUBLIC_URL`, `APP_SECRET`, `AUTH_SECRET`, `ADMIN_USER` y `ADMIN_PASSWORD_HASH` (generalo con `npm run password -- 'tu contraseña'`).
3. `docker compose up -d --build` (web en el puerto 3000 detrás de Coolify o Caddy, worker y Postgres).
4. En la web: Configuración → Claves (Meta, OpenRouter, GitHub y, si querés avisos por WhatsApp, WAHA).
5. Backups: volumen `pgdata` (Postgres) y `media`.

## Conectar una app

1. **Conectar app** → URL del repo. El token de GitHub necesita lectura de Contents y Metadata; para que el asistente abra PRs, también escritura en Contents y Pull requests.
2. **promo.yaml** → "Generar borrador desde el repo" (lee README, package.json, llms.txt, íconos y estilos), revisá y abrí el PR o descargalo.
3. **Instagram** → seguí la *Guía de conexión* (pasos A una vez, B por app), "Buscar cuentas", elegí la cuenta y "Probar conexión".
4. **Perfil** → kit con foto, nombre buscable, bio, link con UTM y portadas de destacadas (la API no permite cambiar el perfil: se aplica a mano).
5. **Ajustes** → modelos de OpenRouter, presupuesto, horario, aprobación automática y desactivar la simulación.

### `promo.yaml`

```yaml
name: Mi App
url: https://miapp.com
tagline: Qué hace, en una línea
description: Párrafo con más detalle (opcional)
audience: { countries: [AR, UY], age: [22, 55], interests: [tema], description: para quién es }
languages: [es]
tone: cercano y claro
brand: { colors: ["#1c6a4e", "#f6f6f3", "#17191b"], font: Inter, logo: .promo/logo.svg }
features: [Función 1, Función 2]
screenshots: [.promo/shots/inicio.png]
pillars: [educativo, producto, comunidad]     # temas recurrentes
hashtags: ["#tema"]
avoid: [promesas médicas]                      # también previene rechazos de anuncios
cta: Probala gratis (link en la bio)
location: Córdoba, Argentina                   # opcional
music: .promo/musica.mp3                       # opcional, sólo libre de derechos
links: [{ label: Ver demo, url: "https://miapp.com/demo" }]
sources:                                       # opcional: ideas que publica la app
  - { type: feed, url: "https://miapp.com/promo-feed.json" }   # { items: [{ id, title, body, bullets, pillar, url }] }
  - { type: url, url: "https://miapp.com/llms.txt" }
cadence: { feed: 3, reels: 1, stories: 2 }     # por semana
```

## Identidad de marca

Pestaña **Marca** de cada app (`/apps/<app>/marca`): un brief y rondas de **3 alternativas** (logo, paleta,
tipografías, tono de voz, frase y gráfico de apoyo), cada una con su lámina para mostrar al cliente.

- **Partir del repo:** lee el `promo.yaml` y, si no hay, los estilos, `package.json` y el README de la app.
  Toma colores, tipografías, logo y frase, y marca para generar sólo lo que falta. Lo que no se marca se respeta.
  **Desde cero** genera todo sin tomar nada del repo.
- **Brief:** 5 bloques. Los bloques son el negocio, el público y el mercado, la personalidad (rasgos y 4 ejes), los gustos y referencias (con un logo de referencia opcional) y el uso y los límites.
  Arranca con lo que dice el `promo.yaml`.
- **Conceptos:** cada alternativa sale de un concepto distinto del catálogo `src/lib/brand/concepts.ts`.
  El catálogo tiene 12 escuelas y tendencias 2026: suizo, holandés, nórdico, japonés, pop coreano, cinético fluido, hecho a mano, retro pulido, micrográfico, raíces locales, sensorial 3D y clásico.
  `rankConcepts` los ordena según el brief y el modelo de texto elige 3. Las rondas siguientes prefieren conceptos nuevos y aceptan un pedido ("más minimal").
- **Guardar en el repo** (con la alternativa elegida):
  - escribe `.promo/marca/` con el logo (SVG si se vectorizó), la lámina, `MARCA.md` (guía) y `marca.json`.
  - actualiza en el `promo.yaml` los campos marcados: colores, tipografía de las piezas, logo, frase, y opcionalmente tono y nombre.
  - La edición del `promo.yaml` reemplaza sólo esos valores: comentarios y formato quedan igual.
  - En GitHub abre un pull request (o hace un commit directo en la rama, a elección). En un repo local (`file:`) escribe los archivos.
  - Con commit o repo local, la app se vuelve a sincronizar sola.
- **Modelos:** el logo usa Recraft V4.1 Flash (~US$ 0,007, especializado en diseño) o Sunburst baja (~US$ 0,006), elegibles en cada ronda.
  El logo se puede vectorizar con Recraft V4.1 Vector (~US$ 0,08). Una ronda completa cuesta ~US$ 0,03 y se descuenta del tope de la app.
- Corre en el worker (colas `brand-round` y `brand-vector`). Los archivos quedan en `MEDIA_DIR/apps/<app>/marca/`.

## Seguridad

- La interfaz pide usuario y contraseña (`ADMIN_USER` + `ADMIN_PASSWORD_HASH`, hash scrypt); tras 5 intentos fallidos la IP queda bloqueada 15 minutos. Son públicas sólo `/media/*` (lo que Instagram descarga) y `/l/*` (página de links).
- Los secretos cargados desde la web se guardan cifrados (AES-256-GCM con `APP_SECRET`).
- Los anuncios se crean en pausa; activarlos pide confirmación y muestra el gasto diario.
- La página de links sólo redirige a destinos declarados en el `promo.yaml`.

## Estructura

```
src/lib/          manifiesto, GitHub, OpenRouter (costos y topes), pipeline semanal, Instagram, anuncios, métricas
src/lib/onboarding/  asistente de promo.yaml, control de salud de Meta, kit de perfil
src/lib/brand/    identidad de marca: catálogo de conceptos, brief, lectura de repos y generación de alternativas
src/templates/    plantillas HTML de las piezas (marca de cada app)
src/render/       Chromium (puppeteer) y ffmpeg
src/worker/       pg-boss: crons y colas
src/app/          interfaz (Next.js) y rutas públicas
prisma/           esquema de datos
```
