-- Modelos de imagen retirados del catálogo: las apps que los usaban pasan al más parecido.
UPDATE "App" SET "imageModel" = 'openai/gpt-image-2.5-sunburst' WHERE "imageModel" = 'openai/gpt-image-2.5-flare';
UPDATE "App" SET "imageModel" = 'openai/gpt-image-2.5-sunburst', "imageQuality" = 'medium' WHERE "imageModel" = 'bytedance-seed/seedream-5-0-lite';
UPDATE "App" SET "imageModel" = 'recraft/recraft-v4.1-flash', "imageQuality" = NULL WHERE "imageModel" = 'recraft/recraft-v4.1';
