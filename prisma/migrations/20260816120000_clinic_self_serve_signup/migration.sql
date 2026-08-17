-- Public self-serve onboarding intake for the setup portal.
--
-- Additive only: this migration creates one new table and its indexes, and
-- touches no existing table, column or constraint. A signup provisions nothing
-- on its own — an operator converts it into a Clinic through the setup portal,
-- so a public form can never bring a tenant into existence.

CREATE TABLE "ClinicSignup" (
    "id" TEXT NOT NULL,
    "clinicName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "dentistCount" TEXT NOT NULL,
    "chairCount" TEXT NOT NULL,
    "currentSoftware" TEXT,
    "whatsappNumber" TEXT,
    "priorities" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "clinicId" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicSignup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClinicSignup_status_createdAt_idx" ON "ClinicSignup"("status", "createdAt");

CREATE INDEX "ClinicSignup_email_idx" ON "ClinicSignup"("email");
