-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "dailyDate" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Post_appId_dailyDate_type_key" ON "Post"("appId", "dailyDate", "type");
