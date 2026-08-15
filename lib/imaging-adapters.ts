import "server-only";

export type ImagingInboundObject = {
  idempotencyKey: string;
  contentHash: string;
  studyInstanceUid?: string;
  seriesInstanceUid?: string;
  sopInstanceUid?: string;
  accessionNumber?: string;
  dicomPatientId?: string;
  externalPatientId?: string;
  vendorRecordId?: string;
  modality: string;
  acquisitionDate: Date;
};

export type ImagingAdapterHealth = { status: "ACTIVE" | "DEGRADED" | "DISCONNECTED"; checkedAt: Date; detail?: string };

export type ImagingAdapterContext = {
  clinicId: number;
  correlationId: string;
  deadline: Date;
  /** Secret-manager reference, never the credential itself. */
  credentialKey: string;
  /** Required for vendor/local-bridge certification and rotated before expiry. */
  credentialExpiresAt: Date;
  /** Certificate pin used by an optional outbound-only, mutually authenticated bridge. */
  peerCertificateSha256?: string;
  /** Limits synchronization to an explicit worklist; unrelated studies are not copied. */
  requestedPatientIdentifiers: readonly string[];
};

export type ImagingAdapterBatch = {
  objects: ImagingInboundObject[];
  cursor?: string;
  retryAfter?: Date;
  sourceEventId?: string;
};

/** Contract implemented only by individually certified integrations. */
export interface ImagingAdapter {
  readonly type: "DICOMWEB" | "VENDOR_API" | "LOCAL_BRIDGE" | "MANUAL_DICOM" | "MANUAL_MEDIA";
  health(context: ImagingAdapterContext): Promise<ImagingAdapterHealth>;
  pull(context: ImagingAdapterContext, cursor?: string): Promise<ImagingAdapterBatch>;
  /** Remote revocation must invalidate new pulls without exposing the clinic network. */
  revoke(context: ImagingAdapterContext): Promise<void>;
}
