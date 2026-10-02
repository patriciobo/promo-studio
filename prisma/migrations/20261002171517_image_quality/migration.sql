-- AlterTable
ALTER TABLE "App" ADD COLUMN     "imageQuality" TEXT,
ALTER COLUMN "textModel" SET DEFAULT 'google/gemini-3.5-flash',
ALTER COLUMN "monthlyBudgetUsd" SET DEFAULT 7;
