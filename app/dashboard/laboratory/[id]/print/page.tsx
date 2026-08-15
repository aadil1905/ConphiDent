export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function LabAuthorizationPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("manageLaboratory");
  const id = Number((await params).id);
  const item = Number.isInteger(id) ? await prisma.labCase.findFirst({
    where: { id, clinicId: user.clinicId },
    include: {
      clinic: { select: { name: true, brandName: true, address: true, phone: true } },
      laboratory: { select: { name: true } },
      approvedBy: { select: { fullName: true } },
    },
  }) : null;
  if (!item) notFound();
  const row = (label: string, value: string | null | undefined) => <div className="border-b py-3"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 font-semibold">{value || "—"}</p></div>;
  return <main className="mx-auto max-w-4xl bg-white p-10 text-slate-950 print:p-0">
    <header className="flex justify-between gap-6 border-b-2 border-slate-900 pb-6"><div><p className="text-sm font-bold uppercase tracking-[.2em]">Laboratory work authorization</p><h1 className="mt-2 text-3xl font-black">{item.clinic.brandName || item.clinic.name}</h1><p className="mt-1 text-sm text-slate-600">{item.clinic.address} · {item.clinic.phone}</p></div><div className="text-right"><p className="text-xl font-black">{item.orderNumber || `LAB-${item.id}`}</p><p className="text-sm">Version {item.version} · {item.status.replaceAll("_", " ")}</p><p className="mt-1 text-xs">Patient-safe ID: {item.patientSafeIdentifier}</p></div></header>
    <section className="mt-6 grid grid-cols-2 gap-x-8">{row("Laboratory", item.laboratory?.name || item.labName)}{row("Required in clinic", item.dueDate?.toLocaleDateString("en-IN"))}{row("Procedure", item.restorationType || item.caseType)}{row("FDI teeth / anatomical scope", item.teeth || item.anatomicalScope)}{row("Material", item.material)}{row("Shade", [item.shade, item.shadeSystem].filter(Boolean).join(" · "))}{row("Margin", item.marginDesign || item.marginType)}{row("Pontic", item.ponticDesign)}{row("Implant system/components", [item.implantSystem, item.implantComponents].filter(Boolean).join(" · "))}{row("Requested stages", item.requestedStages.join(", "))}</section>
    <section className="mt-6 space-y-4">{[["Instructions", item.notes], ["Occlusion", item.occlusionNotes], ["Bite / design", item.biteNotes], ["Pickup", item.pickupRequired ? item.pickupInstructions || "Pickup required" : "Not required"]].map(([label, value]) => <div key={label} className="rounded-xl border p-4"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-2 whitespace-pre-wrap text-sm">{value || "—"}</p></div>)}</section>
    <footer className="mt-10 grid grid-cols-2 gap-12"><div className="border-t pt-2 text-sm">Approved by: {item.approvedBy?.fullName || "Not yet approved"}<br/>{item.approvedAt?.toLocaleString("en-IN") || ""}</div><div className="border-t pt-2 text-sm">Laboratory acceptance / signature</div></footer>
    <p className="mt-8 rounded-xl bg-slate-100 p-3 text-sm print:hidden">Use Ctrl/Cmd + P to print or save this authorization as PDF.</p>
  </main>;
}
