ALTER TABLE "Clinic"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "brandName" TEXT,
  ADD COLUMN "logoUrl" TEXT,
  ADD COLUMN "accentColor" TEXT NOT NULL DEFAULT '#0369a1';

ALTER TABLE "User" ADD COLUMN "platformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- The existing production deployment is Deepika Dental White: preserve it as
-- Client #1 and give it a stable workspace identifier during the SaaS upgrade.
UPDATE "Clinic" SET "slug" = 'deepika-dental-white' WHERE "slug" IS NULL AND "id" = 1;

CREATE UNIQUE INDEX "Clinic_slug_key" ON "Clinic"("slug");
CREATE INDEX "Clinic_status_createdAt_idx" ON "Clinic"("status", "createdAt");
