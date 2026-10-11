import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Las imágenes subidas (biblioteca, Crear ahora, Generar semana) viajan en el formulario. El navegador las achica
  // antes (ImageShrinker), pero por las dudas se acepta hasta 40 MB. El proxy (src/proxy.ts) también lee el cuerpo
  // y por defecto lo corta en 10 MB: con varias fotos de celular la acción fallaba con "Unexpected end of form".
  experimental: {
    serverActions: {
      bodySizeLimit: "40mb",
    },
    proxyClientMaxBodySize: "40mb",
  },
};

export default nextConfig;
