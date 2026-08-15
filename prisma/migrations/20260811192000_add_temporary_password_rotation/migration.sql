-- Provisioned credentials are temporary and must be rotated at first sign-in.
ALTER TABLE "User"
ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
