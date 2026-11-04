-- Reels con modelos de video y radar de tendencias.
ALTER TYPE "AssetKind" ADD VALUE 'CLIP';

ALTER TABLE "App" ADD COLUMN "videoModel" TEXT;
ALTER TABLE "App" ADD COLUMN "useTrends" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "Trend" (
    "id" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "howTo" TEXT NOT NULL,
    "example" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'emerging',
    "momentum" INTEGER NOT NULL DEFAULT 50,
    "brandSafe" BOOLEAN NOT NULL DEFAULT true,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Trend_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Trend_market_key_key" ON "Trend"("market", "key");
CREATE INDEX "Trend_market_stage_idx" ON "Trend"("market", "stage");

CREATE TABLE "TrendSnapshot" (
    "id" TEXT NOT NULL,
    "trendId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "momentum" INTEGER NOT NULL,
    "stage" TEXT NOT NULL,
    "rank" INTEGER,
    "evidence" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrendSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TrendSnapshot_trendId_at_idx" ON "TrendSnapshot"("trendId", "at");
ALTER TABLE "TrendSnapshot" ADD CONSTRAINT "TrendSnapshot_trendId_fkey" FOREIGN KEY ("trendId") REFERENCES "Trend"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AlgoNote" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source" TEXT,
    "observedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AlgoNote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AlgoNote_key_key" ON "AlgoNote"("key");

ALTER TABLE "Post" ADD COLUMN "trendId" TEXT;
ALTER TABLE "Post" ADD CONSTRAINT "Post_trendId_fkey" FOREIGN KEY ("trendId") REFERENCES "Trend"("id") ON DELETE SET NULL ON UPDATE CASCADE;
