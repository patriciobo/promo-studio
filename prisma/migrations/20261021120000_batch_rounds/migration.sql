-- Una semana se puede generar más de una vez: cada vez es una tanda nueva.
ALTER TABLE "Batch" ADD COLUMN "round" INTEGER NOT NULL DEFAULT 1;
DROP INDEX "Batch_appId_weekStart_kind_key";
CREATE UNIQUE INDEX "Batch_appId_weekStart_kind_round_key" ON "Batch"("appId", "weekStart", "kind", "round");
