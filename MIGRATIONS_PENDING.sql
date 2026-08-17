-- Two schema changes that are written, reviewed and NOT applied.
--
-- ============================================================================
-- NOT IN prisma/migrations/ ON PURPOSE. `vercel-build` runs
-- `prisma migrate deploy`, so a file placed there applies itself on the next
-- deploy. Moving it there is the act of approving it. Take a verified backup
-- first.
--
-- Neither of these destroys anything. Both are additive.
-- ============================================================================


-- 1. "No allergies" and "nobody asked" currently look identical -------------
--
-- An empty allergy field means either "we asked and there are none" or "nobody
-- has ever asked". A clinician cannot tell which, and the safety banner has to
-- report the weaker, honest claim every time. One nullable timestamp fixes it:
-- set it when somebody confirms the medical history with the patient, and an
-- empty allergy field beside a recent stamp becomes a fact rather than a gap.
--
-- After applying, add to prisma/schema.prisma on model Patient:
--   medicalHistoryConfirmedAt   DateTime?
--   medicalHistoryConfirmedById Int?
-- and have SafetyBanner read them for its third state.

ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "medicalHistoryConfirmedAt" TIMESTAMP(3);
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "medicalHistoryConfirmedById" INTEGER;


-- 2. Tax rounds to whole rupees --------------------------------------------
--
-- `InvoiceLineItem.taxPercent` and the invoice tax totals are integers holding
-- rupees, so 18% GST on ₹1,450 stores as ₹261 rather than ₹261.00 and the line
-- totals drift by a rupee or two against what the patient is actually charged.
-- On a tax invoice that is a reconciliation problem, not a rounding preference.
--
-- These columns add paise-precision alongside the existing ones rather than
-- changing them, so nothing already issued moves. Issued invoices carry a
-- frozen `immutableSnapshot` and must never be recomputed; only new documents
-- should read the new columns.
--
-- After applying, add to prisma/schema.prisma:
--   model Invoice          taxAmountPaise Int? / totalAmountPaise Int?
--   model InvoiceLineItem  taxAmountPaise Int? / lineTotalPaise   Int?
-- and switch billing arithmetic to paise, formatting to rupees only for display.

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "taxAmountPaise" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "totalAmountPaise" INTEGER;
ALTER TABLE "InvoiceLineItem" ADD COLUMN IF NOT EXISTS "taxAmountPaise" INTEGER;
ALTER TABLE "InvoiceLineItem" ADD COLUMN IF NOT EXISTS "lineTotalPaise" INTEGER;
