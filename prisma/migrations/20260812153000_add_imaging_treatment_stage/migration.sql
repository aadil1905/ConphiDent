ALTER TABLE "ImagingStudy" ADD COLUMN "treatmentStage" TEXT;

CREATE INDEX "ImagingStudy_clinicId_patientId_treatmentStage_idx"
ON "ImagingStudy"("clinicId", "patientId", "treatmentStage");
