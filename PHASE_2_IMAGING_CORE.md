# Phase 2 — Governed dental imaging core

## Outcome

ConphiDent now has one clinic-owned imaging repository. The clinic worklist at `/dashboard/imaging` and the X-rays & media section in Patient 360 query the same `ImagingStudy` rows; no image or metadata is copied for the patient view.

The implementation follows DICOM/DICOMweb and FHIR-compatible boundaries without claiming universal vendor or diagnostic-viewer compatibility. Controlled DICOM/JPEG/PNG/TIFF import is the currently supported acquisition path. DICOMweb, vendor API, and outbound-only local bridge integrations must implement and pass certification against `lib/imaging-adapters.ts` before being shown as connected.

## Affected routes and components

- `/dashboard/imaging`: paginated clinic worklist, stable search/filter URLs, date groups, unmatched and unreviewed queues, connection health, import, report review, comparison builder.
- `/dashboard/imaging/comparisons/[id]`: signed pre-/post-treatment record with identity-bound studies and synchronized pan/zoom only when modality, region, and renderable formats permit it.
- `/dashboard/patients/[id]#imaging`: the same studies filtered by tenant and patient, plus signed comparisons.
- `/api/imaging/import`: controlled multipart ingest with authorization, signature/size validation, optional fail-closed malware scanning, DICOM metadata parsing, patient-link verification, hash/UID deduplication, private object storage, derivative generation, inbox/outbox records, timeline, and audit.
- `/api/imaging/assets/[assetId]`: authenticated, tenant-scoped, short-lived HMAC-bound private streaming. Raw storage URLs are never sent to the browser.
- `/api/imaging/patient-search`: bounded tenant patient lookup used instead of a non-scalable full-clinic dropdown.
- `/api/imaging/comparison-options`: patient-scoped imaging/treatment context for comparison.
- `components/imaging/*`: import progress/recovery, patient lookup, gallery, metadata viewer, annotations, clinical actions, and comparison viewer.

Every visible control has a real outcome: filters and pagination use stable URLs; import uses upload progress and duplicate/retry feedback; identity resolution, reporting, annotation, comparison, and entered-in-error actions commit audited records and show pending/success/error state; viewer controls change the rendered view; expired assets have a secure-link refresh action.

## Data and provenance

Migration `20260811230000_phase2_imaging_core` adds:

- `ImagingSource`
- `ImagingStudy`
- `ImagingSeries`
- `ImagingInstance`
- `ImagingAsset`
- `ImagingReport`
- `ImagingAnnotation`
- `ImagingComparison`
- `ImagingMatchResolution`
- `ImagingIngestEvent`
- `ImagingProcessingJob`

Every model has direct clinic ownership. Clinical records use restrictive foreign keys. Original assets are never overwritten. Thumbnails are separately hashed assets with a `derivedFromAssetId`. Report correction creates a new version and supersedes the prior signed version. Annotations and comparisons are separate derived clinical records. Entered-in-error retains storage, metadata, versions, and audit history.

Study metadata includes patient/encounter/plan, ordering and reviewing provider, acquiring operator, modality, acquisition time, region/laterality/FDI teeth, source identifiers, DICOM UIDs, accession, hashes, version, status, patient-match evidence, and available radiation fields.

## Patient matching

- Name alone is never enough.
- A selected patient requires an explicit non-name identity acknowledgement and verification note.
- A DICOM date-of-birth conflict rejects direct attachment and instructs import to the unmatched queue.
- Unmatched studies remain patient-null and do not appear in Patient 360.
- Resolution rechecks tenant ownership and linked encounter/plan consistency, atomically claims the unresolved study, stores signals/conflicts/reason, and writes timeline and audit events.
- Search is server-side and tenant-scoped, so old patients remain selectable in large clinics.

## Storage and viewer safety

