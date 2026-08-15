-- Phase 2 adds the governed imaging repository. Existing clinical rows are unchanged.
CREATE TABLE "ImagingSource" (
    "id" TEXT NOT NULL, "clinicId" INTEGER NOT NULL, "name" TEXT NOT NULL,
    "adapterType" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "baseUrl" TEXT, "credentialKey" TEXT, "capabilities" JSONB,
    "lastHealthAt" TIMESTAMP(3), "lastSyncAt" TIMESTAMP(3), "lastError" TEXT,
    "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ImagingSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImagingStudy" (
    "id" TEXT NOT NULL, "clinicId" INTEGER NOT NULL, "patientId" INTEGER,
    "encounterId" INTEGER, "treatmentPlanId" INTEGER, "orderingProviderId" INTEGER,
    "reviewingProviderId" INTEGER, "acquiringOperatorId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL, "sourceId" TEXT, "sourceType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE', "matchStatus" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "matchConfidence" INTEGER, "matchReason" TEXT, "modality" TEXT NOT NULL,
    "description" TEXT, "clinicalIndication" TEXT, "radiationMetadata" JSONB,
    "anatomicalRegion" TEXT, "laterality" TEXT, "toothCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "acquisitionDate" TIMESTAMP(3) NOT NULL, "accessionNumber" TEXT,
    "studyInstanceUid" TEXT, "dicomPatientId" TEXT, "externalPatientId" TEXT,
    "vendorRecordId" TEXT, "sourcePatientName" TEXT, "sourcePatientBirthDate" TIMESTAMP(3),
    "contentHash" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL,
    "numberOfSeries" INTEGER NOT NULL DEFAULT 1, "numberOfInstances" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1, "reviewedAt" TIMESTAMP(3), "signedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3), "archiveReason" TEXT, "enteredInErrorAt" TIMESTAMP(3),
    "enteredInErrorReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ImagingStudy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImagingSeries" (
    "id" TEXT NOT NULL, "clinicId" INTEGER NOT NULL, "studyId" TEXT NOT NULL,
    "seriesInstanceUid" TEXT, "seriesNumber" INTEGER, "modality" TEXT NOT NULL,
    "description" TEXT, "bodySite" TEXT, "laterality" TEXT, "startedAt" TIMESTAMP(3),
    "numberOfInstances" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImagingSeries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImagingInstance" (
    "id" TEXT NOT NULL, "clinicId" INTEGER NOT NULL, "studyId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL, "sopInstanceUid" TEXT, "sopClassUid" TEXT,
    "instanceNumber" INTEGER, "frameCount" INTEGER NOT NULL DEFAULT 1,
    "transferSyntaxUid" TEXT, "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImagingInstance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImagingAsset" (
    "id" TEXT NOT NULL, "clinicId" INTEGER NOT NULL, "studyId" TEXT NOT NULL,
    "instanceId" TEXT, "role" TEXT NOT NULL, "storageKey" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL, "contentType" TEXT NOT NULL, "sizeBytes" INTEGER NOT NULL,
    "originalName" TEXT, "sha256" TEXT NOT NULL, "width" INTEGER, "height" INTEGER,
    "scanStatus" TEXT NOT NULL DEFAULT 'BASIC_VALIDATED', "derivedFromAssetId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImagingAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImagingReport" (
    "id" TEXT NOT NULL, "clinicId" INTEGER NOT NULL, "studyId" TEXT NOT NULL,
    "authorId" INTEGER NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "findings" TEXT, "impression" TEXT, "version" INTEGER NOT NULL DEFAULT 1,
    "signedAt" TIMESTAMP(3), "correctionReason" TEXT, "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ImagingReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImagingAnnotation" (
    "id" TEXT NOT NULL, "clinicId" INTEGER NOT NULL, "studyId" TEXT NOT NULL,
    "authorId" INTEGER NOT NULL, "assetId" TEXT, "toothCode" TEXT,
    "label" TEXT NOT NULL, "geometry" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImagingAnnotation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImagingComparison" (
    "id" TEXT NOT NULL, "clinicId" INTEGER NOT NULL, "patientId" INTEGER NOT NULL,
    "encounterId" INTEGER, "baselineStudyId" TEXT NOT NULL, "followupStudyId" TEXT NOT NULL,
    "treatmentPlanId" INTEGER, "completedFindingId" INTEGER, "authorId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FINAL', "note" TEXT NOT NULL, "compatibilityNote" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImagingComparison_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImagingMatchResolution" (
    "id" TEXT NOT NULL, "clinicId" INTEGER NOT NULL, "studyId" TEXT NOT NULL,
    "patientId" INTEGER NOT NULL, "resolvedById" INTEGER NOT NULL, "decision" TEXT NOT NULL,
    "signals" JSONB NOT NULL, "conflictingFields" JSONB, "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImagingMatchResolution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImagingIngestEvent" (
    "id" TEXT NOT NULL, "clinicId" INTEGER NOT NULL, "sourceId" TEXT, "studyId" TEXT,
    "createdById" INTEGER, "idempotencyKey" TEXT NOT NULL, "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED', "attempts" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT, "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3), CONSTRAINT "ImagingIngestEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImagingProcessingJob" (
    "id" TEXT NOT NULL, "clinicId" INTEGER NOT NULL, "studyId" TEXT NOT NULL,
    "jobType" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5, "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ImagingProcessingJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImagingSource_clinicId_adapterType_status_idx" ON "ImagingSource"("clinicId", "adapterType", "status");
CREATE UNIQUE INDEX "ImagingSource_clinicId_name_key" ON "ImagingSource"("clinicId", "name");
CREATE INDEX "ImagingStudy_clinicId_status_acquisitionDate_idx" ON "ImagingStudy"("clinicId", "status", "acquisitionDate");
CREATE INDEX "ImagingStudy_clinicId_matchStatus_createdAt_idx" ON "ImagingStudy"("clinicId", "matchStatus", "createdAt");
CREATE INDEX "ImagingStudy_clinicId_patientId_acquisitionDate_idx" ON "ImagingStudy"("clinicId", "patientId", "acquisitionDate");
CREATE INDEX "ImagingStudy_encounterId_acquisitionDate_idx" ON "ImagingStudy"("encounterId", "acquisitionDate");
CREATE INDEX "ImagingStudy_treatmentPlanId_idx" ON "ImagingStudy"("treatmentPlanId");
CREATE UNIQUE INDEX "ImagingStudy_clinicId_idempotencyKey_key" ON "ImagingStudy"("clinicId", "idempotencyKey");
CREATE UNIQUE INDEX "ImagingStudy_clinicId_contentHash_key" ON "ImagingStudy"("clinicId", "contentHash");
CREATE UNIQUE INDEX "ImagingStudy_clinicId_studyInstanceUid_key" ON "ImagingStudy"("clinicId", "studyInstanceUid");
CREATE INDEX "ImagingSeries_clinicId_modality_startedAt_idx" ON "ImagingSeries"("clinicId", "modality", "startedAt");
CREATE INDEX "ImagingSeries_studyId_seriesNumber_idx" ON "ImagingSeries"("studyId", "seriesNumber");
CREATE UNIQUE INDEX "ImagingSeries_studyId_seriesInstanceUid_key" ON "ImagingSeries"("studyId", "seriesInstanceUid");
CREATE INDEX "ImagingInstance_seriesId_instanceNumber_idx" ON "ImagingInstance"("seriesId", "instanceNumber");
CREATE INDEX "ImagingInstance_studyId_idx" ON "ImagingInstance"("studyId");
CREATE UNIQUE INDEX "ImagingInstance_clinicId_sopInstanceUid_key" ON "ImagingInstance"("clinicId", "sopInstanceUid");
CREATE UNIQUE INDEX "ImagingInstance_clinicId_contentHash_key" ON "ImagingInstance"("clinicId", "contentHash");
CREATE UNIQUE INDEX "ImagingAsset_storageKey_key" ON "ImagingAsset"("storageKey");
CREATE INDEX "ImagingAsset_clinicId_studyId_role_idx" ON "ImagingAsset"("clinicId", "studyId", "role");
CREATE INDEX "ImagingAsset_instanceId_idx" ON "ImagingAsset"("instanceId");
CREATE INDEX "ImagingAsset_derivedFromAssetId_idx" ON "ImagingAsset"("derivedFromAssetId");
CREATE UNIQUE INDEX "ImagingAsset_studyId_role_version_key" ON "ImagingAsset"("studyId", "role", "version");
CREATE INDEX "ImagingReport_clinicId_status_createdAt_idx" ON "ImagingReport"("clinicId", "status", "createdAt");
CREATE INDEX "ImagingReport_supersedesId_idx" ON "ImagingReport"("supersedesId");
CREATE UNIQUE INDEX "ImagingReport_studyId_version_key" ON "ImagingReport"("studyId", "version");
CREATE INDEX "ImagingAnnotation_clinicId_studyId_status_idx" ON "ImagingAnnotation"("clinicId", "studyId", "status");
CREATE INDEX "ImagingAnnotation_toothCode_idx" ON "ImagingAnnotation"("toothCode");
CREATE INDEX "ImagingAnnotation_assetId_idx" ON "ImagingAnnotation"("assetId");
CREATE INDEX "ImagingComparison_clinicId_patientId_createdAt_idx" ON "ImagingComparison"("clinicId", "patientId", "createdAt");
CREATE INDEX "ImagingComparison_encounterId_idx" ON "ImagingComparison"("encounterId");
CREATE INDEX "ImagingComparison_treatmentPlanId_idx" ON "ImagingComparison"("treatmentPlanId");
CREATE UNIQUE INDEX "ImagingComparison_clinicId_baselineStudyId_followupStudyId_key" ON "ImagingComparison"("clinicId", "baselineStudyId", "followupStudyId");
CREATE INDEX "ImagingMatchResolution_clinicId_studyId_createdAt_idx" ON "ImagingMatchResolution"("clinicId", "studyId", "createdAt");
CREATE INDEX "ImagingMatchResolution_patientId_createdAt_idx" ON "ImagingMatchResolution"("patientId", "createdAt");
CREATE INDEX "ImagingIngestEvent_clinicId_status_receivedAt_idx" ON "ImagingIngestEvent"("clinicId", "status", "receivedAt");
CREATE UNIQUE INDEX "ImagingIngestEvent_clinicId_idempotencyKey_key" ON "ImagingIngestEvent"("clinicId", "idempotencyKey");
CREATE INDEX "ImagingProcessingJob_clinicId_status_availableAt_idx" ON "ImagingProcessingJob"("clinicId", "status", "availableAt");
CREATE INDEX "ImagingProcessingJob_studyId_status_idx" ON "ImagingProcessingJob"("studyId", "status");
CREATE UNIQUE INDEX "ImagingProcessingJob_clinicId_idempotencyKey_key" ON "ImagingProcessingJob"("clinicId", "idempotencyKey");

ALTER TABLE "ImagingSource" ADD CONSTRAINT "ImagingSource_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingStudy" ADD CONSTRAINT "ImagingStudy_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingStudy" ADD CONSTRAINT "ImagingStudy_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingStudy" ADD CONSTRAINT "ImagingStudy_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImagingStudy" ADD CONSTRAINT "ImagingStudy_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "TreatmentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImagingStudy" ADD CONSTRAINT "ImagingStudy_orderingProviderId_fkey" FOREIGN KEY ("orderingProviderId") REFERENCES "ClinicProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImagingStudy" ADD CONSTRAINT "ImagingStudy_reviewingProviderId_fkey" FOREIGN KEY ("reviewingProviderId") REFERENCES "ClinicProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImagingStudy" ADD CONSTRAINT "ImagingStudy_acquiringOperatorId_fkey" FOREIGN KEY ("acquiringOperatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingStudy" ADD CONSTRAINT "ImagingStudy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingStudy" ADD CONSTRAINT "ImagingStudy_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ImagingSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImagingSeries" ADD CONSTRAINT "ImagingSeries_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingSeries" ADD CONSTRAINT "ImagingSeries_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "ImagingStudy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingInstance" ADD CONSTRAINT "ImagingInstance_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingInstance" ADD CONSTRAINT "ImagingInstance_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "ImagingStudy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingInstance" ADD CONSTRAINT "ImagingInstance_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "ImagingSeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingAsset" ADD CONSTRAINT "ImagingAsset_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingAsset" ADD CONSTRAINT "ImagingAsset_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "ImagingStudy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingAsset" ADD CONSTRAINT "ImagingAsset_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ImagingInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImagingAsset" ADD CONSTRAINT "ImagingAsset_derivedFromAssetId_fkey" FOREIGN KEY ("derivedFromAssetId") REFERENCES "ImagingAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImagingReport" ADD CONSTRAINT "ImagingReport_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingReport" ADD CONSTRAINT "ImagingReport_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "ImagingStudy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingReport" ADD CONSTRAINT "ImagingReport_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingReport" ADD CONSTRAINT "ImagingReport_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "ImagingReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImagingAnnotation" ADD CONSTRAINT "ImagingAnnotation_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingAnnotation" ADD CONSTRAINT "ImagingAnnotation_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "ImagingStudy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingAnnotation" ADD CONSTRAINT "ImagingAnnotation_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingAnnotation" ADD CONSTRAINT "ImagingAnnotation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "ImagingAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImagingComparison" ADD CONSTRAINT "ImagingComparison_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingComparison" ADD CONSTRAINT "ImagingComparison_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingComparison" ADD CONSTRAINT "ImagingComparison_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImagingComparison" ADD CONSTRAINT "ImagingComparison_baselineStudyId_fkey" FOREIGN KEY ("baselineStudyId") REFERENCES "ImagingStudy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingComparison" ADD CONSTRAINT "ImagingComparison_followupStudyId_fkey" FOREIGN KEY ("followupStudyId") REFERENCES "ImagingStudy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingComparison" ADD CONSTRAINT "ImagingComparison_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "TreatmentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImagingComparison" ADD CONSTRAINT "ImagingComparison_completedFindingId_fkey" FOREIGN KEY ("completedFindingId") REFERENCES "DentalFinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImagingComparison" ADD CONSTRAINT "ImagingComparison_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingMatchResolution" ADD CONSTRAINT "ImagingMatchResolution_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingMatchResolution" ADD CONSTRAINT "ImagingMatchResolution_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "ImagingStudy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingMatchResolution" ADD CONSTRAINT "ImagingMatchResolution_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingMatchResolution" ADD CONSTRAINT "ImagingMatchResolution_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingIngestEvent" ADD CONSTRAINT "ImagingIngestEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingIngestEvent" ADD CONSTRAINT "ImagingIngestEvent_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ImagingSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImagingIngestEvent" ADD CONSTRAINT "ImagingIngestEvent_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "ImagingStudy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImagingIngestEvent" ADD CONSTRAINT "ImagingIngestEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImagingProcessingJob" ADD CONSTRAINT "ImagingProcessingJob_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingProcessingJob" ADD CONSTRAINT "ImagingProcessingJob_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "ImagingStudy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
