"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/permissions";
import { cancelScheduledWhatsAppMessage, retryScheduledWhatsAppMessage } from "@/lib/scheduled-whatsapp";

const path = "/dashboard/whatsapp-operations";

export async function cancelScheduledMessageAction(formData: FormData) {
  const user = await requirePermission("sendWhatsApp");
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  await cancelScheduledWhatsAppMessage(id, user.clinicId);
  revalidatePath(path);
}

export async function retryScheduledMessageAction(formData: FormData) {
  const user = await requirePermission("sendWhatsApp");
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  await retryScheduledWhatsAppMessage(id, user.clinicId);
  revalidatePath(path);
}
