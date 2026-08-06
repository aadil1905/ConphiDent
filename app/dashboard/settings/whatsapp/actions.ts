"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { disconnectWhatsAppConnection, logWhatsAppTest, syncWhatsAppConnection } from "@/lib/whatsapp-connection";
import { sendTextMessage } from "@/lib/whatsapp";

const settingsPath = "/dashboard/settings/whatsapp";

export async function syncWhatsAppAction() {
  const user = await requireOwner();
  await syncWhatsAppConnection(user.clinicId);
  await recordAudit({ clinicId: user.clinicId, userId: user.id, action: "WHATSAPP_CONNECTION_SYNCED", entityType: "WHATSAPP_CONNECTION", entityId: String(user.clinicId), detail: "Refreshed connection details from Meta" });
  revalidatePath(settingsPath);
}

export async function sendWhatsAppTestAction(formData: FormData) {
  const user = await requireOwner();
  const to = String(formData.get("phone") || "").replace(/\D/g, "");
  if (to.length < 8 || to.length > 15) throw new Error("Enter a valid WhatsApp phone number with country code.");
  await sendTextMessage(to, `This is a Conphident test message from ${user.clinic.brandName || user.clinic.name}. Your WhatsApp connection is working.`, user.clinicId);
  await logWhatsAppTest(user.clinicId);
  await recordAudit({ clinicId: user.clinicId, userId: user.id, action: "WHATSAPP_TEST_SENT", entityType: "WHATSAPP_CONNECTION", entityId: String(user.clinicId), detail: `Test message sent to ending ${to.slice(-4)}` });
  revalidatePath(settingsPath);
}

export async function disconnectWhatsAppAction() {
  const user = await requireOwner();
  await disconnectWhatsAppConnection(user.clinicId);
  await recordAudit({ clinicId: user.clinicId, userId: user.id, action: "WHATSAPP_DISCONNECTED", entityType: "WHATSAPP_CONNECTION", entityId: String(user.clinicId), detail: "Disconnected by clinic owner" });
  revalidatePath(settingsPath);
}
