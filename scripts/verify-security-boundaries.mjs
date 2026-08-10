import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

const checks = [
  ["app/api/chat/route.ts", "requireApiFeature(\"ai_coach\")"],
  ["app/api/clinical-records/route.ts", "clinicId: user.clinicId"],
  ["app/api/clinical-records/route.ts", "action: \"CLINICAL_RECORD_CREATED\""],
  ["app/api/clinical-records/[id]/route.ts", "action: \"CLINICAL_RECORD_UPDATED\""],
  ["app/api/prescriptions/route.ts", "action: \"PRESCRIPTION_CREATED\""],
  ["app/api/prescriptions/[id]/route.ts", "action: \"PRESCRIPTION_UPDATED\""],
  ["app/api/invoices/route.ts", "clinicId: user.clinicId"],
  ["app/api/invoices/route.ts", "action: \"INVOICE_CREATED\""],
  ["app/api/invoices/[id]/payments/route.ts", "patient: { clinicId: user.clinicId }"],
  ["app/api/invoices/[id]/payments/route.ts", "action: \"PAYMENT_RECORDED\""],
  ["app/api/invoices/[id]/send-whatsapp/route.ts", "patient: { clinicId: user.clinicId }"],
  ["app/api/webhook/route.ts", "x-hub-signature-256"],
  ["app/platform/actions.ts", "requirePlatformAdmin"],
  ["app/platform/page.tsx", "requirePlatformAdmin"],
  ["lib/auth.ts", "session.user.clinic.status !== \"ACTIVE\""],
  ["lib/whatsapp.ts", "runWithWhatsAppClinic"],
  ["lib/booking.ts", "appointmentForWhatsAppContact"],
  ["app/dashboard/billing/[id]/page.tsx", "patient: { clinicId: user.clinicId }"],
  ["app/dashboard/billing/page.tsx", "patient: { clinicId: user.clinicId }"],
  ["app/dashboard/billing/new/page.tsx", "clinicId: user.clinicId"],
  ["app/dashboard/analytics/page.tsx", "invoice: { patient: { clinicId: user.clinicId } }"],
  ["app/dashboard/page.tsx", "clinicId: user.clinicId"],
  ["app/dashboard/clinical-workspace/[patientId]/page.tsx", "clinicId: user.clinicId"],
  ["app/dashboard/clinical-workspace/actions.ts", "where: { id: patientId, clinicId: user.clinicId }"],
  ["app/dashboard/clinical-workspace/actions.ts", "action: \"DENTAL_CHART_UPDATED\""],
  ["app/dashboard/operations/actions.ts", "patient: { clinicId: user.clinicId }"],
  ["app/dashboard/clinical-records/[id]/edit/page.tsx", "patient: { clinicId: user.clinicId }"],
  ["app/dashboard/clinical-records/page.tsx", "patient: { clinicId: user.clinicId }"],
  ["app/dashboard/clinical-records/new/page.tsx", "clinicId: user.clinicId"],
  ["app/dashboard/prescriptions/new/page.tsx", "clinicId: user.clinicId"],
  ["app/dashboard/treatment-plans/new/page.tsx", "clinicId: user.clinicId"],
  ["app/dashboard/treatment-plans/page.tsx", "patient: { clinicId: user.clinicId }"],
  ["app/api/public-intake/[token]/route.ts", "status: { notIn: [\"COMPLETED\", \"REVIEWED\"] }"],
  ["app/dashboard/patients/[id]/page.tsx", "clinicId: user.clinicId"],
  ["app/dashboard/patients/[id]/edit/page.tsx", "clinicId: user.clinicId"],
  ["proxy.ts", "const publicApi = [\"/api/webhook\", \"/api/health\", \"/api/cron/booking-reminders\", \"/api/cron/follow-ups\", \"/api/cron/whatsapp-outbox\", \"/api/public-intake\", \"/api/demo-requests\"]"],
];

const failures = checks.flatMap(([file, expected]) => {
  const contents = readFileSync(resolve(root, file), "utf8");
  return contents.includes(expected) ? [] : [`${file} is missing the required security boundary: ${expected}`];
});

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Verified ${checks.length} security boundaries.`);
