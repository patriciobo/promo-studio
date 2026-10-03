-- CreateEnum
CREATE TYPE "AppImageKind" AS ENUM ('SCREENSHOT', 'PHOTO');

-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "imageIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "AppImage" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "kind" "AppImageKind" NOT NULL DEFAULT 'SCREENSHOT',
    "description" TEXT,
    "note" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppImage_appId_archived_idx" ON "AppImage"("appId", "archived");

-- AddForeignKey
ALTER TABLE "AppImage" ADD CONSTRAINT "AppImage_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;
