import { del, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/platform";

const MAX_BYTES = 2 * 1024 * 1024;
const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const allowedKinds = new Set(["LOGO", "SQUARE_LOGO", "FAVICON"]);

export async function POST(request: Request, { params }: { params: Promise<{ clinicId: string }> }) {
  const admin = await requirePlatformPermission("tenant.update");
  const clinicId = Number((await params).clinicId);
  if (!Number.isInteger(clinicId)) return NextResponse.json({ error: "Invalid clinic." }, { status: 400 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Media storage is not configured." }, { status: 503 });
  const formData = await request.formData(); const file = formData.get("file"); const kind = String(formData.get("kind") || "LOGO");
  if (!(file instanceof File) || !allowedKinds.has(kind) || !allowedTypes.has(file.type) || file.size === 0 || file.size > MAX_BYTES) return NextResponse.json({ error: "Use a PNG, JPEG, or WebP image below 2 MB." }, { status: 400 });
  let output: Buffer;
  let contentType: string;
  let extension: string;
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 16_000_000, failOn: "warning" }).rotate();
    if (kind === "FAVICON") {
      output = await image.resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      contentType = "image/png";
      extension = "png";
    } else {
      output = await image.resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
      contentType = "image/webp";
      extension = "webp";
    }
  } catch {
    return NextResponse.json({ error: "The image content is invalid or unsafe." }, { status: 400 });
  }
  const key = `clinics/${clinicId}/${kind.toLowerCase()}-${crypto.randomUUID()}.${extension}`;
  const blob = await put(key, output, { access: "public", contentType, addRandomSuffix: false });
  const previous = await prisma.clinicMediaAsset.findFirst({ where: { clinicId, kind }, orderBy: { createdAt: "desc" } });
  try {
    await prisma.$transaction([prisma.clinicMediaAsset.create({ data: { clinicId, kind, storageKey: blob.pathname, publicUrl: blob.url, contentType, sizeBytes: output.length, originalName: file.name.slice(0, 255) } }), ...(kind === "LOGO" ? [prisma.clinic.update({ where: { id: clinicId }, data: { logoUrl: blob.url } })] : [])]);
  } catch (error) {
    await del(blob.url).catch(() => undefined);
    throw error;
  }
  if (previous) await del(previous.publicUrl).catch(() => undefined);
  await recordAudit({ clinicId, userId: admin.id, action: "CLINIC_MEDIA_UPLOADED", entityType: "ClinicMediaAsset", entityId: blob.pathname, detail: `${kind} uploaded` });
  return NextResponse.json({ url: blob.url });
}
