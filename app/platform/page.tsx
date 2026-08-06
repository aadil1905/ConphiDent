import { Building2, MessageCircle, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, PLATFORM_NAME } from "@/lib/platform";
import { createClinicAction, createClinicOwnerAction, setClinicStatusAction } from "./actions";

type PlatformSearchParams = {
  error?: string;
  created?: string;
  ownerCreated?: string;
};

function errorMessage(error: string) {
  if (error === "owner-email") return "That email already has an account. Nothing was changed.";
  if (error.startsWith("owner-")) return "Could not create the clinic owner. Check the selected clinic and all fields.";
  return "Could not create the workspace. Check the details; the clinic URL and owner email must be unique.";
}

export default async function PlatformPage({ searchParams }: { searchParams: Promise<PlatformSearchParams> }) {
  await requirePlatformAdmin();
  const [clinics, params] = await Promise.all([
    prisma.clinic.findMany({
      include: {
        _count: { select: { users: true, patients: true } },
        whatsappConnection: { select: { id: true, disconnectedAt: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    searchParams,
  ]);
  const active = clinics.filter((clinic) => clinic.status === "ACTIVE").length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-sky-700">{PLATFORM_NAME} administration</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Clinic portfolio</h1>
        <p className="mt-2 text-muted-foreground">Provision and manage isolated clinic workspaces. Credentials and patient data are never shown here.</p>
      </header>

      {params.created && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Clinic workspace “{params.created}” was created.</p>}
      {params.ownerCreated && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">A separate owner login was created for “{params.ownerCreated}”.</p>}
      {params.error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{errorMessage(params.error)}</p>}

      <section className="grid gap-4 sm:grid-cols-3">
        <Metric icon={<Building2 className="size-5 text-sky-700" />} label="Clinics" value={clinics.length} />
        <Metric icon={<Users className="size-5 text-sky-700" />} label="Active workspaces" value={active} />
        <Metric icon={<MessageCircle className="size-5 text-sky-700" />} label="WhatsApp connected" value={clinics.filter((clinic) => clinic.whatsappConnection && !clinic.whatsappConnection.disconnectedAt).length} />
      </section>

      <section className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-bold">Create clinic workspace</h2>
        <p className="mt-1 text-sm text-muted-foreground">Creates the clinic, owner login, default services/hours, WhatsApp settings, and launch checklist.</p>
        <form action={createClinicAction} className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Clinic name" name="name" />
          <Field label="Workspace URL key" name="slug" pattern="[a-zA-Z0-9 -]+" placeholder="smile-dental-pune" />
          <Field label="Owner name" name="ownerName" />
          <Field label="Owner email" name="ownerEmail" type="email" />
          <Field label="Temporary owner password" name="password" type="password" minLength={10} className="md:col-span-2" />
          <button className="h-11 w-fit rounded-xl bg-sky-700 px-5 font-semibold text-white hover:bg-sky-800">Create clinic workspace</button>
        </form>
      </section>

      <section className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-bold">Add owner to an existing clinic</h2>
        <p className="mt-1 text-sm text-muted-foreground">Use this for a clinic already in the portfolio. It adds a new owner and never changes an existing account.</p>
        <form action={createClinicOwnerAction} className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">Clinic<select required name="clinicId" className="mt-1.5 h-11 w-full rounded-xl border bg-background px-3 font-normal"><option value="">Select clinic</option>{clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.brandName || clinic.name}</option>)}</select></label>
          <Field label="Owner name" name="fullName" />
          <Field label="Owner email" name="email" type="email" />
          <Field label="Temporary owner password" name="password" type="password" minLength={10} />
          <button className="h-11 w-fit rounded-xl bg-sky-700 px-5 font-semibold text-white hover:bg-sky-800">Add clinic owner</button>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-6 py-5"><h2 className="text-xl font-bold">All clinics</h2></div>
        <div className="divide-y">
          {clinics.map((clinic) => (
            <article key={clinic.id} className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-bold">{clinic.brandName || clinic.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{clinic.slug || "No subdomain configured"} · {clinic._count.users} staff · {clinic._count.patients} patients</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">WhatsApp: {clinic.whatsappConnection && !clinic.whatsappConnection.disconnectedAt ? "Connected" : "Not connected"}</p>
              </div>
              <form action={setClinicStatusAction}>
                <input type="hidden" name="clinicId" value={clinic.id} />
                <input type="hidden" name="status" value={clinic.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} />
                <button className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-muted">{clinic.status === "ACTIVE" ? "Suspend" : "Activate"}</button>
              </form>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <article className="rounded-2xl border bg-card p-5">{icon}<p className="mt-3 text-sm text-muted-foreground">{label}</p><p className="text-3xl font-bold">{value}</p></article>;
}

function Field({ label, className = "", ...props }: { label: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <label className={`text-sm font-semibold ${className}`}>{label}<input required {...props} className="mt-1.5 h-11 w-full rounded-xl border bg-background px-3 font-normal" /></label>;
}
