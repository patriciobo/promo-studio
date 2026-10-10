CREATE TABLE "BrandProject" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "brief" JSONB NOT NULL,
    "found" JSONB,
    "elements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "textModel" TEXT NOT NULL DEFAULT 'google/gemini-3.5-flash',
    "referencePath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "error" TEXT,
    "progress" JSONB,
    "chosenId" TEXT,
    "savedOptionId" TEXT,
    "savedAt" TIMESTAMP(3),
    "savedUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BrandProject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BrandOption" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "index" INTEGER NOT NULL,
    "conceptId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "logoPath" TEXT,
    "logoModel" TEXT,
    "vectorPath" TEXT,
    "boardPath" TEXT,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BrandOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrandProject_appId_key" ON "BrandProject"("appId");
CREATE UNIQUE INDEX "BrandOption_projectId_round_index_key" ON "BrandOption"("projectId", "round", "index");
ALTER TABLE "BrandProject" ADD CONSTRAINT "BrandProject_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrandOption" ADD CONSTRAINT "BrandOption_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "BrandProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
