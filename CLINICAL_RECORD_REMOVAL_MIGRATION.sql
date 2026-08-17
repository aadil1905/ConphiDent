-- Drops the clinical notes feature's storage.
--
-- ============================================================================
-- THIS FILE IS NOT IN prisma/migrations/ ON PURPOSE.
--
-- `vercel-build` runs `prisma migrate deploy`, so a file placed in
-- prisma/migrations/ applies itself on the next deploy without anybody
-- re-reading it. Moving this file there IS the act of approving it.
--
-- Before you move it:
--   1. Take a backup of the database and verify the backup restores.
--   2. Read the note below about what leaves with the table.
-- ============================================================================
--
-- WHAT THIS DELETES, PERMANENTLY
--
-- Every clinical note ever written, including:
--   * what the patient came in for, what was found, and what was done
--   * the consent text, and the drawn patient and guardian signatures held
--     against each note
--   * medical history, drug allergies, medications and vitals as they were
--     recorded on each visit
--   * the correction trail: superseded versions and entered-in-error records
--
-- WHAT DOES NOT LEAVE WITH IT
--
--   * Allergies. `PatientIntakeRequest.drugAllergies` and
--     `Patient.medicalNotes` hold them, and every prescription and treatment
--     plan surface now reads those. Prescription safety warnings still fire.
--   * Consent and signatures for anyone who filled in the intake form.
--     `PatientIntakeRequest` carries `consentGiven`, `consentNotes`,
--     `patientSignature`, `guardianSignature` and `completedAt`.
--   * Charting. Teeth live in `DentalChartEntry` and `DentalFinding`.
--   * `Prescription.allergySnapshot` on already-issued prescriptions — those
--     are frozen copies and are untouched.
--
-- Consent recorded on a note rather than through the intake form has no other
-- home and is destroyed. If any patient in this clinic signed consent on a
-- note, export it before running this.
--
-- The dropped column below is a nullable foreign key that was never populated
-- by any code path that survives.

BEGIN;

ALTER TABLE "Prescription" DROP COLUMN IF EXISTS "clinicalRecordId";

DROP TABLE IF EXISTS "ClinicalRecord" CASCADE;

COMMIT;
