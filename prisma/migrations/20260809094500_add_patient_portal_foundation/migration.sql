-- Patient portal access is deliberately prepared-only until a verified OTP delivery channel is enabled.
CREATE TABLE "PatientPortalAccess" (
  "id" TEXT NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "patientId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PREPARED',
  "deliveryChannel" TEXT,
  "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt" TIMESTAMP(3),
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PatientPortalAccess_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PatientPortalAccess_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PatientPortalAccess_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PatientPortalAccess_patientId_key" ON "PatientPortalAccess"("patientId");
CREATE INDEX "PatientPortalAccess_clinicId_status_idx" ON "PatientPortalAccess"("clinicId", "status");
