export type DicomMetadata = {
  transferSyntaxUid?: string;
  sopClassUid?: string;
  sopInstanceUid?: string;
  studyInstanceUid?: string;
  seriesInstanceUid?: string;
  patientId?: string;
  patientName?: string;
  patientBirthDate?: string;
  accessionNumber?: string;
  modality?: string;
  studyDate?: string;
  studyTime?: string;
  studyDescription?: string;
  seriesDescription?: string;
  seriesNumber?: number;
  instanceNumber?: number;
  frameCount?: number;
  kvp?: string;
  exposureTimeMs?: string;
  tubeCurrentMa?: string;
  exposureMas?: string;
  doseAreaProduct?: string;
};

const LONG_VALUE_REPRESENTATIONS = new Set(["OB", "OD", "OF", "OL", "OV", "OW", "SQ", "UC", "UR", "UT", "UN"]);
const TAGS = {
  "0002,0010": "transferSyntaxUid",
  "0008,0016": "sopClassUid",
  "0008,0018": "sopInstanceUid",
  "0008,0020": "studyDate",
  "0008,0030": "studyTime",
  "0008,0050": "accessionNumber",
  "0008,0060": "modality",
  "0008,1030": "studyDescription",
  "0008,103e": "seriesDescription",
  "0010,0010": "patientName",
  "0010,0020": "patientId",
  "0010,0030": "patientBirthDate",
  "0018,0060": "kvp",
  "0018,1150": "exposureTimeMs",
  "0018,1151": "tubeCurrentMa",
  "0018,1152": "exposureMas",
  "0018,115e": "doseAreaProduct",
  "0020,000d": "studyInstanceUid",
  "0020,000e": "seriesInstanceUid",
  "0020,0011": "seriesNumber",
  "0020,0013": "instanceNumber",
  "0028,0008": "frameCount",
} as const satisfies Record<string, keyof DicomMetadata>;

function text(bytes: Uint8Array, start: number, length: number) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(start, start + length)).replaceAll("\0", "").trim();
}

function tagKey(group: number, element: number) {
  return `${group.toString(16).padStart(4, "0")},${element.toString(16).padStart(4, "0")}`;
}

function assign(metadata: DicomMetadata, key: string, value: string) {
  const field = TAGS[key as keyof typeof TAGS];
  if (!field || !value) return;
  if (field === "seriesNumber" || field === "instanceNumber" || field === "frameCount") {
    const number = Number.parseInt(value, 10);
    if (Number.isFinite(number)) metadata[field] = number;
    return;
  }
  metadata[field] = value as never;
}

function parseElements(bytes: Uint8Array, view: DataView, start: number, explicitVr: boolean, metadata: DicomMetadata, metaOnly = false) {
  let offset = start;
  while (offset + 8 <= bytes.length) {
    const group = view.getUint16(offset, true);
    const element = view.getUint16(offset + 2, true);
    if (metaOnly && group !== 0x0002) break;
    if (group === 0x7fe0 && element === 0x0010) break;

    let headerLength = 8;
    let valueLength: number;
    if (explicitVr) {
      const vr = text(bytes, offset + 4, 2);
      if (!/^[A-Z]{2}$/.test(vr)) throw new Error("The DICOM value representation is invalid.");
      if (LONG_VALUE_REPRESENTATIONS.has(vr)) {
        if (offset + 12 > bytes.length) throw new Error("The DICOM element header is incomplete.");
        headerLength = 12;
        valueLength = view.getUint32(offset + 8, true);
      } else {
        valueLength = view.getUint16(offset + 6, true);
      }
    } else {
      valueLength = view.getUint32(offset + 4, true);
    }

    if (valueLength === 0xffffffff) break;
    const valueStart = offset + headerLength;
    const next = valueStart + valueLength;
    if (next > bytes.length) throw new Error("The DICOM element extends beyond the file boundary.");
    const key = tagKey(group, element);
    if (key in TAGS) assign(metadata, key, text(bytes, valueStart, Math.min(valueLength, 512)));
    offset = next + (next % 2);
  }
  return offset;
}

/**
 * Parses identity and study metadata from a DICOM Part 10 object without
 * reading pixel data. Explicit and implicit VR little-endian transfer syntaxes
 * are supported. Compressed pixel data is acceptable because it is never
 * decoded here; big-endian and deflated data sets are rejected explicitly.
 */
export function parseDicomPart10(input: Uint8Array): DicomMetadata {
  if (input.length < 132 || text(input, 128, 4) !== "DICM") {
    throw new Error("Use a DICOM Part 10 file containing the DICM preamble.");
  }
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const metadata: DicomMetadata = {};
  const datasetOffset = parseElements(input, view, 132, true, metadata, true);
  const transferSyntax = metadata.transferSyntaxUid || "1.2.840.10008.1.2";
  if (transferSyntax === "1.2.840.10008.1.2.2") throw new Error("Big-endian DICOM transfer syntax is not supported by controlled import.");
  if (transferSyntax === "1.2.840.10008.1.2.1.99") throw new Error("Deflated DICOM transfer syntax is not supported by controlled import.");
  parseElements(input, view, datasetOffset, transferSyntax !== "1.2.840.10008.1.2", metadata);
  return metadata;
}

export function dicomDate(value?: string) {
  if (!value || !/^\d{8}$/.test(value)) return undefined;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

export function dicomPersonName(value?: string) {
  return value?.replaceAll("^", " ").replace(/\s+/g, " ").trim() || undefined;
}
