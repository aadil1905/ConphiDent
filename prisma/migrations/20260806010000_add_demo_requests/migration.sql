CREATE TABLE "DemoRequest" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "clinicName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "doctorCount" TEXT NOT NULL,
  "preferredTime" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DemoRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DemoRequest_createdAt_idx" ON "DemoRequest"("createdAt");
CREATE INDEX "DemoRequest_email_idx" ON "DemoRequest"("email");
