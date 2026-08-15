export function isRenderableImagingType(contentType: string) {
  return contentType === "image/jpeg" || contentType === "image/png" || contentType === "image/webp";
}

export function sniffImagingType(bytes: Uint8Array) {
  if (bytes.length >= 132 && new TextDecoder().decode(bytes.subarray(128, 132)) === "DICM") return "application/dicom";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 4 && ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0) || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0 && bytes[3] === 0x2a))) return "image/tiff";
  return null;
}

export function imagingExtension(contentType: string) {
  return ({ "application/dicom": "dcm", "image/png": "png", "image/jpeg": "jpg", "image/tiff": "tiff", "image/webp": "webp" } as Record<string, string>)[contentType] || "bin";
}

export function comparisonCompatibility(baseline: { modality: string; anatomicalRegion: string | null }, followup: { modality: string; anatomicalRegion: string | null }) {
  if (baseline.modality !== followup.modality) return { compatible: false, note: "The modalities differ. Side-by-side review is allowed, but synchronized controls and geometric equivalence are not implied." };
  if (baseline.anatomicalRegion && followup.anatomicalRegion && baseline.anatomicalRegion !== followup.anatomicalRegion) return { compatible: false, note: "The anatomical regions differ. Verify that the comparison is clinically meaningful." };
  return { compatible: true, note: "Modality and recorded anatomical region are compatible. Acquisition geometry may still differ." };
}
