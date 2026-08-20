-- Preserve the intended authority of established DB-backed administrators
-- before application code begins treating null/unknown roles as read-only.
UPDATE "User"
SET "platformRole" = 'PLATFORM_OWNER'
WHERE "platformAdmin" = true
  AND "platformRole" IS NULL;
