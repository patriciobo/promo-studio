// Política de privacidad pública: Meta la exige para pasar la app de Meta a modo público (Live),
// requisito para crear anuncios. Incluye cómo pedir la eliminación de datos (también la pide Meta).
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Política de privacidad · Promo Studio' }

export default function Privacy() {
  const contact = process.env.CONTACT_EMAIL
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px', lineHeight: 1.6, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Política de privacidad</h1>
      <p>
        Promo Studio es una herramienta interna que publica contenido y administra anuncios en las cuentas de Instagram y Facebook de sus propias marcas. No ofrece cuentas a terceros ni
        recopila datos de los usuarios de Instagram o Facebook.
      </p>
      <h2>Qué datos usamos</h2>
      <ul>
        <li>Datos de nuestras propias cuentas de Meta (páginas, cuentas de Instagram y cuentas publicitarias) para publicar contenido y crear anuncios.</li>
        <li>Métricas agregadas de esas publicaciones y anuncios (alcance, interacciones, gasto) para medir su rendimiento.</li>
        <li>Clics en nuestras páginas de links, contados de forma agregada, sin identificar personas.</li>
      </ul>
      <p>No vendemos ni compartimos datos con terceros. Los tokens de acceso se guardan cifrados en nuestro servidor.</p>
      <h2>Eliminación de datos</h2>
      <p>
        Para pedir que borremos cualquier dato relacionado con vos, escribinos{contact ? ' a ' : ' por los medios de contacto de nuestras páginas'}
        {contact && <a href={`mailto:${contact}`}>{contact}</a>} con el asunto &quot;Eliminación de datos&quot;. Respondemos y eliminamos los datos dentro de los 30 días.
      </p>
      <h2>Cambios</h2>
      <p>Si cambia esta política, la actualizamos en esta misma página.</p>
    </main>
  )
}
