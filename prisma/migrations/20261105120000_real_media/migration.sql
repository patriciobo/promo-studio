-- Material real en la biblioteca: videos y archivos de bancos (Pexels, Pixabay, Wikimedia Commons).
ALTER TABLE "AppImage" ADD COLUMN "videoPath" TEXT;
ALTER TABLE "AppImage" ADD COLUMN "duration" DOUBLE PRECISION;
ALTER TABLE "AppImage" ADD COLUMN "source" TEXT;
ALTER TABLE "AppImage" ADD COLUMN "sourceId" TEXT;
ALTER TABLE "AppImage" ADD COLUMN "sourceUrl" TEXT;
ALTER TABLE "AppImage" ADD COLUMN "sourceInfo" TEXT;
ALTER TABLE "AppImage" ADD COLUMN "author" TEXT;
ALTER TABLE "AppImage" ADD COLUMN "license" TEXT;
ALTER TABLE "AppImage" ADD COLUMN "credit" TEXT;
CREATE UNIQUE INDEX "AppImage_appId_source_sourceId_key" ON "AppImage"("appId", "source", "sourceId");
