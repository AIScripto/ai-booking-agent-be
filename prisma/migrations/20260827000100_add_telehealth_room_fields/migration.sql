-- Persist the telehealth room for an appointment.
--
-- All four columns are nullable with no default and no backfill, so this is a
-- metadata-only change in PostgreSQL — no table rewrite. The unique index on
-- join_token is safe alongside existing rows because PostgreSQL treats NULLs as
-- distinct. Reversible with DROP COLUMN.

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "join_token" TEXT,
ADD COLUMN     "meeting_expires_at" TIMESTAMP(3),
ADD COLUMN     "meeting_provider" TEXT,
ADD COLUMN     "meeting_url" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "appointments_join_token_key" ON "appointments"("join_token");

