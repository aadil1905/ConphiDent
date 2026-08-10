import "server-only";

export type ClinicReadinessInput = {
  brandName: string | null;
  phone: string | null;
  address: string | null;
  users: { active: boolean }[];
  services: { active: boolean }[];
  hours: { isClosed: boolean }[];
  whatsappConnection: { disconnectedAt: Date | null } | null;
};

export function getClinicReadiness(clinic: ClinicReadinessInput) {
  const checks = [
    { label: "Clinic identity", complete: Boolean(clinic.brandName?.trim() && clinic.phone?.trim() && clinic.address?.trim()), action: "Add brand, phone, and address" },
    { label: "Owner or staff access", complete: clinic.users.some((user) => user.active), action: "Create an active clinic user" },
    { label: "Bookable services", complete: clinic.services.some((service) => service.active), action: "Add at least one active service" },
    { label: "Working hours", complete: clinic.hours.some((hour) => !hour.isClosed), action: "Set at least one open day" },
    { label: "WhatsApp connection", complete: Boolean(clinic.whatsappConnection && !clinic.whatsappConnection.disconnectedAt), action: "Complete Meta WhatsApp connection" },
  ];
  const complete = checks.filter((check) => check.complete).length;
  return { checks, complete, total: checks.length, percent: Math.round((complete / checks.length) * 100) };
}
