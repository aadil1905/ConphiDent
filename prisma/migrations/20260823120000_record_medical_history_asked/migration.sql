-- Which medical-history questions were on screen when this form was filled.
--
-- Without it the printed consent sheet cannot honestly tick a fifteen-row grid:
-- an empty answer set does not say whether the patient was shown twelve
-- questions or fifteen, and ticking "No" against a row nobody was asked is a
-- false statement on a document the clinic keeps. Rows written before this
-- column existed stay NULL and the sheet lists what was recorded instead.
ALTER TABLE "PatientIntakeRequest" ADD COLUMN "medicalHistoryAsked" TEXT;
