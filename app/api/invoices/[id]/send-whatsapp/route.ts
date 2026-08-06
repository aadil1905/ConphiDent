import { NextResponse } from "next/server";
import { clinicDisplayName, formatClinicInformation, getClinicConfiguration } from "@/lib/clinic-config";
import { prisma } from "@/lib/prisma";
import { sendTextMessage } from "@/lib/whatsapp";
import { requireApiPermission } from "@/lib/tenant";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, response } = await requireApiPermission("manageBilling");
    if (!user) return response;
    const { id } = await context.params;
    const invoiceId = Number(id);
    if (!Number.isInteger(invoiceId)) return NextResponse.json({ error: "Invalid invoice." }, { status: 400 });

    const [invoice, clinic] = await Promise.all([
      prisma.invoice.findFirst({
        where: { id: invoiceId, patient: { clinicId: user.clinicId } },
        include: {
          patient: true,
          treatmentPlan: { include: { selectedTeeth: { orderBy: { toothNumber: "asc" } } } },
          payments: true,
        },
      }),
      getClinicConfiguration(user.clinicId),
    ]);

    if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    if (!invoice.patient.phone) return NextResponse.json({ error: "Patient phone number is missing." }, { status: 400 });

    const paid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
    const outstanding = invoice.totalAmount - paid;
    const teeth = invoice.treatmentPlan?.selectedTeeth.length ? invoice.treatmentPlan.selectedTeeth.map((tooth) => tooth.toothNumber).join(", ") : invoice.treatmentPlan?.toothNumber;
    const treatmentLine = invoice.treatmentPlan ? `Treatment: ${invoice.treatmentPlan.title}${teeth ? ` (Teeth ${teeth})` : ""}` : "Treatment: Dental services";
    const dueLine = invoice.dueDate ? `Due date: ${invoice.dueDate.toLocaleDateString("en-IN")}` : "Due date: Not set";
    const message = [
      `Hello ${invoice.patient.fullName},`,
      `Your invoice ${invoice.invoiceNumber} from ${clinic ? clinicDisplayName(clinic) : "your clinic"} is ready.`,
      treatmentLine,
      `Total: Rs. ${invoice.totalAmount.toLocaleString("en-IN")}`,
      `Paid: Rs. ${paid.toLocaleString("en-IN")}`,
      `Outstanding: Rs. ${outstanding.toLocaleString("en-IN")}`,
      dueLine,
      "",
      formatClinicInformation(clinic),
      "",
      "Please reply here if you need any help.",
    ].join("\n");

    await sendTextMessage(invoice.patient.phone, message, user.clinicId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not send the invoice on WhatsApp. Check WhatsApp configuration and the patient phone number." }, { status: 500 });
  }
}
