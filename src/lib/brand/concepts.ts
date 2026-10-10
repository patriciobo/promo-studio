// Conceptos de identidad predefinidos: la "memoria" de la sección Identidad de marca.
// Cada generación elige los 3 que mejor encajan con el brief (rankConcepts en brief.ts y el modelo de texto) y arma
// una alternativa por concepto. Basados en las escuelas y tendencias de identidad más influyentes en 2026:
// It's Nice That (graphic trends 2026), Envato (logo and branding trends 2026), KOTA, The Branding Journal y
// el trabajo de estudios de Suiza, Países Bajos, Escandinavia, Japón y Corea. Revisar una vez por año.

/** Rasgos de personalidad que se piden en el brief y que cada concepto expresa bien. */
export const PERSONALITIES = ['cercana', 'confiable', 'premium', 'lúdica', 'innovadora', 'artesanal', 'audaz', 'serena', 'técnica', 'cálida', 'sustentable', 'juvenil', 'elegante', 'rebelde', 'natural'] as const
export type Personality = (typeof PERSONALITIES)[number]

/**
 * Ejes del brief, de 0 a 1 (0 = el primer extremo). Son los "sliders" clásicos de un brief de marca:
 * clásica ↔ moderna, seria ↔ lúdica, minimal ↔ expresiva, accesible ↔ exclusiva.
 */
export const AXES = [
  { id: 'modern', from: 'Clásica', to: 'Moderna' },
  { id: 'playful', from: 'Seria', to: 'Lúdica' },
  { id: 'expressive', from: 'Minimal', to: 'Expresiva' },
  { id: 'exclusive', from: 'Accesible', to: 'Exclusiva' },
] as const
export type AxisId = (typeof AXES)[number]['id']
export type Axes = Record<AxisId, number>

/** Gráfico de apoyo de la marca: se dibuja con CSS en la lámina (no gasta en modelos). */
export const PATTERNS = ['puntos', 'rayas', 'grilla', 'arcos', 'ondas', 'manchas', 'ninguno'] as const
export type PatternId = (typeof PATTERNS)[number]

export const LOGO_TYPES = [
  { id: 'wordmark', label: 'Logotipo', hint: 'Sólo el nombre, con una tipografía propia (Google, Zara).' },
  { id: 'lettermark', label: 'Monograma', hint: 'Iniciales (HBO, IBM). Para nombres largos.' },
  { id: 'combination', label: 'Símbolo + nombre', hint: 'Un ícono y el nombre juntos, que también funcionan por separado.' },
  { id: 'symbol', label: 'Isotipo', hint: 'Sólo un símbolo. Requiere tiempo y presencia para que se reconozca.' },
  { id: 'emblem', label: 'Emblema', hint: 'El nombre dentro de un sello o escudo. Tradición, oficio, gastronomía.' },
  { id: 'mascot', label: 'Mascota', hint: 'Un personaje. Cercanía, público joven o familiar.' },
] as const
export type LogoType = (typeof LOGO_TYPES)[number]['id']

export interface BrandConcept {
  id: string
  name: string
  /** Escuela o país de referencia. */
  origin: string
  /** Cómo se ve, en una línea. */
  summary: string
  /** Por qué funciona y para quién. */
  why: string
  personalities: Personality[]
  /** Dónde cae en los ejes del brief (0 a 1). */
  axes: Axes
  /** Palabras del rubro o la descripción que lo vuelven candidato. */
  keywords: string[]
  logoTypes: LogoType[]
  /** Cómo armar la paleta y 2 paletas de ejemplo (la primera es el color principal). */
  palette: { guide: string; examples: string[][] }
  /** Familias de Google Fonts que le quedan bien. */
  fonts: { display: string[]; text: string[] }
  /** Estilo del logo para el modelo de imagen (en inglés). */
  logoStyle: string
  pattern: PatternId
  /** Lo que arruina el concepto. */
  avoid: string
}

