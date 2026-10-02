-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('PLANNING', 'GENERATING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('IMAGE', 'CAROUSEL', 'REEL', 'STORY');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('BACKGROUND', 'SLIDE', 'VIDEO');

-- CreateTable
CREATE TABLE "App" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "manifestPath" TEXT NOT NULL DEFAULT 'promo.yaml',
    "manifest" JSONB,
    "manifestHash" TEXT,
    "manifestError" TEXT,
    "syncedAt" TIMESTAMP(3),
    "pageId" TEXT,
    "igUserId" TEXT,
    "igUsername" TEXT,
    "adAccountId" TEXT,
    "textModel" TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
    "imageModel" TEXT,
    "monthlyBudgetUsd" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "postTime" TEXT NOT NULL DEFAULT '10:00',
    "autoApproveHours" INTEGER NOT NULL DEFAULT 48,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "App_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'PLANNING',
    "error" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "batchId" TEXT,
    "type" "PostType" NOT NULL,
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "pillar" TEXT,
    "hook" TEXT,
    "caption" TEXT NOT NULL DEFAULT '',
    "altText" TEXT,
    "slides" JSONB,
    "imagePrompt" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "reviewDueAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "igMediaId" TEXT,
    "permalink" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "score" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "path" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "prompt" TEXT,
    "model" TEXT,
    "costUsd" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightSnapshot" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "hoursAfter" INTEGER NOT NULL,
    "reach" INTEGER,
    "views" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "saves" INTEGER,
    "shares" INTEGER,
    "profileVisits" INTEGER,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsightSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdDraft" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "dailyBudget" INTEGER NOT NULL,
    "days" INTEGER NOT NULL,
    "campaignId" TEXT,
    "adSetId" TEXT,
    "creativeId" TEXT,
    "adId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PAUSED',
    "error" TEXT,
    "metrics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageLedger" (
    "id" TEXT NOT NULL,
    "appId" TEXT,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "tokens" INTEGER,
    "purpose" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkHit" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkHit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "App_slug_key" ON "App"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_appId_weekStart_key" ON "Batch"("appId", "weekStart");

-- CreateIndex
CREATE INDEX "Post_status_scheduledAt_idx" ON "Post"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "InsightSnapshot_postId_hoursAfter_key" ON "InsightSnapshot"("postId", "hoursAfter");

-- CreateIndex
CREATE UNIQUE INDEX "AdDraft_postId_key" ON "AdDraft"("postId");

-- CreateIndex
CREATE INDEX "UsageLedger_appId_createdAt_idx" ON "UsageLedger"("appId", "createdAt");

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightSnapshot" ADD CONSTRAINT "InsightSnapshot_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdDraft" ADD CONSTRAINT "AdDraft_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdDraft" ADD CONSTRAINT "AdDraft_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageLedger" ADD CONSTRAINT "UsageLedger_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkHit" ADD CONSTRAINT "LinkHit_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;
