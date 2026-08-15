export const LAB_CASE_STATUSES = [
  "DRAFT",
  "APPROVED",
  "QUEUED",
  "SENT",
  "DELIVERED_TO_ENDPOINT",
  "VIEWED",
  "ACCEPTED",
  "CLARIFICATION_REQUESTED",
  "REJECTED",
  "IN_PRODUCTION",
  "STAGE_REVIEW",
  "READY",
  "DISPATCHED",
  "RECEIVED_BY_CLINIC",
  "FITTED",
  "COMPLETED",
  "REWORK",
  "CANCELLED",
  // Historical statuses remain valid during the additive migration.
  "SENT_TO_LAB",
  "IN_PROGRESS",
  "WAX_STAGE",
  "METAL_STAGE",
  "CERAMIC_STAGE",
  "DELIVERED",
] as const;

export type LabCaseStatus = (typeof LAB_CASE_STATUSES)[number];
export type LabActorType = "CLINIC" | "LAB";

export const LAB_STATUS_LABELS: Record<LabCaseStatus, string> = Object.fromEntries(
  LAB_CASE_STATUSES.map((status) => [status, status.replaceAll("_", " ").toLowerCase().replace(/^./, (value) => value.toUpperCase())]),
) as Record<LabCaseStatus, string>;

const clinicTransitions: Partial<Record<LabCaseStatus, readonly LabCaseStatus[]>> = {
  DRAFT: ["APPROVED", "CANCELLED"],
  APPROVED: ["QUEUED", "SENT", "CANCELLED"],
  QUEUED: ["SENT", "CANCELLED"],
  SENT: ["DELIVERED_TO_ENDPOINT", "VIEWED", "CANCELLED"],
  DELIVERED_TO_ENDPOINT: ["VIEWED", "CANCELLED"],
  VIEWED: ["CANCELLED"],
  CLARIFICATION_REQUESTED: ["SENT", "CANCELLED"],
  REJECTED: ["CANCELLED", "REWORK"],
  STAGE_REVIEW: ["IN_PRODUCTION", "REWORK", "CANCELLED"],
  READY: ["RECEIVED_BY_CLINIC", "CANCELLED"],
  DISPATCHED: ["RECEIVED_BY_CLINIC"],
  RECEIVED_BY_CLINIC: ["FITTED", "REWORK", "COMPLETED"],
  FITTED: ["COMPLETED", "REWORK"],
  REWORK: ["APPROVED", "CANCELLED"],
  SENT_TO_LAB: ["VIEWED", "ACCEPTED", "CANCELLED"],
  IN_PROGRESS: ["STAGE_REVIEW", "READY", "CANCELLED"],
  WAX_STAGE: ["STAGE_REVIEW", "IN_PRODUCTION", "READY", "CANCELLED"],
  METAL_STAGE: ["STAGE_REVIEW", "IN_PRODUCTION", "READY", "CANCELLED"],
  CERAMIC_STAGE: ["STAGE_REVIEW", "IN_PRODUCTION", "READY", "CANCELLED"],
  DELIVERED: ["RECEIVED_BY_CLINIC", "FITTED", "COMPLETED", "REWORK"],
};

const labTransitions: Partial<Record<LabCaseStatus, readonly LabCaseStatus[]>> = {
  SENT: ["DELIVERED_TO_ENDPOINT", "VIEWED", "ACCEPTED", "CLARIFICATION_REQUESTED", "REJECTED"],
  DELIVERED_TO_ENDPOINT: ["VIEWED", "ACCEPTED", "CLARIFICATION_REQUESTED", "REJECTED"],
  VIEWED: ["ACCEPTED", "CLARIFICATION_REQUESTED", "REJECTED"],
  ACCEPTED: ["IN_PRODUCTION", "CLARIFICATION_REQUESTED"],
  CLARIFICATION_REQUESTED: ["ACCEPTED"],
  IN_PRODUCTION: ["STAGE_REVIEW", "READY", "CLARIFICATION_REQUESTED"],
  // The laboratory cannot approve its own checkpoint. The clinic moves a
  // reviewed stage back to production; the lab then continues to READY.
  STAGE_REVIEW: ["CLARIFICATION_REQUESTED"],
  READY: ["DISPATCHED"],
  REWORK: ["ACCEPTED", "IN_PRODUCTION", "CLARIFICATION_REQUESTED"],
  SENT_TO_LAB: ["VIEWED", "ACCEPTED", "CLARIFICATION_REQUESTED", "REJECTED"],
  IN_PROGRESS: ["STAGE_REVIEW", "READY", "CLARIFICATION_REQUESTED"],
  WAX_STAGE: ["STAGE_REVIEW", "IN_PRODUCTION", "READY", "CLARIFICATION_REQUESTED"],
  METAL_STAGE: ["STAGE_REVIEW", "IN_PRODUCTION", "READY", "CLARIFICATION_REQUESTED"],
  CERAMIC_STAGE: ["STAGE_REVIEW", "IN_PRODUCTION", "READY", "CLARIFICATION_REQUESTED"],
};

