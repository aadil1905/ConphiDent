import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { completeEmbeddedSignup } from "@/lib/whatsapp-connection";

export async function POST(request: NextRequest) {
  try {
    const user = await requireOwner();
    const body = await request.json() as { code?: string; wabaId?: string; phoneNumberId?: string; businessId?: string };
    if (!body.code || !body.wabaId || !body.phoneNumberId) return NextResponse.json({ error: "The Meta signup session did not return all required account details." }, { status: 400 });
    await completeEmbeddedSignup({ code: body.code, clinicId: user.clinicId, wabaId: body.wabaId, phoneNumberId: body.phoneNumberId, businessId: body.businessId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Embedded Signup completion failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to connect WhatsApp." }, { status: 500 });
  }
}