- Originals and derivatives use a separate private Vercel Blob token (`IMAGING_READ_WRITE_TOKEN`, with `IMAGING_BLOB_READ_WRITE_TOKEN` retained as a compatibility fallback).
- Storage keys contain clinic and random identifiers, not patient identity.
- Browser access uses a maximum ten-minute HMAC signature bound to asset and clinic, plus the authenticated clinic session and role/feature checks.
- Asset responses use `private, no-store`, `nosniff`, and sandbox CSP headers and record successful access.
- Renderable media gets a maximum 512 px derivative; the gallery loads that before the full object.
- File signatures are checked independently of filename/MIME claims. Image decoding is bounded to 100 million input pixels.
- If `IMAGING_MALWARE_SCANNER_URL` and `IMAGING_MALWARE_SCANNER_SECRET` are configured, scanning fails closed on timeout, invalid response, or outage. Without them, assets are truthfully marked `BASIC_VALIDATED`; deployment readiness must not call that malware-cleared.
- DICOM pixel decoding is intentionally unavailable until a validated renderer is integrated. Metadata and originals remain accessible, and the UI states the limitation.
- The viewer displays “Not for diagnostic use” and does not simulate unvalidated DICOM window/level, registration, or geometry equivalence.

## Adapter and job boundaries

`ImagingAdapter` requires tenant context, correlation ID, deadline, secret-manager key, credential expiry, optional certificate pin, and an explicit patient worklist. Local bridge implementations must remain outbound-only, mutually authenticated, encrypted, revocable, scoped, and idempotent. No vendor is represented as supported until an adapter is certified.

Each import stores a durable inbox event. Derivative/render work has a unique outbox job. Renderable controlled imports complete their thumbnail job atomically with metadata; DICOM preview jobs are visibly `BLOCKED` rather than pretending success without a certified renderer.

## Permissions

- View: owner, administrator, dentist, receptionist, assistant.
- Import/match/annotate intake: owner, administrator, dentist, assistant.
- Sign reports/comparisons and mark entered in error: owner, administrator, dentist.
- Configure integrations: owner, administrator.

Page visibility is not trusted. Every API/action repeats authentication, feature entitlement, permission, tenant, patient, and linked-object checks on the server.

## Migration and compatibility risk

The migration is additive and does not rewrite existing patient or clinical data. The imaging sidebar feature is enabled by default but can be disabled through the existing entitlement system. Deployment must run `prisma migrate deploy` before the new build serves imaging routes.

Required production configuration:

- `IMAGING_READ_WRITE_TOKEN` (generated by the prefixed Vercel Blob connection) or compatibility fallback `IMAGING_BLOB_READ_WRITE_TOKEN`
- `IMAGING_ACCESS_SECRET` (recommended separate secret; falls back to a valid `AUTH_SECRET`)
- Optional private malware scanner URL/secret

Object storage retention/versioning and legal retention duration remain deployment policies. Large multi-instance CBCT ingestion must be certified and load-tested separately; the controlled single-file route deliberately caps objects at 50 MB and does not claim to be a bulk CBCT importer.

## Regression coverage

`npm run test:imaging` covers:

- DICOM signature and Part 10 metadata parsing, including UIDs, patient signals, accession, and radiation metadata.
- Rejection of malformed and unsupported big-endian DICOM.
- Magic-byte validation for supported controlled formats.
- Comparison compatibility guardrails.
- Tenant/asset/expiry binding for short-lived access signatures.
- Immutable original plus bounded derivative generation.
- With `TEST_DATABASE_URL`: repository uniqueness, cross-tenant denial, unmatched resolution, append-only report correction, derived comparison, and original hash retention.

CI provisions disposable PostgreSQL, deploys migrations, and runs the imaging suite through `npm run verify`; skipped database tests therefore execute in CI even when a safe local test database is not configured.

## Deliberate limitations, not fake functionality

- No DICOMweb/vendor/local-bridge adapter is advertised as connected until certified against a real system.
- No diagnostic claim, autonomous diagnosis, image alteration, fake window/level, or fake registration.
- No bulk CBCT promise through the 50 MB manual fallback.
- No malware-clean claim unless the configured scanner returns a clean result.
- No permanent deletion of clinical imaging through ordinary UI actions.
