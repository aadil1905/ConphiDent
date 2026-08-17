import Link from "next/link";
import { Bot } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/platform";
import { setAutomationEnabledAction } from "../actions";

const TRIGGER = "WHATSAPP_INBOUND";

export default async function AutomationsPage() {
  await requirePlatformPermission("whatsapp.manage");
  const clinics = await prisma.clinic.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: {
      id: true,
      name: true,
      brandName: true,
      status: true,
      whatsappAutomations: {
        where: { trigger: TRIGGER },
        select: { id: true, enabled: true, name: true },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <main className="mx-auto max-w-6xl space-y-6 pb-12">
      <header>
        <Link href="/setup" className="text-sm font-semibold text-primary hover:underline">← Control centre</Link>
        <p className="platform-eyebrow mt-4">Operations</p>
        <h1 className="mt-1 text-3xl font-bold">Automation control centre</h1>
        <p className="mt-2 text-muted-foreground">Pause or resume each clinic&apos;s patient-facing WhatsApp reception and booking runtime.</p>
      </header>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="divide-y">
          {clinics.map((clinic) => {
            const automation = clinic.whatsappAutomations[0];
            const enabled = automation?.enabled ?? true;
            return (
              <article key={clinic.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{clinic.brandName || clinic.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    WhatsApp reception and booking · Tenant {clinic.status} · {automation ? "Managed" : "Legacy default (enabled)"}
                  </p>
                </div>
                <form action={setAutomationEnabledAction}>
                  <input type="hidden" name="clinicId" value={clinic.id} />
                  {automation ? <input type="hidden" name="automationId" value={automation.id} /> : null}
                  <input type="hidden" name="enabled" value={String(!enabled)} />
                  <button className={`rounded-xl px-4 py-2 text-sm font-bold ${enabled ? "border border-amber-300 text-amber-800" : "bg-emerald-700 text-white"}`}>
                    {enabled ? "Pause" : "Enable"}
                  </button>
                </form>
              </article>
            );
          })}
          {!clinics.length ? <p className="p-6 text-sm text-muted-foreground">No tenant clinics are available.</p> : null}
        </div>
      </section>
      <p className="flex gap-2 text-xs text-muted-foreground"><Bot className="size-4" />Every status change is recorded in the tenant audit log and enforced by the webhook runtime.</p>
    </main>
  );
}
