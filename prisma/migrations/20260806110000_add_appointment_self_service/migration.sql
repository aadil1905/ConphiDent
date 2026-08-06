CREATE TABLE "AppointmentSelfServiceRequest" (
  "id" SERIAL NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "appointmentId" INTEGER NOT NULL,
  "token" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "openedAt" TIMESTAMP(3),
  "respondedAt" TIMESTAMP(3),
  "requestedTime" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppointmentSelfServiceRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppointmentSelfServiceRequest_token_key" ON "AppointmentSelfServiceRequest"("token");
CREATE INDEX "AppointmentSelfServiceRequest_clinicId_status_expiresAt_idx" ON "AppointmentSelfServiceRequest"("clinicId", "status", "expiresAt");
CREATE INDEX "AppointmentSelfServiceRequest_appointmentId_createdAt_idx" ON "AppointmentSelfServiceRequest"("appointmentId", "createdAt");
CREATE INDEX "AppointmentSelfServiceRequest_expiresAt_idx" ON "AppointmentSelfServiceRequest"("expiresAt");

ALTER TABLE "AppointmentSelfServiceRequest" ADD CONSTRAINT "AppointmentSelfServiceRequest_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentSelfServiceRequest" ADD CONSTRAINT "AppointmentSelfServiceRequest_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
