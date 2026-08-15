# Phase 3 — Laboratory core

## Delivered

- A tenant-scoped laboratory directory with contacts, technicians, services, materials, logistics, quality metrics, tax information, integration mode, and data-processing acknowledgement.
- A dedicated lab-order composer linked to patient, dentist, treatment plan/item, appointment, encounter, and approved imaging references. Orders begin as private drafts.
- Dentist-only approval with completeness checks and a concurrency claim. Approval does not silently transmit patient data.
- A revocable, expiring laboratory portal whose token is stored hashed and AES-GCM encrypted. The portal deliberately excludes patient name, phone, date of birth, address, billing, and unrelated records.
- Separate delivery states for prepared, queued, sent, viewed, accepted, rejected, clarification requested, production, clinic-controlled stage review, ready, dispatched, clinic receipt, fitting, completion, rework, and cancellation.
- Secure-link WhatsApp notifications use the durable clinic outbox, contain no patient identity or clinical attachment, and remain `QUEUED` until the existing worker records a provider outcome.
- Private attachments with size and magic-byte validation, hashing, deduplication, malware-gate support, signed retrieval, and access audit. Supported formats are JPEG, PNG, PDF, STL, OBJ, and PLY.
- Imaging references are linked rather than copied and exposed to the lab only through a case-bound, short-lived signed URL.
- An immutable clinic/lab message thread, case events, patient timeline entries, audit entries, delivery attempts, material/batch provenance, dispatch details, and structured rework versions.
- Patient 360, clinical workspace, treatment-plan list, relevant appointment, global search, dashboard follow-ups/notifications, daily huddle, and 30-day reports now converge on the same lab case.
- A printable work authorization that uses a patient-safe case identifier.

## Safety properties

1. All clinic reads and writes include `clinicId`; every portal read is bound to one active access record and one lab case.
2. The state machine rejects arbitrary or backward status jumps. Terminal cases cannot be silently reopened.
3. Draft creation and delivery are idempotent. Approval, status changes, portal-first-view, and rework creation use guarded writes or serializable transactions.
4. Sending, endpoint delivery, viewing, acceptance, and production are not conflated.
5. Rework never overwrites the original. Responsibility, chargeability, reason, new date, inherited imaging links, and version lineage remain reviewable.
6. Laboratory-role users do not receive normal clinic-dashboard access; external work occurs only in the narrow token portal.

## Routes

- `/dashboard/laboratory` — filtered/paginated worklist and governed directory
- `/dashboard/laboratory/new` — private order draft
- `/dashboard/laboratory/[id]` — clinic case workspace
- `/dashboard/laboratory/[id]/print` — printable authorization
- `/lab/cases/[token]` — lab-only case workspace
- `/api/laboratory/cases/[caseId]/attachments` — authenticated clinic or scoped portal upload
- `/api/laboratory/attachments/[attachmentId]` — short-lived attachment access
- `/api/laboratory/imaging/[assetId]` — short-lived, case-linked imaging access

## Deployment notes

The additive migration is `prisma/migrations/20260811235900_phase3_laboratory_core/migration.sql`. It backfills public and patient-safe case identifiers and preserves legacy cases/statuses. Production requires `LAB_PORTAL_SECRET` (or the existing 32+ character authentication/imaging secret), a private Blob token, `NEXT_PUBLIC_APP_URL`, and Resend credentials only when secure-email delivery is used.

The phase is intentionally not deployed until review. Run `npm run verify`, `npm run build`, then deploy so `prisma migrate deploy` executes before the application starts serving the new pages.
