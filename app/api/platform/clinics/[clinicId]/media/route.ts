import { del, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/platform";

const MAX_BYTES = 2 * 1024 * 1024;
const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/x-icon"]);
const allowedKinds = new Set(["LOGO", "SQUARE_LOGO", "FAVICON"]);

export async function POST(request: Request, { params }: { params: Promise<{ clinicId: string }> }) {
  const admin = await requirePlatformAdmin();
  const clinicId = Number((await params).clinicId);
  if (!Number.isInteger(clinicId)) return NextResponse.json({ error: "Invalid clinic." }, { status: 400 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Media storage is not configured." }, { status: 503 });
  const formData = await request.formData(); const file = formData.get("file"); const kind = String(formData.get("kind") || "LOGO");
  if (!(file instanceof File) || !allowedKinds.has(kind) || !allowedTypes.has(file.type) || file.size === 0 || file.size > MAX_BYTES) return NextResponse.json({ error: "Use a PNG, JPEG, WebP, SVG, or icon below 2 MB." }, { status: 400 });
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const key = `clinics/${clinicId}/${kind.toLowerCase()}-${crypto.randomUUID()}.${extension}`;
  const blob = await put(key, file, { access: "public", contentType: file.type, addRandomSuffix: false });
  const previous = await prisma.clinicMediaAsset.findFirst({ where: { clinicId, kind }, orderBy: { createdAt: "desc" } });
  await prisma.$transaction([prisma.clinicMediaAsset.create({ data: { clinicId, kind, storageKey: blob.pathname, publicUrl: blob.url, contentType: file.type, sizeBytes: file.size, originalName: file.name.slice(0, 255) } }), ...(kind === "LOGO" ? [prisma.clinic.update({ where: { id: clinicId }, data: { logoUrl: blob.url } })] : [])]);
  if (previous) await del(previous.publicUrl).catch(() => undefined);
  await recordAudit({ clinicId, userId: admin.id, action: "CLINIC_MEDIA_UPLOADED", entityType: "ClinicMediaAsset", entityId: blob.pathname, detail: `${kind} uploaded` });
  return NextResponse.json({ url: blob.url });
}
