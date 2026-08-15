import "server-only";

export type ImagingScanResult = { status: "BASIC_VALIDATED" | "MALWARE_CLEAN" | "MALWARE_DETECTED"; engine?: string };

/**
 * Optional private malware-scanner contract. When configured it fails closed:
 * an outage never degrades silently to signature-only validation.
 */
export async function scanImagingObject(bytes: Uint8Array, contentType: string, sha256: string): Promise<ImagingScanResult> {
  const endpoint = process.env.IMAGING_MALWARE_SCANNER_URL;
  const secret = process.env.IMAGING_MALWARE_SCANNER_SECRET;
  if (!endpoint && !secret) return { status: "BASIC_VALIDATED" };
  if (!endpoint || !secret || secret.length < 24) throw new Error("The imaging malware scanner configuration is incomplete.");
  const parsed = new URL(endpoint);
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") throw new Error("The imaging malware scanner must use HTTPS in production.");
  const response = await fetch(parsed, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": contentType, "x-content-sha256": sha256 },
    body: Buffer.from(bytes),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("The imaging malware scanner is unavailable.");
  const result = await response.json() as { clean?: unknown; engine?: unknown };
  if (typeof result.clean !== "boolean") throw new Error("The imaging malware scanner returned an invalid response.");
  return { status: result.clean ? "MALWARE_CLEAN" : "MALWARE_DETECTED", engine: typeof result.engine === "string" ? result.engine.slice(0, 80) : undefined };
}
