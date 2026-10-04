-- AlterTable
ALTER TABLE "AppImage" ADD COLUMN     "flowId" TEXT,
ADD COLUMN     "sha" TEXT,
ADD COLUMN     "step" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "AppImage_appId_flowId_step_key" ON "AppImage"("appId", "flowId", "step");
