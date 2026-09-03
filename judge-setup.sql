-- ─── Judge account setup ─────────────────────────────────────────────────────
-- Run this in Supabase SQL Editor
-- Password: Judge@2024
-- Hash generated with bcryptjs cost 12

-- Step 1: Add isReadOnlyAdmin column if not already present
ALTER TABLE users ADD COLUMN IF NOT EXISTS "isReadOnlyAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Step 2: Remove any previous failed inserts
DELETE FROM users WHERE email = 'judge@urbanstore.demo';

-- Step 3: Insert judge account with correct bcryptjs hash
INSERT INTO users (id, name, email, "passwordHash", "isAdmin", "isReadOnlyAdmin", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'Hackathon Judge',
  'judge@urbanstore.demo',
  '$2a$12$hv6flQHAwjX1hvPBQVrKzekwqTOYcZtFWD6pfktSFDImbrJ15JC6q',
  true,
  true,
  now(),
  now()
);

-- Verify
SELECT id, name, email, "isAdmin", "isReadOnlyAdmin", "createdAt"
FROM users
WHERE email = 'judge@urbanstore.demo';
