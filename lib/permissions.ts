import "server-only";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export const CLINIC_ROLES = ["OWNER", "ADMINISTRATOR", "DENTIST", "RECEPTIONIST", "BILLING", "ASSISTANT", "INVENTORY", "LAB"] as const;
export type ClinicRole = (typeof CLINIC_ROLES)[number];

export const PERMISSIONS = {
  manageClinic: ["OWNER", "ADMINISTRATOR"],
  manageStaff: ["OWNER", "ADMINISTRATOR"],
  manageBilling: ["OWNER", "ADMINISTRATOR", "RECEPTIONIST", "BILLING"],
  manageClinical: ["OWNER", "ADMINISTRATOR", "DENTIST", "ASSISTANT"],
  manageSchedule: ["OWNER", "ADMINISTRATOR", "DENTIST", "RECEPTIONIST", "ASSISTANT"],
  managePatients: ["OWNER", "ADMINISTRATOR", "DENTIST", "RECEPTIONIST", "ASSISTANT"],
  exportData: ["OWNER", "ADMINISTRATOR"],
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
