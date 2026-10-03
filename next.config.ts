import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Las imágenes subidas (biblioteca, Crear ahora, Generar semana) viajan en el formulario: hasta 8 MB cada una.
  experimental: {
    serverActions: {
      bodySizeLimit: "40mb",
    },
  },
};

export default nextConfig;
