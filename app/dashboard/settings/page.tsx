export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { exactStamp, humanLabel, humanTime } from "@/lib/format";
import WorkPage from "@/components/lists/WorkPage";
import { createStaffAction, toggleStaffAction, updateClinicAction } from "./actions";

const TABS = [
  { key: "clinic", label: "The clinic" },
  { key: "people", label: "People" },
  { key: "sending", label: "Sending and money" },
  { key: "records", label: "Records and safety" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const ACTION_WORDS: Record<string, string> = {
  CLINIC_PROFILE_UPDATED: "Clinic details changed",
  BILLING_IDENTITY_UPDATED: "Billing identity changed",
  STAFF_CREATED: "Someone was given a login",
  STAFF_ACCESS_ENABLED: "A login was switched back on",
  STAFF_ACCESS_DISABLED: "A login was switched off",
};

/**
 * Roles named by what the person can actually do. Every one of these is already
 * accepted by createStaffAction — the picker just never offered them.
 */
const ROLE_CHOICES = [
  { value: "RECEPTIONIST", label: "Front desk", note: "Book, register, message and take payments" },
  { value: "ASSISTANT", label: "Chairside assistant", note: "Help with charting, notes and lab work" },
  { value: "DENTIST", label: "Dentist", note: "Chart, prescribe and sign clinical records" },
  { value: "BILLING", label: "Billing", note: "Raise and settle bills, nothing clinical" },
  { value: "INVENTORY", label: "Stock", note: "Supplies, suppliers and the day sheet" },
  { value: "LAB", label: "Laboratory", note: "Lab cases only" },
  { value: "AUDITOR", label: "Auditor", note: "Read the records and exports, change nothing" },
  { value: "ADMINISTRATOR", label: "Everything, including money", note: "Same as you. Give this rarely." },
] as const;

const ROLE_WORDS = new Map<string, string>([
  ["OWNER", "Everything, including money"],
  ...ROLE_CHOICES.map((choice) => [choice.value, choice.label] as [string, string]),
]);

function Card({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-card p-5.5 shadow-[var(--shadow)]">
      <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">{title}</h2>
      {sub && <p className="mt-1 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function LinkCard({ title, sub, href, label }: { title: string; sub: string; href: string; label: string }) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-card p-5.5 shadow-[var(--shadow)]">
      <div className="min-w-0">
        <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">{title}</h2>
        <p className="mt-1 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">{sub}</p>
      </div>
      <Link
        href={href}
        className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-4 text-[13px] font-semibold text-heading hover:bg-muted"
      >
        {label}
      </Link>
    </section>
  );
}

const field =
  "min-h-11 w-full rounded-control border border-border bg-card px-3 text-sm font-normal text-foreground";

/** What a refused save actually means, in the words of the thing refused. */
const REFUSALS: Record<string, string> = {
  staff:
    "That login could not be created. Check the email is not already in use, and use a password of at least 12 characters with upper and lower case letters plus a number.",
  self: "Nothing changed. You cannot switch off your own login from here — it would lock you out of the clinic.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const user = await requirePermission("manageClinic");
  const params = await searchParams;
  const tab: Tab = TABS.some((item) => item.key === params.tab) ? (params.tab as Tab) : "clinic";
  const now = new Date();

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

  const tabHref = (key: Tab) => (key === "clinic" ? "/dashboard/settings" : `/dashboard/settings?tab=${key}`);

  return (
    <WorkPage
      title="Settings"
      sub="Everything about how the clinic runs, in one place. Only you can see this page, and every change is logged."
    >
      {REFUSALS[params.error ?? ""] && (
        <p
          role="alert"
          className="rounded-control border border-danger-border bg-danger-bg px-3.5 py-3 text-[13px] text-danger"
        >
          {REFUSALS[params.error ?? ""]}
        </p>
      )}

      <div role="tablist" aria-label="Settings sections" className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={tabHref(item.key)}
            role="tab"
            aria-selected={tab === item.key}
            className={`inline-flex min-h-11 flex-none items-center border-b-2 px-3.5 text-[13px] font-semibold ${
              tab === item.key
                ? "border-b-primary text-heading"
                : "border-b-transparent text-text-muted hover:text-heading"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {tab === "clinic" && (
        <>
          <Card
            title="Clinic details"
            sub="The name, address and numbers patients see on everything you send them."
          >
            <form action={updateClinicAction} className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">
                Legal clinic name
                <input name="name" required defaultValue={user.clinic.name} className={field} />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">
                What staff see in the corner
                <input
                  name="brandName"
                  defaultValue={user.clinic.brandName ?? ""}
                  placeholder={user.clinic.name}
                  className={field}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">
                Clinic phone
                <input name="phone" defaultValue={user.clinic.phone ?? ""} className={field} />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">
                Clinic email
                <input name="email" type="email" defaultValue={user.clinic.email ?? ""} className={field} />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading sm:col-span-2">
                Address
                <input name="address" defaultValue={user.clinic.address ?? ""} className={field} />
              </label>
              <button className="min-h-11 w-fit cursor-pointer rounded-control border border-primary bg-primary px-5 text-[13px] font-semibold text-white hover:bg-primary-hover">
                Save
              </button>
            </form>
          </Card>

          <LinkCard
            title="Services, hours and slots"
            sub="What you offer, when you are open, and how long each treatment takes."
            href="/dashboard/settings/operations"
            label="Open"
          />
          <LinkCard
            title="Getting the clinic live"
            sub="The checklist before you hand the workspace to a clinic — WhatsApp, staff logins, and the rest."
            href="/dashboard/launch"
            label="Open the checklist"
          />
        </>
      )}

      {tab === "people" && (
        <>
          <Card
            title="Give someone a login"
            sub="The password you type here only gets them through the door once — they are asked to choose their own before they can do anything."
          >
            <form action={createStaffAction} className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">
                Full name
                <input name="fullName" required placeholder="e.g. Aditi Kulkarni" className={field} />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">
                Their email
                <input name="email" type="email" required className={field} />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">
                A password to get them started
                <input name="password" type="password" minLength={12} required className={field} />
                <span className="font-normal text-text-muted">
                  At least 12 characters, with upper and lower case and a number.
                </span>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading md:col-span-2">
                What should they be able to do?
                <select name="role" defaultValue="RECEPTIONIST" className={field}>
                  {ROLE_CHOICES.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label} — {choice.note.toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
              <button className="min-h-11 w-fit cursor-pointer rounded-control border border-primary bg-primary px-5 text-[13px] font-semibold text-white hover:bg-primary-hover">
                Add the login
              </button>
            </form>
          </Card>

          <Card title="Who can get in" sub="Switching someone off stops them signing in; nothing they wrote is touched.">
            <div className="flex flex-col">
              {staff.map((member) => (
                <div
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3 first:border-t-0 first:pt-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-heading">
                      {member.fullName}
                      <span className="ml-2 rounded-pill bg-muted px-2 py-0.5 text-[11px] font-semibold text-text-muted">
                        {ROLE_WORDS.get(member.role) ?? humanLabel(member.role)}
                      </span>
                    </p>
                    <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
                      {member.email} ·{" "}
                      <span className={member.active ? "text-success" : "text-danger"}>
                        {member.id === user.id
                          ? "that is you"
                          : member.active
                            ? "can sign in"
                            : "cannot sign in"}
                      </span>
                    </p>
                    <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
                      {member.lastLoginAt ? (
                        <>
                          Last signed in{" "}
                          <time
                            dateTime={member.lastLoginAt.toISOString()}
                            title={exactStamp(member.lastLoginAt)}
                          >
                            {humanTime(member.lastLoginAt, now)}
                          </time>
                        </>
                      ) : (
                        "Has never signed in"
                      )}
                    </p>
                  </div>
                  {member.id !== user.id && (
                    <form action={toggleStaffAction}>
                      <input type="hidden" name="userId" value={member.id} />
                      <input type="hidden" name="active" value={String(!member.active)} />
                      <button className="min-h-11 cursor-pointer rounded-control border border-border-strong bg-card px-4 text-[13px] font-semibold text-heading hover:bg-muted">
                        {member.active ? "Switch off" : "Switch back on"}
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <LinkCard
            title="Your own sign-in"
            sub="Change your password and sign out anywhere else you are still logged in."
            href="/dashboard/settings/security"
            label="Open"
          />
        </>
      )}

      {tab === "sending" && (
        <>
          <LinkCard
            title="WhatsApp"
            sub="Connect the clinic's WhatsApp Business account through Meta. No API keys to copy."
            href="/dashboard/settings/whatsapp"
            label="Open"
          />
          <LinkCard
            title="Billing identity"
            sub="GSTIN, numbering, and how patients can pay you — printed on every invoice."
            href="/dashboard/settings/billing"
            label="Open"
          />
        </>
      )}

      {tab === "records" && (
        <>
          <LinkCard
            title="Take your data out"
            sub="Patients, visits, invoices and clinical notes as spreadsheets you can keep."
            href="/dashboard/exports"
            label="Open exports"
          />
          <LinkCard
            title="How things work here"
            sub="Short answers to the things people ask most often."
            href="/dashboard/help"
            label="Open"
          />

          <Card
            title="What has changed recently"
            sub="A private list of clinic and login changes, kept so you can always see who did what."
          >
            {auditLogs.length === 0 ? (
              <p className="rounded-control bg-muted p-3.5 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
                Nothing yet. Changes to the clinic or to logins will show up here.
              </p>
            ) : (
              <div className="flex flex-col">
                {auditLogs.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-wrap items-start justify-between gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-heading">
                        {ACTION_WORDS[entry.action] ?? humanLabel(entry.action)}
                      </p>
                      <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
                        {entry.detail ?? "No detail written down"} · {entry.user?.fullName ?? "the system"}
                      </p>
                    </div>
                    <time
                      className="text-[13px] text-text-muted"
                      dateTime={entry.createdAt.toISOString()}
                      title={exactStamp(entry.createdAt)}
                    >
                      {humanTime(entry.createdAt, now)}
                    </time>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </WorkPage>
  );
}
