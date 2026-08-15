import { STANDARD_FDI_CODES } from "@/lib/dentition";
export { comparisonCompatibility, imagingExtension, isRenderableImagingType, sniffImagingType } from "@/lib/imaging-core";

export const IMAGING_MODALITIES = [
  "INTRAORAL_PERIAPICAL",
  "BITEWING",
  "OCCLUSAL",
  "PANORAMIC",
  "CEPHALOMETRIC",
  "CBCT",
  "INTRAORAL_PHOTO",
  "EXTRAORAL_PHOTO",
  "INTRAORAL_SCAN",
  "OTHER_DICOM",
] as const;

export type ImagingModality = (typeof IMAGING_MODALITIES)[number];

export const IMAGING_MODALITY_LABELS: Record<ImagingModality, string> = {
  INTRAORAL_PERIAPICAL: "Intraoral periapical",
  BITEWING: "Bitewing",
  OCCLUSAL: "Occlusal",
  PANORAMIC: "Panoramic",
  CEPHALOMETRIC: "Cephalometric",
  CBCT: "CBCT",
  INTRAORAL_PHOTO: "Intraoral photograph",
  EXTRAORAL_PHOTO: "Extraoral photograph",
  INTRAORAL_SCAN: "Intraoral scan",
  OTHER_DICOM: "Other DICOM study",
};

export const IMAGING_ADAPTER_TYPES = ["DICOMWEB", "VENDOR_API", "LOCAL_BRIDGE", "MANUAL_DICOM", "MANUAL_MEDIA"] as const;
export const MAX_IMAGING_UPLOAD_BYTES = 50 * 1024 * 1024;

export function parseToothCodes(value: FormDataEntryValue | null) {
  const allowed = new Set<string>(STANDARD_FDI_CODES);
  return Array.from(new Set(String(value || "").split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))).filter((item) => allowed.has(item));
}
