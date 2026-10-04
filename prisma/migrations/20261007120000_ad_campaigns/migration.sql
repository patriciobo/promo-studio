-- AlterTable
ALTER TABLE "App" ADD COLUMN     "adMonthlyBudget" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "adOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "budgetType" TEXT NOT NULL DEFAULT 'LIFETIME',
    "budget" INTEGER NOT NULL,
    "currency" TEXT,
    "spendCap" INTEGER,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "targeting" JSONB NOT NULL,
    "placements" TEXT NOT NULL DEFAULT 'instagram',
    "cta" TEXT NOT NULL DEFAULT 'LEARN_MORE',
    "link" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "effectiveStatus" TEXT,
    "campaignId" TEXT,
    "adSetId" TEXT,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "metrics" JSONB,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ad" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "creativeId" TEXT,
    "adId" TEXT,
    "effectiveStatus" TEXT,
    "issues" TEXT,
    "error" TEXT,
    "metrics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdCampaign_status_idx" ON "AdCampaign"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Ad_campaignId_postId_key" ON "Ad"("campaignId", "postId");

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Pasar los anuncios existentes (1 post = 1 campaña con presupuesto diario) al modelo nuevo
INSERT INTO "AdCampaign" ("id", "appId", "name", "objective", "budgetType", "budget", "startAt", "endAt", "targeting", "status", "campaignId", "adSetId", "error", "metrics", "createdAt", "updatedAt")
SELECT d."id", d."appId", COALESCE(LEFT(p."hook", 60), 'Anuncio'),
       CASE d."objective" WHEN 'OUTCOME_AWARENESS' THEN 'AWARENESS' ELSE 'TRAFFIC' END,
       'DAILY', d."dailyBudget", d."createdAt", d."createdAt" + make_interval(days => d."days"), '{}'::jsonb,
       CASE WHEN d."campaignId" IS NULL THEN 'DRAFT' ELSE d."status" END,
       d."campaignId", d."adSetId", d."error", d."metrics", d."createdAt", d."updatedAt"
FROM "AdDraft" d JOIN "Post" p ON p."id" = d."postId";

INSERT INTO "Ad" ("id", "campaignId", "postId", "creativeId", "adId", "metrics", "createdAt")
SELECT d."id" || '-ad', d."id", d."postId", d."creativeId", d."adId", d."metrics", d."createdAt" FROM "AdDraft" d;

-- DropTable
DROP TABLE "AdDraft";