export function isLabCaseStatus(value: unknown): value is LabCaseStatus {
  return typeof value === "string" && (LAB_CASE_STATUSES as readonly string[]).includes(value);
}

export function canTransitionLabCase(from: LabCaseStatus, to: LabCaseStatus, actor: LabActorType) {
  if (from === to || ["COMPLETED", "CANCELLED"].includes(from)) return false;
  const map = actor === "LAB" ? labTransitions : clinicTransitions;
  return Boolean(map[from]?.includes(to));
}

export function allowedLabTransitions(from: LabCaseStatus, actor: LabActorType) {
  return [...((actor === "LAB" ? labTransitions : clinicTransitions)[from] || [])];
}

export function splitLabList(value: FormDataEntryValue | null, maximum = 20) {
  return String(value || "")
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maximum);
}

export function labDelayThreatensAppointment(input: { status: string; requiredAt?: Date | null; appointmentAt?: Date | null; now?: Date }) {
  if (["READY", "DISPATCHED", "RECEIVED_BY_CLINIC", "FITTED", "COMPLETED", "CANCELLED", "DELIVERED"].includes(input.status)) return false;
  const appointmentAt = input.appointmentAt?.getTime();
  const requiredAt = input.requiredAt?.getTime();
  const now = (input.now || new Date()).getTime();
  if (!appointmentAt) return Boolean(requiredAt && requiredAt < now);
  return appointmentAt <= now + 72 * 60 * 60 * 1000 || Boolean(requiredAt && requiredAt > appointmentAt);
}

export const MAX_LAB_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function startsWith(bytes: Uint8Array, signature: readonly number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

export function sniffLabAttachment(bytes: Uint8Array, originalName: string) {
  const name = originalName.toLowerCase();
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { contentType: "image/jpeg", extension: "jpg" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { contentType: "image/png", extension: "png" };
  if (new TextDecoder("ascii").decode(bytes.subarray(0, 5)) === "%PDF-") return { contentType: "application/pdf", extension: "pdf" };
  const sample = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, Math.min(bytes.length, 65_536))).replace(/^\uFEFF/, "");
  if (name.endsWith(".ply") && /^ply\r?\nformat (ascii|binary_little_endian|binary_big_endian) 1\.0\r?\n/.test(sample)) return { contentType: "model/ply", extension: "ply" };
  if (name.endsWith(".obj") && /(^|\n)v\s+-?\d/.test(sample) && /(^|\n)f\s+\d/.test(sample)) return { contentType: "model/obj", extension: "obj" };
  if (name.endsWith(".stl")) {
    const ascii = /^solid(?:\s|\r|\n)/i.test(sample) && /facet\s+normal/i.test(sample);
    const count = bytes.length >= 84 ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true) : 0;
    const binary = count > 0 && 84 + count * 50 === bytes.length;
    if (ascii || binary) return { contentType: "model/stl", extension: "stl" };
  }
  return null;
}

export function labOrderIssues(input: {
  caseType?: string | null;
  laboratoryId?: number | null;
  dueDate?: Date | null;
  material?: string | null;
  teeth?: string | null;
  anatomicalScope?: string | null;
  treatingDoctor?: string | null;
}) {
  return [
    ...(!input.caseType?.trim() ? ["Procedure or appliance is required."] : []),
    ...(!input.laboratoryId ? ["Choose an active laboratory."] : []),
    ...(!input.dueDate ? ["Required-in-clinic date is required before approval."] : []),
    ...(!input.material?.trim() ? ["Record the requested material before approval."] : []),
    ...(!input.teeth?.trim() && !input.anatomicalScope?.trim() ? ["Record tooth numbers or a clear anatomical/appliance scope."] : []),
    ...(!input.treatingDoctor?.trim() ? ["A responsible dentist is required before approval."] : []),
  ];
}
