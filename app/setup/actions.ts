"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, hashPassword, passwordPolicyError } from "@/lib/auth";
import { defaultHours, defaultServices } from "@/lib/clinic-config";
export async function setupAction(formData: FormData) { if (await prisma.user.count()) redirect("/login"); const clinicName = String(formData.get("clinicName") || "").trim(); const fullName = String(formData.get("fullName") || "").trim(); const email = String(formData.get("email") || "").trim().toLowerCase(); const password = String(formData.get("password") || ""); if (!clinicName || !fullName || !email || passwordPolicyError(password)) redirect("/setup?error=invalid"); const clinic = await prisma.clinic.create({ data: { name: clinicName, services: { create: defaultServices }, hours: { create: defaultHours }, whatsapp: { create: {} } } }); const owner = await prisma.user.create({ data: { clinicId: clinic.id, fullName, email, role: "OWNER", passwordHash: hashPassword(password) } }); await createSession(owner.id); redirect("/dashboard/settings"); }
