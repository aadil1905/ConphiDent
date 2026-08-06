-- Move the original platform administrator out of the client workspace without
-- deleting the account. The move occurs only after Deepika's own owner account exists.
INSERT INTO "Clinic" ("name", "slug", "status", "brandName", "accentColor", "timezone", "createdAt", "updatedAt")
SELECT 'ANeC Platform', 'anec-platform', 'ACTIVE', 'ANeC', '#0369a1', 'Asia/Kolkata', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "User" WHERE "email" = 'aadilsayyed7383@gmail.com')
  AND NOT EXISTS (SELECT 1 FROM "Clinic" WHERE "slug" = 'anec-platform');

UPDATE "User" AS admin
SET "clinicId" = platform_clinic."id",
    "platformAdmin" = true
FROM "Clinic" AS platform_clinic
WHERE admin."email" = 'aadilsayyed7383@gmail.com'
  AND platform_clinic."slug" = 'anec-platform'
  AND admin."clinicId" <> platform_clinic."id"
  AND EXISTS (
    SELECT 1
    FROM "User" AS deepika_owner
    WHERE deepika_owner."clinicId" = admin."clinicId"
      AND deepika_owner."email" = 'drdeepikamandot@gmail.com'
      AND deepika_owner."role" = 'OWNER'
  );
