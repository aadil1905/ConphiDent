-- The printed pads carry a masthead that no existing column describes: the
-- possessive above the name, the descriptor under it, and the principal
-- dentist's own block on the right of the rule.
ALTER TABLE "Clinic" ADD COLUMN "letterheadPrefix" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "letterheadName" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "tagline" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "principalName" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "principalCredentials" TEXT;

-- Gold is the document accent of the ConphiDent stationery, replacing the blue
-- carried over from the first tenant setup. Only clinics still sitting on that
-- old default are moved; a clinic that picked its own colour keeps it.
ALTER TABLE "Clinic" ALTER COLUMN "accentColor" SET DEFAULT '#b68235';
UPDATE "Clinic" SET "accentColor" = '#b68235' WHERE "accentColor" = '#0369a1';

-- Values are only supplied where the profile is blank, matching the earlier
-- Deepika brand seed.
UPDATE "Clinic"
SET
  "letterheadPrefix" = COALESCE(NULLIF("letterheadPrefix", ''), 'Dr. Deepika''s'),
  "letterheadName" = COALESCE(NULLIF("letterheadName", ''), 'Dental White'),
  "tagline" = COALESCE(NULLIF("tagline", ''), 'Complete Family Oral Care & Implant Center'),
  "principalName" = COALESCE(NULLIF("principalName", ''), 'Dr. Deepika Jain Mandot'),
  "principalCredentials" = COALESCE(NULLIF("principalCredentials", ''), E'BDS (Dental Surgeon)\nGDC (Aurangabad)'),
  "registrationNumber" = COALESCE(NULLIF("registrationNumber", ''), 'A-19182')
WHERE "id" = 1;
