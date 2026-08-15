export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { buildTimeSlots, defaultHours } from "@/lib/clinic-config";
import { rupees } from "@/lib/format";
import PageHeader from "@/components/lists/PageHeader";
import DeleteSubmitButton from "@/components/dashboard/DeleteSubmitButton";
import { deleteServiceAction } from "@/app/dashboard/delete-actions";
import {
  addServiceAction,
  saveHoursAction,
  saveWhatsAppCopyAction,
  toggleServiceAction,
  updateServiceAction,
} from "./actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const field =
  "min-h-11 w-full rounded-control border border-border bg-white px-3 text-sm text-foreground outline-none";
const area =
  "min-h-20 w-full rounded-control border border-border bg-white px-3 py-2.5 text-sm font-normal text-foreground outline-none";

function Card({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-card p-4.5 shadow-[var(--shadow)]">
      <h2 className="text-base font-semibold text-heading">{title}</h2>
      <p className="mt-1 text-[13px] text-text-muted">{sub}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function ClinicOperationsPage() {
  const user = await requireUser();
  if (user.role !== "OWNER") redirect("/dashboard");

  const [services, hours, whatsapp] = await Promise.all([
    prisma.clinicService.findMany({
      where: { clinicId: user.clinicId },
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.clinicHours.findMany({ where: { clinicId: user.clinicId }, orderBy: { dayOfWeek: "asc" } }),
    prisma.clinicWhatsAppSettings.findUnique({ where: { clinicId: user.clinicId } }),
  ]);
  const hourByDay = new Map(hours.map((hour) => [hour.dayOfWeek, hour]));
  const openDays = defaultHours.filter((day) => !(hourByDay.get(day.dayOfWeek) ?? day).isClosed).length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        title="Services, hours and slots"
        sub={`Open ${openDays} ${openDays === 1 ? "day" : "days"} a week. This is what decides which times a patient can pick.`}
        actions={
          <Link
            href="/dashboard/settings"
            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold text-heading hover:bg-muted"
          >
            Back to Settings
          </Link>
        }
      />

      <Card
        title="What you offer"
        sub="Only the ones switched on are offered when someone books themselves on WhatsApp."
      >
        <form action={addServiceAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">Name</span>
            <input name="name" required placeholder="e.g. Root canal" className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">A line about it</span>
            <input name="description" placeholder="Optional" className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">How long it takes</span>
            <input
              name="durationMinutes"
              type="number"
              min="15"
              step="15"
              defaultValue="30"
              className={`${field} tabular-nums`}
            />
            <span className="text-xs font-normal text-text-muted">In minutes.</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">What it costs</span>
            <input name="price" type="number" min="0" step="1" placeholder="Optional" className={`${field} tabular-nums`} />
          </label>
          <button className="min-h-11 w-fit cursor-pointer rounded-control border border-primary bg-primary px-5 text-[13px] font-semibold text-white hover:bg-primary-hover">
            Add it
          </button>
        </form>

        <div className="mt-4 overflow-hidden rounded-control border border-border">
          {services.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-text-muted">
              Nothing on the list yet. Add the first treatment above and it becomes bookable.
            </p>
          ) : (
            services.map((service) => (
              <div
                key={service.id}
                className={`border-b border-border p-3.5 last:border-b-0 ${service.active ? "" : "bg-muted/40"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-heading">
                      {service.name}
                      {!service.active && (
                        <span className="ml-2 rounded-pill bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning">
                          Switched off
                        </span>
                      )}
                    </p>
                    <p className="text-[13px] text-text-muted">
                      {[
                        service.description,
                        `${service.durationMinutes} minutes`,
                        service.price !== null ? rupees(service.price) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={toggleServiceAction}>
                      <input type="hidden" name="id" value={service.id} />
                      <input type="hidden" name="active" value={String(!service.active)} />
                      <button className="min-h-11 cursor-pointer rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold text-heading hover:bg-muted">
                        {service.active ? "Switch off" : "Switch on"}
                      </button>
                    </form>
                    <form action={deleteServiceAction}>
                      <input type="hidden" name="id" value={service.id} />
                      <DeleteSubmitButton
                        label="Remove"
                        confirmTitle={`Remove ${service.name}?`}
                        confirmMessage="It stops being offered and disappears from the booking list. Visits already booked for it keep their treatment name."
                      />
                    </form>
                  </div>
                </div>

                <details className="mt-2.5">
                  <summary className="cursor-pointer text-[13px] font-semibold text-primary">
                    Change the details
                  </summary>
                  <form
                    action={updateServiceAction}
                    className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-4"
                  >
                    <input type="hidden" name="id" value={service.id} />
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-heading">Name</span>
                      <input name="name" required defaultValue={service.name} className={field} />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-heading">A line about it</span>
                      <input name="description" defaultValue={service.description ?? ""} className={field} />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-heading">Minutes</span>
                      <input
                        name="durationMinutes"
                        type="number"
                        min="15"
                        step="15"
                        defaultValue={service.durationMinutes}
                        className={`${field} tabular-nums`}
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-heading">Cost</span>
                      <input
                        name="price"
                        type="number"
                        min="0"
                        step="1"
                        defaultValue={service.price ?? ""}
                        className={`${field} tabular-nums`}
                      />
                    </label>
                    <button className="min-h-11 w-fit cursor-pointer rounded-control border border-primary bg-primary px-5 text-[13px] font-semibold text-white hover:bg-primary-hover">
                      Save
                    </button>
                  </form>
                </details>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card
        title="When you are open"
        sub="A day with no hours set has no slots to offer — booking then falls back to typing a time by hand."
      >
        <div className="flex flex-col gap-3">
          {defaultHours.map((fallback) => {
            const hour = hourByDay.get(fallback.dayOfWeek) || fallback;
            const slots = hour.isClosed ? [] : buildTimeSlots(hour.openTime, hour.closeTime, hour.slotMinutes);
            return (
              <form
                key={fallback.dayOfWeek}
                action={saveHoursAction}
                className="grid items-end gap-3 rounded-control border border-border p-3 md:grid-cols-[140px_1fr_1fr_120px_110px_auto]"
              >
                <input type="hidden" name="dayOfWeek" value={fallback.dayOfWeek} />
                <div>
                  <span className="text-sm font-semibold text-heading">{DAYS[fallback.dayOfWeek]}</span>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {hour.isClosed
                      ? "Closed"
                      : slots.length
                        ? `${slots.length} slots · ${slots[0]} to ${slots[slots.length - 1]}`
                        : "No slots — check the times"}
                  </p>
                </div>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">
                  Opens
                  <input name="openTime" type="time" defaultValue={hour.openTime} className={`${field} tabular-nums`} />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">
                  Closes
                  <input name="closeTime" type="time" defaultValue={hour.closeTime} className={`${field} tabular-nums`} />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">
                  Slot length
                  <input
                    name="slotMinutes"
                    type="number"
                    min="15"
                    step="15"
                    defaultValue={hour.slotMinutes}
                    className={`${field} tabular-nums`}
                  />
                </label>
                <label className="flex min-h-11 items-center gap-2 text-[13px] font-semibold text-heading">
                  <input name="isClosed" type="checkbox" value="true" defaultChecked={hour.isClosed} />
                  Closed
                </label>
                <button className="min-h-11 cursor-pointer rounded-control border border-border-strong bg-card px-4 text-[13px] font-semibold text-heading hover:bg-muted">
                  Save
                </button>
              </form>
            );
          })}
        </div>
      </Card>

      <Card
        title="What WhatsApp says first"
        sub="Leave a welcome empty and the standard wording in that language is used instead."
      >
        <form action={saveWhatsAppCopyAction} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">Welcome — English</span>
            <textarea
              name="welcomeEnglish"
              defaultValue={whatsapp?.welcomeEnglish ?? ""}
              className={area}
              placeholder={`Hello, you have reached ${user.clinic.name}. How can we help?`}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">Welcome — Hindi</span>
            <textarea name="welcomeHindi" defaultValue={whatsapp?.welcomeHindi ?? ""} className={area} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">Welcome — Marathi</span>
            <textarea name="welcomeMarathi" defaultValue={whatsapp?.welcomeMarathi ?? ""} className={area} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">When they start booking</span>
            <textarea
              name="bookingIntro"
              defaultValue={whatsapp?.bookingIntro ?? ""}
              className={area}
              placeholder="Happy to book you in. What is your full name?"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">When they ask where you are</span>
            <textarea
              name="contactMessage"
              defaultValue={whatsapp?.contactMessage ?? ""}
              className={area}
              placeholder="Your address, a landmark, and the hours you are open."
            />
          </label>
          <button className="min-h-11 w-fit cursor-pointer rounded-control border border-primary bg-primary px-5 text-[13px] font-semibold text-white hover:bg-primary-hover">
            Save
          </button>
        </form>
      </Card>
    </div>
  );
}
