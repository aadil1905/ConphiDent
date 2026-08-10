-- Backward-compatible platform configuration foundation. No existing tenant data is deleted.
CREATE TABLE "ClinicLocation" (
  "id" SERIAL NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "city" TEXT,
  "state" TEXT,
  "postalCode" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "timezone" TEXT,
  "mapUrl" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClinicLocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClinicLocation_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ClinicLocationHours" (
  "id" SERIAL NOT NULL,
  "locationId" INTEGER NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "openTime" TEXT NOT NULL DEFAULT '09:00',
  "closeTime" TEXT NOT NULL DEFAULT '18:00',
  "slotMinutes" INTEGER NOT NULL DEFAULT 30,
  "isClosed" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ClinicLocationHours_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClinicLocationHours_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "ClinicLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ClinicLocationProvider" (
  "locationId" INTEGER NOT NULL,
  "providerId" INTEGER NOT NULL,
  CONSTRAINT "ClinicLocationProvider_pkey" PRIMARY KEY ("locationId", "providerId"),
  CONSTRAINT "ClinicLocationProvider_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "ClinicLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClinicLocationProvider_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ClinicProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ClinicLocationService" (
  "locationId" INTEGER NOT NULL,
  "serviceId" INTEGER NOT NULL,
  CONSTRAINT "ClinicLocationService_pkey" PRIMARY KEY ("locationId", "serviceId"),
  CONSTRAINT "ClinicLocationService_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "ClinicLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClinicLocationService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ClinicService"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ClinicMediaAsset" (
  "id" TEXT NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "publicUrl" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "originalName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClinicMediaAsset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClinicMediaAsset_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SubscriptionPlan" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenantSubscription" (
  "id" SERIAL NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "planId" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'TRIAL',
  "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
  "price" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "trialEndsAt" TIMESTAMP(3),
  "renewsAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "internalNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantSubscription_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TenantSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "TenantFeatureEntitlement" (
  "id" SERIAL NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "featureKey" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "source" TEXT NOT NULL DEFAULT 'PLATFORM_OVERRIDE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantFeatureEntitlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantFeatureEntitlement_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Every existing clinic gets a primary location that mirrors its existing identity.
INSERT INTO "ClinicLocation" ("clinicId", "name", "address", "phone", "email", "timezone", "isPrimary", "createdAt", "updatedAt")
SELECT "id", COALESCE(NULLIF("brandName", ''), "name"), "address", "phone", "email", "timezone", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Clinic";

-- Preserve existing clinic-level weekly hours as the primary location's first shift.
INSERT INTO "ClinicLocationHours" ("locationId", "dayOfWeek", "openTime", "closeTime", "slotMinutes", "isClosed", "sortOrder")
SELECT location."id", hours."dayOfWeek", hours."openTime", hours."closeTime", hours."slotMinutes", hours."isClosed", 0
FROM "ClinicHours" hours
JOIN "ClinicLocation" location ON location."clinicId" = hours."clinicId" AND location."isPrimary" = true;

-- Existing active services and providers remain available at the default branch.
INSERT INTO "ClinicLocationService" ("locationId", "serviceId")
SELECT location."id", service."id"
FROM "ClinicService" service
JOIN "ClinicLocation" location ON location."clinicId" = service."clinicId" AND location."isPrimary" = true;

INSERT INTO "ClinicLocationProvider" ("locationId", "providerId")
SELECT location."id", provider."id"
FROM "ClinicProvider" provider
JOIN "ClinicLocation" location ON location."clinicId" = provider."clinicId" AND location."isPrimary" = true;

CREATE UNIQUE INDEX "ClinicLocation_clinicId_name_key" ON "ClinicLocation"("clinicId", "name");
CREATE INDEX "ClinicLocation_clinicId_active_isPrimary_idx" ON "ClinicLocation"("clinicId", "active", "isPrimary");
CREATE UNIQUE INDEX "ClinicLocation_one_primary_per_clinic" ON "ClinicLocation"("clinicId") WHERE "isPrimary" = true;
CREATE UNIQUE INDEX "ClinicLocationHours_locationId_dayOfWeek_sortOrder_key" ON "ClinicLocationHours"("locationId", "dayOfWeek", "sortOrder");
CREATE INDEX "ClinicLocationHours_locationId_dayOfWeek_idx" ON "ClinicLocationHours"("locationId", "dayOfWeek");
CREATE INDEX "ClinicLocationProvider_providerId_idx" ON "ClinicLocationProvider"("providerId");
CREATE INDEX "ClinicLocationService_serviceId_idx" ON "ClinicLocationService"("serviceId");
CREATE UNIQUE INDEX "ClinicMediaAsset_storageKey_key" ON "ClinicMediaAsset"("storageKey");
CREATE INDEX "ClinicMediaAsset_clinicId_kind_createdAt_idx" ON "ClinicMediaAsset"("clinicId", "kind", "createdAt");
CREATE UNIQUE INDEX "SubscriptionPlan_name_key" ON "SubscriptionPlan"("name");
CREATE UNIQUE INDEX "SubscriptionPlan_code_key" ON "SubscriptionPlan"("code");
CREATE UNIQUE INDEX "TenantSubscription_clinicId_key" ON "TenantSubscription"("clinicId");
CREATE INDEX "TenantSubscription_status_renewsAt_idx" ON "TenantSubscription"("status", "renewsAt");
CREATE INDEX "TenantSubscription_planId_status_idx" ON "TenantSubscription"("planId", "status");
CREATE UNIQUE INDEX "TenantFeatureEntitlement_clinicId_featureKey_key" ON "TenantFeatureEntitlement"("clinicId", "featureKey");
CREATE INDEX "TenantFeatureEntitlement_featureKey_enabled_idx" ON "TenantFeatureEntitlement"("featureKey", "enabled");
