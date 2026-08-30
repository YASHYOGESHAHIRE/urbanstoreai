-- CreateTable
CREATE TABLE "oauth_clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "redirectUris" TEXT[],
    "scopes" TEXT[],
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_auth_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopes" TEXT[],
    "redirectUri" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_auth_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_grants" (
    "id" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_clients_clientId_key" ON "oauth_clients"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_auth_codes_code_key" ON "oauth_auth_codes"("code");

-- CreateIndex
CREATE INDEX "oauth_auth_codes_code_idx" ON "oauth_auth_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_grants_accessToken_key" ON "oauth_grants"("accessToken");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_grants_refreshToken_key" ON "oauth_grants"("refreshToken");

-- CreateIndex
CREATE INDEX "oauth_grants_accessToken_idx" ON "oauth_grants"("accessToken");

-- CreateIndex
CREATE INDEX "oauth_grants_refreshToken_idx" ON "oauth_grants"("refreshToken");

-- CreateIndex
CREATE INDEX "oauth_grants_userId_idx" ON "oauth_grants"("userId");

-- AddForeignKey
ALTER TABLE "oauth_auth_codes" ADD CONSTRAINT "oauth_auth_codes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauth_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_grants" ADD CONSTRAINT "oauth_grants_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauth_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_grants" ADD CONSTRAINT "oauth_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
