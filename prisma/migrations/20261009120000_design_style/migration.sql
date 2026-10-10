-- Estilo de diseño de las piezas (src/lib/styles.ts). null = clásico.
ALTER TABLE "App" ADD COLUMN "designStyle" TEXT;
ALTER TABLE "App" ADD COLUMN "styleSuggestions" JSONB;
