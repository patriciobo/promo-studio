ALTER TABLE "Batch" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'WEEK';
DROP INDEX "Batch_appId_weekStart_key";
CREATE UNIQUE INDEX "Batch_appId_weekStart_kind_key" ON "Batch"("appId", "weekStart", "kind");
