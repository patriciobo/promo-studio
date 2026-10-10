-- Gemini 3.5 Flash subió a US$ 1,50/9 por millón y cortaba las respuestas: pasa a Claude Haiku 5.5.
ALTER TABLE "App" ALTER COLUMN "textModel" SET DEFAULT 'anthropic/claude-haiku-5.5';
ALTER TABLE "BrandProject" ALTER COLUMN "textModel" SET DEFAULT 'anthropic/claude-haiku-5.5';
UPDATE "App" SET "textModel" = 'anthropic/claude-haiku-5.5' WHERE "textModel" IN ('google/gemini-3.5-flash', 'google/gemini-3.5-flash-lite', 'openai/gpt-5-mini');
UPDATE "BrandProject" SET "textModel" = 'anthropic/claude-haiku-5.5' WHERE "textModel" IN ('google/gemini-3.5-flash', 'google/gemini-3.5-flash-lite', 'openai/gpt-5-mini');