export const CONCEPTS: BrandConcept[] = [
  {
    id: 'suizo',
    name: 'Funcional suizo',
    origin: 'Estilo tipográfico internacional (Suiza)',
    summary: 'Grilla estricta, grotesca en negrita, un color primario puro y mucho blanco.',
    why: 'Transmite orden y precisión sin adornos. Envejece muy bien y se aplica fácil en todo.',
    personalities: ['confiable', 'técnica', 'innovadora', 'serena'],
    axes: { modern: 0.75, playful: 0.15, expressive: 0.2, exclusive: 0.5 },
    keywords: ['software', 'tecnología', 'arquitectura', 'ingeniería', 'consultora', 'estudio', 'datos', 'finanzas', 'logística', 'construcción'],
    logoTypes: ['wordmark', 'lettermark', 'combination'],
    palette: { guide: 'Un primario saturado (rojo, azul cobalto o naranja) sobre blanco y negro casi puro.', examples: [['#e3241b', '#ffffff', '#111111', '#d9d9d6'], ['#1f4fff', '#f5f5f2', '#0d0d0d', '#ffd400']] },
    fonts: { display: ['Inter Tight', 'Archivo', 'Space Grotesk'], text: ['Inter', 'Archivo', 'IBM Plex Sans'] },
    logoStyle: 'Swiss International Typographic Style logo, bold neo-grotesque sans-serif, tight letter spacing, strict geometric construction, flat solid colors, perfectly balanced negative space',
    pattern: 'grilla',
    avoid: 'Degradados, sombras y más de un color fuerte.',
  },
  {
    id: 'holandes',
    name: 'Sistema holandés',
    origin: 'Diseño holandés (Studio Dumbar, Experimental Jetset)',
    summary: 'Identidad pensada como sistema: tipografía grande que se mueve, colores fluo y piezas modulares.',
    why: 'Se destaca en redes y pantallas, se adapta a muchas piezas y comunica energía y apertura.',
    personalities: ['audaz', 'innovadora', 'juvenil', 'rebelde'],
    axes: { modern: 0.9, playful: 0.6, expressive: 0.85, exclusive: 0.35 },
    keywords: ['cultura', 'evento', 'festival', 'museo', 'música', 'educación', 'ong', 'comunidad', 'medios', 'agencia'],
    logoTypes: ['wordmark', 'lettermark'],
    palette: { guide: 'Un fluo (verde ácido, rosa, naranja) con negro y un neutro; contraste máximo.', examples: [['#d4ff3a', '#111111', '#f2f2ee', '#ff4fa3'], ['#ff5a1f', '#0c0c0c', '#ffffff', '#3a5bff']] },
    fonts: { display: ['Anton', 'Archivo Black', 'Bricolage Grotesque'], text: ['Inter', 'Space Grotesk', 'DM Sans'] },
    logoStyle: 'bold Dutch graphic design wordmark, oversized heavy sans-serif letters cropped and tightly stacked, modular system feel, flat fluorescent and black colors, made for motion',
    pattern: 'rayas',
    avoid: 'Paletas apagadas o un logo chico y tímido.',
  },
  {
    id: 'nordico',
    name: 'Nórdico cálido',
    origin: 'Minimalismo escandinavo (Oslo, Copenhague, Estocolmo)',
    summary: 'Formas simples y redondeadas, colores tierra suaves, sans humanista y mucho aire.',
    why: 'Calma y calidez sin perder lo profesional. Ideal para servicios de cuidado, hogar y bienestar.',
    personalities: ['serena', 'cálida', 'natural', 'cercana', 'confiable', 'sustentable'],
    axes: { modern: 0.65, playful: 0.3, expressive: 0.2, exclusive: 0.45 },
    keywords: ['salud', 'bienestar', 'hogar', 'diseño', 'muebles', 'psicología', 'nutrición', 'yoga', 'consultorio', 'alojamiento', 'cabañas'],
    logoTypes: ['combination', 'wordmark', 'symbol'],
    palette: { guide: 'Neutros cálidos (arena, avena) con un verde o azul apagado y un acento terracota.', examples: [['#4f6b5a', '#f4efe6', '#232521', '#c97b55'], ['#5b7a99', '#f6f2ea', '#1f2328', '#d9b38c']] },
    fonts: { display: ['Manrope', 'DM Sans', 'Outfit'], text: ['Inter', 'Manrope', 'Karla'] },
    logoStyle: 'Scandinavian minimalist logo, soft rounded geometric symbol, humanist sans-serif, calm balanced proportions, muted earthy flat colors, generous negative space',
    pattern: 'arcos',
    avoid: 'Negro duro, colores saturados y detalles finos.',
  },
  {
    id: 'japones',
    name: 'Ma japonés',
    origin: 'Minimalismo japonés (Kenya Hara, Nendo)',
    summary: 'Vacío intencional (ma), un símbolo mínimo como sello, blanco roto y un solo color.',
    why: 'Sofisticación silenciosa: comunica cuidado, oficio y calidad sin decirlo.',
    personalities: ['serena', 'elegante', 'artesanal', 'premium', 'natural'],
    axes: { modern: 0.55, playful: 0.1, expressive: 0.1, exclusive: 0.8 },
    keywords: ['gastronomía', 'té', 'café', 'cerámica', 'cosmética', 'spa', 'arquitectura', 'indumentaria', 'joyería', 'galería'],
    logoTypes: ['symbol', 'emblem', 'combination'],
    palette: { guide: 'Blanco roto y tinta, con un único color de acento (bermellón, índigo o verde musgo).', examples: [['#c8102e', '#f7f4ee', '#1a1a1a', '#b9b1a4'], ['#2e3f6e', '#f5f2ea', '#161616', '#a89f91']] },
    fonts: { display: ['Shippori Mincho', 'Zen Kaku Gothic New', 'Noto Serif'], text: ['Zen Kaku Gothic New', 'Noto Sans', 'Inter'] },
    logoStyle: 'Japanese minimalist logo, a single refined minimal symbol like a hanko seal or brush-inspired mark, vast negative space, one accent color on off-white, quiet and precise',
    pattern: 'ninguno',
    avoid: 'Llenar el espacio, varios colores o tipografías decorativas.',
  },
  {
    id: 'coreano',
    name: 'Pop coreano',
    origin: 'Branding coreano contemporáneo (Seúl)',
    summary: 'Personajes o íconos simpáticos, tipografía redondeada, pasteles con un color vivo.',
    why: 'Muy compartible en redes y fácil de querer. Funciona para marcas jóvenes y de consumo.',
    personalities: ['lúdica', 'juvenil', 'cercana', 'cálida'],
    axes: { modern: 0.8, playful: 0.9, expressive: 0.65, exclusive: 0.25 },
    keywords: ['café', 'pastelería', 'helados', 'juguetes', 'niños', 'mascotas', 'cosmética', 'app', 'delivery', 'regalos', 'papelería'],
    logoTypes: ['mascot', 'combination', 'wordmark'],
    palette: { guide: 'Dos pasteles (lavanda, menta, durazno) con un color vivo y un oscuro suave.', examples: [['#ff6f91', '#fff4ea', '#2b2340', '#b8e0d2'], ['#7c5cff', '#f7f3ff', '#231c3a', '#ffd166']] },
    fonts: { display: ['Baloo 2', 'Fredoka', 'Nunito'], text: ['Nunito', 'Quicksand', 'DM Sans'] },
    logoStyle: 'Korean contemporary pop brand logo, cute friendly simple character or icon, rounded chunky letters, flat pastel colors with one vivid accent, clean thick outlines',
    pattern: 'puntos',
    avoid: 'Seriedad corporativa, serif o paletas oscuras.',
  },
  {
    id: 'fluido',
    name: 'Cinético fluido',
    origin: 'Tendencia "Blotch" y logos cinéticos (It\'s Nice That, Envato 2026)',
    summary: 'Letras que se estiran o derriten, bordes orgánicos y formas pensadas para moverse.',
    why: 'Se siente vivo y actual; se luce en reels, pantallas y animaciones.',
    personalities: ['audaz', 'innovadora', 'rebelde', 'juvenil', 'lúdica'],
    axes: { modern: 0.95, playful: 0.7, expressive: 0.95, exclusive: 0.4 },
    keywords: ['música', 'bebidas', 'moda', 'arte', 'eventos', 'tecnología', 'videojuegos', 'streaming', 'bar'],
    logoTypes: ['wordmark', 'symbol'],
    palette: { guide: 'Un color líquido intenso (cobalto, magenta, verde ácido) con negro o blanco.', examples: [['#2f3cff', '#f1f0ff', '#0b0b14', '#ff4fd8'], ['#00b37e', '#f2fff9', '#06140f', '#ffe14d']] },
    fonts: { display: ['Bricolage Grotesque', 'Unbounded', 'Syne'], text: ['Inter', 'Syne', 'DM Sans'] },
    logoStyle: 'fluid kinetic wordmark, letters melting stretching and blending like liquid, soft organic blobby edges, designed for motion, flat bold colors',
    pattern: 'manchas',
    avoid: 'Usarlo en marcas que necesitan sobriedad (salud, legales, finanzas).',
  },
  {
    id: 'artesanal',
    name: 'Hecho a mano',
    origin: 'Autenticidad e imperfección (risografía, fotocopia, tipografía dibujada)',
    summary: 'Trazos a mano, grano de impresión, colores de tinta y algo deliberadamente imperfecto.',
    why: 'Frente a lo pulido por IA, lo humano genera confianza y cercanía. Ideal para oficios y productores.',
    personalities: ['artesanal', 'cálida', 'cercana', 'natural', 'rebelde'],
    axes: { modern: 0.4, playful: 0.6, expressive: 0.7, exclusive: 0.35 },
    keywords: ['panadería', 'cerveza', 'vino', 'taller', 'cerámica', 'huerta', 'orgánico', 'feria', 'restaurante', 'artesanía', 'educación', 'talleres'],
    logoTypes: ['wordmark', 'emblem', 'combination'],
    palette: { guide: 'Colores de tinta de risografía (rojo, azul, verde) sobre papel crudo.', examples: [['#e04e39', '#f3ead8', '#2a2522', '#3a6ea5'], ['#2f7a4f', '#f4ecdc', '#24211d', '#f2a03d']] },
    fonts: { display: ['Caveat Brush', 'Gloria Hallelujah', 'Fraunces'], text: ['Karla', 'Work Sans', 'Lora'] },
    logoStyle: 'hand-drawn logo, imperfect brush or marker lettering, risograph print texture feel, warm ink colors on raw paper, human and crafted',
    pattern: 'manchas',
    avoid: 'Bordes perfectos, degradados digitales o tipografías corporativas.',
  },
  {
    id: 'retro',
    name: 'Retro pulido',
    origin: 'Slick retro (tendencias de logo 2026)',
    summary: 'Formas y colores de los 70 y 90 pero con terminación limpia, sin texturas viejas.',
    why: 'Nostalgia que da calidez y personalidad sin verse descuidada. Muy memorable.',
    personalities: ['cálida', 'lúdica', 'audaz', 'cercana'],
    axes: { modern: 0.45, playful: 0.7, expressive: 0.65, exclusive: 0.35 },
    keywords: ['bar', 'café', 'hamburguesas', 'pizza', 'deporte', 'surf', 'música', 'barbería', 'moda', 'radio', 'turismo'],
    logoTypes: ['wordmark', 'emblem', 'combination'],
    palette: { guide: 'Naranja, mostaza y marrón, o azul y crema; colores cálidos y planos.', examples: [['#e8692c', '#f6ead2', '#3b2418', '#f2b632'], ['#2c5f8a', '#f7edd9', '#1d1d1b', '#e94f37']] },
    fonts: { display: ['Bagel Fat One', 'Shrikhand', 'Righteous'], text: ['DM Sans', 'Karla', 'Rubik'] },
    logoStyle: 'slick retro logo, 1970s inspired bold rounded display lettering, clean flat vector finish without grunge, warm vintage palette, playful confident shapes',
    pattern: 'ondas',
    avoid: 'Texturas sucias o mezclar demasiadas décadas.',
  },
  {
    id: 'micro',
    name: 'Micrográfico técnico',
    origin: 'Micrographics (Astrae Studio, It\'s Nice That 2026)',
    summary: 'Etiquetas, coordenadas, códigos y grillas finas como textura; tipografía mono.',
    why: 'Sugiere precisión y conocimiento experto. Muy usado en tecnología, deporte y productos técnicos.',
    personalities: ['técnica', 'innovadora', 'audaz', 'confiable'],
    axes: { modern: 0.9, playful: 0.25, expressive: 0.55, exclusive: 0.55 },
    keywords: ['tecnología', 'software', 'deporte', 'bicicletas', 'outdoor', 'laboratorio', 'industria', 'drones', 'ia', 'datos', 'trazabilidad'],
    logoTypes: ['lettermark', 'wordmark', 'symbol'],
    palette: { guide: 'Negro o gris grafito con un color de señal (naranja seguridad, verde lima) y blanco.', examples: [['#ff5f00', '#f2f2f0', '#0e0f10', '#9aa0a6'], ['#c6ff00', '#111315', '#f4f4f2', '#5b6168']] },
    fonts: { display: ['Space Grotesk', 'JetBrains Mono', 'Chakra Petch'], text: ['IBM Plex Mono', 'IBM Plex Sans', 'Inter'] },
    logoStyle: 'technical micrographic logo, precise monospaced or engineered letterforms, small technical labels and registration marks, blueprint precision, flat signal colors on graphite',
    pattern: 'grilla',
    avoid: 'Formas blandas o colores pastel.',
  },
  {
    id: 'raices',
    name: 'Raíces locales',
    origin: 'Identidades con herencia regional (oficios, textiles y paisajes de cada lugar)',
    summary: 'Colores y formas tomados del lugar: textiles, paisaje, tipografía de cartelería local.',
    why: 'Diferencia de las marcas globales y conecta con orgullo local. Ideal para turismo, gastronomía y productores.',
    personalities: ['cálida', 'natural', 'artesanal', 'cercana', 'confiable', 'sustentable'],
    axes: { modern: 0.35, playful: 0.4, expressive: 0.5, exclusive: 0.45 },
    keywords: ['turismo', 'alojamiento', 'cabañas', 'gastronomía', 'vino', 'yerba', 'campo', 'regional', 'productos', 'artesanía', 'sierras', 'montaña'],
    logoTypes: ['emblem', 'combination', 'wordmark'],
    palette: { guide: 'Tierra, verde monte, cielo y un color textil fuerte del lugar.', examples: [['#b5532c', '#f3e9d8', '#2b2620', '#5f7f4f'], ['#2f5d50', '#f5eedf', '#1f1d1a', '#d9a23b']] },
    fonts: { display: ['Fraunces', 'Alfa Slab One', 'Rye'], text: ['Lora', 'Work Sans', 'Karla'] },
    logoStyle: 'regional heritage logo, shapes inspired by local landscape and traditional textiles, warm earthy flat colors, crafted badge or emblem feel, timeless',
    pattern: 'ondas',
    avoid: 'Clichés turísticos (soles con cara, mates genéricos) y fotos dentro del logo.',
  },
  {
    id: 'sensorial',
    name: 'Sensorial 3D',
    origin: 'Branding sensorial (texturas brillantes, líquidas y táctiles)',
    summary: 'Volúmenes suaves, brillos y texturas que dan ganas de tocar, sobre fondos limpios.',
    why: 'Llama la atención en el feed y transmite producto, placer y novedad.',
    personalities: ['premium', 'lúdica', 'innovadora', 'juvenil'],
    axes: { modern: 0.9, playful: 0.6, expressive: 0.75, exclusive: 0.6 },
    keywords: ['cosmética', 'bebidas', 'tecnología', 'app', 'golosinas', 'perfumes', 'moda', 'fintech', 'gaming'],
    logoTypes: ['symbol', 'combination', 'wordmark'],
    palette: { guide: 'Un color brillante principal con degradé suave y un neutro claro.', examples: [['#8a5cff', '#f6f3ff', '#17132a', '#ff9ad5'], ['#ff7a45', '#fff6f0', '#21140f', '#ffd25e']] },
    fonts: { display: ['Unbounded', 'Outfit', 'Sora'], text: ['Inter', 'Sora', 'Outfit'] },
    logoStyle: 'sensory 3D logo symbol, soft glossy inflated or liquid volume, gentle highlights, tactile and smooth, simple strong silhouette, clean light background',
    pattern: 'manchas',
    avoid: 'Logos que sólo funcionan en 3D: siempre tiene que haber una versión plana.',
  },
  {
    id: 'clasico',
    name: 'Clásico confiable',
    origin: 'Tradición editorial y profesional (serif contemporánea)',
    summary: 'Serif contemporánea, azul profundo o verde inglés, simetría y detalles sobrios.',
    why: 'Transmite seriedad, trayectoria y respaldo. Lo que se espera de salud, legales, finanzas y educación.',
    personalities: ['confiable', 'elegante', 'premium', 'serena'],
    axes: { modern: 0.25, playful: 0.1, expressive: 0.2, exclusive: 0.65 },
    keywords: ['salud', 'odontología', 'abogados', 'estudio contable', 'finanzas', 'seguros', 'educación', 'colegio', 'inmobiliaria', 'consultorio', 'medicina'],
    logoTypes: ['wordmark', 'combination', 'lettermark', 'emblem'],
    palette: { guide: 'Un color profundo (azul marino, verde inglés, bordó) con marfil y un dorado o celeste de acento.', examples: [['#1d3557', '#f7f4ec', '#14181f', '#c9a227'], ['#1f4d3a', '#f6f3ea', '#151a17', '#9cc5b2']] },
    fonts: { display: ['Fraunces', 'Playfair Display', 'Cormorant Garamond'], text: ['Source Sans 3', 'Lora', 'Inter'] },
    logoStyle: 'classic trustworthy logo, refined contemporary serif lettering, symmetric balanced composition, deep navy or forest green flat color, subtle elegant monogram',
    pattern: 'rayas',
    avoid: 'Tipografías de moda que envejecen rápido o colores fluo.',
  },
]

export const concept = (id: string) => CONCEPTS.find((c) => c.id === id)

/** Todas las familias de Google Fonts del catálogo (para validar lo que propone el modelo). */
export const CATALOG_FONTS = [...new Set(CONCEPTS.flatMap((c) => [...c.fonts.display, ...c.fonts.text]))]
