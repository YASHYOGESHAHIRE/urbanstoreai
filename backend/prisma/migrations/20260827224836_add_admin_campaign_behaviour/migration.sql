-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "productId" TEXT,
    "title" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "proposedAction" JSONB NOT NULL,
    "reasoning" JSONB NOT NULL,
    "projections" JSONB NOT NULL,
    "risks" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "approvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_behaviours" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionKey" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "productId" TEXT,
    "categoryId" TEXT,
    "query" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_behaviours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "campaigns_type_idx" ON "campaigns"("type");

-- CreateIndex
CREATE INDEX "user_behaviours_userId_idx" ON "user_behaviours"("userId");

-- CreateIndex
CREATE INDEX "user_behaviours_event_idx" ON "user_behaviours"("event");

-- CreateIndex
CREATE INDEX "user_behaviours_productId_idx" ON "user_behaviours"("productId");

-- CreateIndex
CREATE INDEX "user_behaviours_createdAt_idx" ON "user_behaviours"("createdAt");
