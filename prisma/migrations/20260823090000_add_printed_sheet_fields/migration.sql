-- Fields the redesigned pads print but nothing could set.

-- "Next visit — 5 days, 27 Aug 2026, for canal obturation". Free text rather
-- than a date: what the dentist writes here is an interval plus a reason, and
-- forcing it into a date column would lose the half of it that matters.
ALTER TABLE "Prescription" ADD COLUMN "nextVisit" TEXT;

-- The receipt carries the diagnosis it was raised for, so a patient handing the
-- sheet to an insurer or another dentist hands over what it was treatment for.
ALTER TABLE "Invoice" ADD COLUMN "diagnosis" TEXT;
