-- AlterTable
ALTER TABLE "oauth_auth_codes" ADD COLUMN     "codeChallenge" TEXT,
ADD COLUMN     "codeChallengeMethod" TEXT;
