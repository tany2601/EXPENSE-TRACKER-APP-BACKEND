/*
  Fix: adding NOT NULL updatedAt on non-empty tables must be done in 3 steps:
  1) add nullable column
  2) backfill
  3) set NOT NULL + default
*/

-- =========================
-- Category
-- =========================

ALTER TABLE "public"."Category"
  ADD COLUMN "clientUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedByDeviceId" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3);

-- backfill existing rows
UPDATE "public"."Category"
SET "updatedAt" = NOW()
WHERE "updatedAt" IS NULL;

-- make required + default for future
ALTER TABLE "public"."Category"
  ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "public"."Category"
  ALTER COLUMN "updatedAt" SET DEFAULT NOW();


-- =========================
-- Contact
-- =========================

ALTER TABLE "public"."Contact"
  ADD COLUMN "clientUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedByDeviceId" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3);

-- backfill existing rows
UPDATE "public"."Contact"
SET "updatedAt" = NOW()
WHERE "updatedAt" IS NULL;

-- make required + default for future
ALTER TABLE "public"."Contact"
  ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "public"."Contact"
  ALTER COLUMN "updatedAt" SET DEFAULT NOW();
