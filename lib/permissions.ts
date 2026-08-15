import "server-only";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export const CLINIC_ROLES = ["OWNER", "ADMINISTRATOR", "DENTIST", "RECEPTIONIST", "BILLING", "ASSISTANT", "INVENTORY", "AUDITOR", "LAB"] as const;
export type ClinicRole = (typeof CLINIC_ROLES)[number];

export const PERMISSIONS = {
  manageClinic: ["OWNER", "ADMINISTRATOR"],
  manageStaff: ["OWNER", "ADMINISTRATOR"],
  manageBilling: ["OWNER", "ADMINISTRATOR", "RECEPTIONIST", "BILLING"],
  viewClinical: ["OWNER", "ADMINISTRATOR", "DENTIST", "ASSISTANT"],
  editClinicalDraft: ["DENTIST", "ASSISTANT"],
  manageClinical: ["OWNER", "ADMINISTRATOR", "DENTIST", "ASSISTANT"],
  signClinical: ["OWNER", "ADMINISTRATOR", "DENTIST"],
  correctClinical: ["OWNER", "ADMINISTRATOR", "DENTIST"],
  viewImaging: ["OWNER", "ADMINISTRATOR", "DENTIST", "RECEPTIONIST", "ASSISTANT"],
  uploadImaging: ["OWNER", "ADMINISTRATOR", "DENTIST", "ASSISTANT"],
  signImaging: ["DENTIST"],
  manageImagingIntegrations: ["OWNER", "ADMINISTRATOR"],
  // Kept as a compatibility key for shared navigation helpers. Prescription
  // boundaries authenticate the active tenant user directly and then enforce
  // prescriber identity, registration, safety review and audit requirements.
  issuePrescription: CLINIC_ROLES,
  manageLaboratory: ["OWNER", "ADMINISTRATOR", "DENTIST", "ASSISTANT", "LAB"],
  approveLabOrder: ["DENTIST"],
  manageInventory: ["OWNER", "ADMINISTRATOR", "INVENTORY"],
  recordPayment: ["OWNER", "ADMINISTRATOR", "RECEPTIONIST", "BILLING"],
  sendWhatsApp: ["OWNER", "ADMINISTRATOR", "DENTIST", "RECEPTIONIST", "ASSISTANT"],
  viewAudit: ["OWNER", "ADMINISTRATOR", "AUDITOR"],
  manageSchedule: ["OWNER", "ADMINISTRATOR", "DENTIST", "RECEPTIONIST", "ASSISTANT"],
  managePatients: ["OWNER", "ADMINISTRATOR", "DENTIST", "RECEPTIONIST", "ASSISTANT"],
  exportData: ["OWNER", "ADMINISTRATOR", "AUDITOR"],
} as const satisfies Record<string, readonly ClinicRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export async function requirePermission(permission: Permission) {
  const user = await requireUser();
  if (!(PERMISSIONS[permission] as readonly ClinicRole[]).includes(user.role as ClinicRole)) {
    redirect("/dashboard");
  }
  return user;
}

export function can(role: string, permission: Permission) {
  return (PERMISSIONS[permission] as readonly ClinicRole[]).includes(role as ClinicRole);
}
