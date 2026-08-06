"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { cancelScheduledWhatsAppMessage, retryScheduledWhatsAppMessage } from "@/lib/scheduled-whatsapp";

const path = "/dashboard/whatsapp-operations";

export async function cancelScheduledMessageAction(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  await cancelScheduledWhatsAppMessage(id, user.clinicId);
  revalidatePath(path);
}

export async function retryScheduledMessageAction(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  await retryScheduledWhatsAppMessage(id, user.clinicId);
  revalidatePath(path);
}
