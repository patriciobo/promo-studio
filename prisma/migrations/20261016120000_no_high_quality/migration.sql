-- La calidad alta deja de ofrecerse: las apps que la tenían pasan a media.
UPDATE "App" SET "imageQuality" = 'medium' WHERE "imageQuality" = 'high';
