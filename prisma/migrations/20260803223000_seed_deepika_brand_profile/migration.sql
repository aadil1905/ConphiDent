-- Preserve existing production data while completing the original clinic's tenant profile.
-- Values are only supplied where the profile is blank.
UPDATE "Clinic"
SET
  "brandName" = COALESCE(NULLIF("brandName", ''), 'Dr. Deepika''s Dental White'),
  "logoUrl" = COALESCE(NULLIF("logoUrl", ''), '/dental/dental-white-logo.png'),
  "address" = COALESCE(NULLIF("address", ''), 'Karishma Enclave, Shop No 7, Besides Abhinandan Hotel, Ajmera, Morewadi, Pimpri - 411018'),
  "phone" = COALESCE(NULLIF("phone", ''), '+91 90961 04134'),
  "email" = COALESCE(NULLIF("email", ''), 'drdeepikamandot@gmail.com')
WHERE "id" = 1;
