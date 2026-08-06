import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { createStaffAction, toggleStaffAction, updateClinicAction } from "./actions";

const actionLabels: Record<string, string> = {
  CLINIC_PROFILE_UPDATED: "Clinic profile updated",
  STAFF_CREATED: "Staff member added",
  STAFF_ACCESS_ENABLED: "Staff access enabled",
  STAFF_ACCESS_DISABLED: "Staff access disabled",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requirePermission("manageClinic");

  const { error } = await searchParams;
  const [staff, auditLogs] = await Promise.all([
    prisma.user.findMany({
      where: { clinicId: user.clinicId },
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
    }),
    prisma.auditLog.findMany({
      where: { clinicId: user.clinicId },
      include: { user: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="dashboard-list-page mx-auto max-w-5xl space-y-6">
      <header className="dashboard-page-header">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-sky-700">Premium setup</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Clinic settings & staff access</h1>
        <p className="mt-2 text-muted-foreground">Only the clinic owner can manage clinic details and staff accounts.</p>
      </header>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">Could not add staff. Check the email is unused and the password has at least 10 characters.</p>}

      <section className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-bold">Clinic operations</h2>
        <p className="mt-1 text-sm text-muted-foreground">Configure services, working hours, booking slots and WhatsApp wording without touching code.</p>
        <Link href="/dashboard/settings/operations" className="mt-4 inline-flex rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-800">Manage clinic operations</Link>
      </section>

      <section className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-bold">WhatsApp</h2>
        <p className="mt-1 text-sm text-muted-foreground">Connect the clinic’s WhatsApp Business account through Meta without entering API credentials.</p>
        <Link href="/dashboard/settings/whatsapp" className="mt-4 inline-flex rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Open WhatsApp settings</Link>
      </section>

      <section className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-bold">Production launch</h2>
        <p className="mt-1 text-sm text-muted-foreground">Review environment setup, WhatsApp readiness, staff handover, and the production checklist before giving access to a clinic.</p>
        <Link href="/dashboard/launch" className="mt-4 inline-flex rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700">Open launch centre</Link>
      </section>

      <section className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-bold">Clinic profile</h2>
        <form action={updateClinicAction} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">Legal clinic name<input name="name" required defaultValue={user.clinic.name} className="mt-1.5 h-11 w-full rounded-xl border px-3 font-normal" /></label>
          <label className="text-sm font-semibold">Workspace display name<input name="brandName" defaultValue={user.clinic.brandName ?? ""} placeholder={user.clinic.name} className="mt-1.5 h-11 w-full rounded-xl border px-3 font-normal" /></label>
          <label className="text-sm font-semibold">Clinic phone<input name="phone" defaultValue={user.clinic.phone ?? ""} className="mt-1.5 h-11 w-full rounded-xl border px-3 font-normal" /></label>
          <label className="text-sm font-semibold">Clinic email<input name="email" type="email" defaultValue={user.clinic.email ?? ""} className="mt-1.5 h-11 w-full rounded-xl border px-3 font-normal" /></label>
          <label className="text-sm font-semibold">Clinic address<input name="address" defaultValue={user.clinic.address ?? ""} className="mt-1.5 h-11 w-full rounded-xl border px-3 font-normal" /></label>
          <button className="h-11 w-fit rounded-xl bg-sky-700 px-5 font-semibold text-white hover:bg-sky-800">Save clinic profile</button>
        </form>
      </section>

      <section className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-bold">Add staff member</h2>
        <form action={createStaffAction} className="mt-5 grid gap-4 md:grid-cols-2">
          <input name="fullName" required placeholder="Full name" className="h-11 rounded-xl border px-3" />
          <input name="email" type="email" required placeholder="Staff email" className="h-11 rounded-xl border px-3" />
          <input name="password" type="password" minLength={10} required placeholder="Temporary password (10+ characters)" className="h-11 rounded-xl border px-3" />
          <select name="role" defaultValue="RECEPTIONIST" className="h-11 rounded-xl border bg-white px-3"><option value="RECEPTIONIST">Receptionist</option><option value="DENTIST">Dentist</option></select>
          <button className="h-11 w-fit rounded-xl bg-slate-900 px-5 font-semibold text-white hover:bg-slate-700">Add staff login</button>
        </form>
      </section>

      <section className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-bold">Current access</h2>
        <div className="mt-4 divide-y">
          {staff.map((member) => (
            <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="font-semibold">{member.fullName} <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{member.role}</span></p>
                <p className="text-sm text-muted-foreground">{member.email} · {member.active ? "Active" : "Disabled"}</p>
              </div>
              {member.id !== user.id && <form action={toggleStaffAction}><input type="hidden" name="userId" value={member.id} /><input type="hidden" name="active" value={String(!member.active)} /><button className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-muted">{member.active ? "Disable" : "Enable"}</button></form>}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-bold">Recent owner activity</h2>
        <p className="mt-1 text-sm text-muted-foreground">A private record of important clinic and staff access changes.</p>
        {auditLogs.length === 0 ? (
          <p className="mt-4 rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">No activity recorded yet. Future profile and staff access changes will appear here.</p>
        ) : (
          <div className="mt-4 divide-y">
            {auditLogs.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div><p className="font-semibold">{actionLabels[entry.action] ?? entry.action}</p><p className="text-sm text-muted-foreground">{entry.detail ?? "No additional detail"} · by {entry.user?.fullName ?? "System"}</p></div>
                <time className="text-sm text-muted-foreground" dateTime={entry.createdAt.toISOString()}>{entry.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
