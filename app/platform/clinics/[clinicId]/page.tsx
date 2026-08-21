import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, MessageCircle, Settings2 } from "lucide-react";
import { ClinicLogoUpload } from "@/components/platform/ClinicLogoUpload";
import { defaultHours } from "@/lib/clinic-config";
import { FEATURE_REGISTRY } from "@/lib/features";
import { requirePlatformPermission } from "@/lib/platform";
import { getClinicReadiness } from "@/lib/platform-readiness";
import { prisma } from "@/lib/prisma";
import {
  createLocationAction,
  deactivateLocationAction,
  saveLocationAssignmentsAction,
  saveLocationHoursAction,
  savePlatformProviderAction,
  savePlatformServiceAction,
  saveSubscriptionAction,
  setFeatureEntitlementAction,
  setPlatformProviderActiveAction,
  setPlatformServiceActiveAction,
  setPrimaryLocationAction,
  updateLocationAction,
  updatePlatformClinicProfileAction,
} from "./actions";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function ClinicControlPage({ params }: { params: Promise<{ clinicId: string }> }) {
  await requirePlatformPermission("tenant.read");
  const clinicId = Number((await params).clinicId);
  if (!Number.isInteger(clinicId)) notFound();

  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    include: {
      users: { select: { id: true, fullName: true, email: true, role: true, active: true } },
      providers: { orderBy: { name: "asc" } },
      services: { orderBy: [{ active: "desc" }, { sortOrder: "asc" }] },
      hours: true,
      locations: {
        include: { hours: true, providers: true, services: true },
        orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
      },
      subscription: { include: { plan: true } },
      featureEntitlements: true,
      whatsappConnection: { select: { disconnectedAt: true, displayPhoneNumber: true } },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 12 },
    },
  });
  if (!clinic) notFound();

  const [plans, readiness] = await Promise.all([
    prisma.subscriptionPlan.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    getClinicReadiness(clinic),
  ]);

  return (
    <main className="mx-auto max-w-7xl space-y-6 pb-10">
      <header>
        <Link href="/platform" className="text-sm font-semibold text-primary hover:underline">← All clinics</Link>
        <p className="platform-eyebrow mt-4">Clinic control</p>
        <h1 className="mt-1 text-3xl font-bold">{clinic.brandName || clinic.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tenant #{clinic.id} · {clinic.slug || "No workspace key"} · {clinic.status}
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex justify-between">
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Setup readiness</p>
              <p className="text-3xl font-bold">{readiness.percent}%</p>
            </div>
            <Settings2 className="size-7 text-primary" />
          </div>
          <div className="mt-4 h-2 rounded-full bg-muted">
            <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${readiness.percent}%` }} />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {readiness.checks.map((check) => (
              <p key={check.label} className="flex gap-2 text-sm">
                <CheckCircle2 className={`mt-0.5 size-4 ${check.complete ? "text-[var(--success)]" : "text-text-muted"}`} />
                {check.label}
              </p>
            ))}
          </div>
        </article>
        <article className="rounded-2xl border bg-card p-6 shadow-sm">
          <MessageCircle className="size-6 text-[var(--success)]" />
          <p className="mt-3 text-sm font-semibold text-muted-foreground">WhatsApp status</p>
          <p className="text-xl font-bold">
            {clinic.whatsappConnection && !clinic.whatsappConnection.disconnectedAt ? "Connected" : "Not connected"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {clinic.whatsappConnection?.displayPhoneNumber || "Connect from the tenant’s WhatsApp settings."}
          </p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card
          title="Organization and branding"
          description="Shared clinic identity for workspace, documents, and tenant-aware WhatsApp context."
        >
          <ClinicLogoUpload
            clinicId={clinic.id}
            currentLogoUrl={clinic.logoUrl}
            clinicName={clinic.brandName || clinic.name}
          />
          <form action={updatePlatformClinicProfileAction} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="clinicId" value={clinic.id} />
            <Field label="Legal name" name="name" defaultValue={clinic.name} />
            <Field label="Display name" name="brandName" defaultValue={clinic.brandName ?? ""} required={false} />
            <Field label="Workspace key" name="slug" defaultValue={clinic.slug ?? ""} />
            <Field label="Accent" name="accentColor" type="color" defaultValue={clinic.accentColor} />
            <Field label="Phone" name="phone" defaultValue={clinic.phone ?? ""} required={false} />
            <Field label="Email" name="email" type="email" defaultValue={clinic.email ?? ""} required={false} />
            <Area label="Address" name="address" defaultValue={clinic.address ?? ""} />
            <button className="platform-button platform-button--primary">Save profile</button>
          </form>
        </Card>
        <Card title="Subscription" description="Assign a platform-managed plan and tenant billing state.">
          <form action={saveSubscriptionAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="clinicId" value={clinic.id} />
            <label>
              Plan
              <select name="planId" defaultValue={clinic.subscription?.planId ?? ""}>
                <option value="">Custom / no plan</option>
                {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
              </select>
            </label>
            <label>
              Status
              <Select name="status" value={clinic.subscription?.status || "TRIAL"} options={["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"]} />
            </label>
            <label>
              Billing cycle
              <Select name="billingCycle" value={clinic.subscription?.billingCycle || "MONTHLY"} options={["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"]} />
            </label>
            <Field label="Price (minor units)" name="price" type="number" defaultValue={clinic.subscription?.price ?? ""} required={false} />
            <Area label="Internal notes" name="internalNotes" defaultValue={clinic.subscription?.internalNotes ?? ""} />
            <button className="platform-button platform-button--primary">Save subscription</button>
          </form>
        </Card>
      </section>


      <section className="grid gap-6 xl:grid-cols-2">
        <Card
          title="Doctors & providers"
          description="Canonical providers used by clinic scheduling. Deactivation preserves historical appointments."
        >
          <form action={savePlatformProviderAction} className="flex gap-2">
            <input type="hidden" name="clinicId" value={clinic.id} />
            <input required name="name" placeholder="Dr. name" className="control flex-1" />
            <button className="platform-button platform-button--primary">Add provider</button>
          </form>
          <div className="mt-4 space-y-2">
            {clinic.providers.map((provider) => (
              <div key={provider.id} className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm font-semibold">
                  {provider.name}
                  {!provider.active && <em className="ml-1 text-xs text-text-muted">inactive</em>}
                </span>
                <form action={setPlatformProviderActiveAction}>
                  <input type="hidden" name="clinicId" value={clinic.id} />
                  <input type="hidden" name="providerId" value={provider.id} />
                  <input type="hidden" name="active" value={String(!provider.active)} />
                  <button className="text-sm font-semibold text-primary hover:underline">
                    {provider.active ? "Deactivate" : "Reactivate"}
                  </button>
                </form>
              </div>
            ))}
            {!clinic.providers.length && <p className="text-sm text-muted-foreground">No providers configured.</p>}
          </div>
        </Card>

        <Card
          title="Services"
          description="Canonical services used by the SaaS, staff scheduling, and WhatsApp service menu."
        >
          <form action={savePlatformServiceAction} className="grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="clinicId" value={clinic.id} />
            <Field label="Service name" name="name" />
            <Field label="Duration (minutes)" name="durationMinutes" type="number" min="5" defaultValue="30" />
            <Area label="Description" name="description" />
            <Field label="Price (minor units)" name="price" type="number" min="0" required={false} />
            <button className="platform-button platform-button--primary">Add service</button>
          </form>
          <div className="mt-4 space-y-2">
            {clinic.services.map((service) => (
              <div key={service.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <span className="text-sm">
                  <b>{service.name}</b> · {service.durationMinutes} min
                  {!service.active && <em className="ml-1 text-text-muted">inactive</em>}
                </span>
                <form action={setPlatformServiceActiveAction}>
                  <input type="hidden" name="clinicId" value={clinic.id} />
                  <input type="hidden" name="serviceId" value={service.id} />
                  <input type="hidden" name="active" value={String(!service.active)} />
                  <button className="text-sm font-semibold text-primary hover:underline">
                    {service.active ? "Deactivate" : "Reactivate"}
                  </button>
                </form>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <Card
        title="Branches, schedules and assignment"
        description="Only active branches can be primary. Provider and service assignments are validated against this tenant."
      >
        <form action={createLocationAction} className="grid gap-3 border-b pb-5 sm:grid-cols-4">
          <input type="hidden" name="clinicId" value={clinic.id} />
          <Field label="New branch" name="name" />
          <Field label="Phone" name="phone" required={false} />
          <Field label="Address" name="address" required={false} />
          <Field label="Timezone" name="timezone" defaultValue={clinic.timezone} required={false} />
          <button className="platform-button platform-button--primary">Add branch</button>
        </form>

        <div className="mt-5 space-y-5">
          {clinic.locations.map((location) => {
            const providerIds = new Set(location.providers.map((item) => item.providerId));
            const serviceIds = new Set(location.services.map((item) => item.serviceId));
            return (
              <details key={location.id} className="rounded-xl border p-4" open={location.isPrimary}>
                <summary className="cursor-pointer font-bold">
                  {location.name}
                  {location.isPrimary && <span className="ml-2 text-xs text-[var(--gold)]">PRIMARY</span>}
                  {!location.active && <span className="ml-2 text-xs text-[var(--danger)]">INACTIVE</span>}
                </summary>
                <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(220px,1fr)_minmax(480px,2fr)_minmax(220px,1fr)]">
                  <form action={updateLocationAction} className="space-y-2">
                    <input type="hidden" name="clinicId" value={clinic.id} />
                    <input type="hidden" name="locationId" value={location.id} />
                    <Field label="Branch name" name="name" defaultValue={location.name} />
                    <Field label="Phone" name="phone" defaultValue={location.phone ?? ""} required={false} />
                    <Field label="Address" name="address" defaultValue={location.address ?? ""} required={false} />
                    <Field label="Timezone" name="timezone" defaultValue={location.timezone ?? clinic.timezone} required={false} />
                    <button className="platform-button platform-button--secondary">Save branch</button>
                  </form>

                  <div>
                    <p className="text-sm font-semibold">Branch schedule</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Green rows are stored and bookable. Amber rows are suggested defaults only until saved.
                    </p>
                    <div className="mt-2 grid gap-2">
                      {defaultHours.map((fallback) => {
                        const savedHour = location.hours.find(
                          (item) => item.dayOfWeek === fallback.dayOfWeek && item.sortOrder === 0,
                        );
                        const hour = savedHour ?? fallback;
                        return (
                          <form
                            key={fallback.dayOfWeek}
                            action={saveLocationHoursAction}
                            className={`grid gap-2 rounded-lg border p-2 text-xs sm:grid-cols-[82px_1fr_1fr_72px_84px_auto] sm:items-center ${
                              savedHour
                                ? "border-[var(--success-border)] bg-[var(--success-bg)]"
                                : "border-[var(--warning-border)] bg-[var(--warning-bg)]"
                            }`}
                          >
                            <input type="hidden" name="clinicId" value={clinic.id} />
                            <input type="hidden" name="locationId" value={location.id} />
                            <input type="hidden" name="dayOfWeek" value={fallback.dayOfWeek} />
                            <span className="font-semibold">
                              {days[fallback.dayOfWeek].slice(0, 3)}
                              <span className={`mt-1 block text-[10px] font-bold uppercase ${savedHour ? "text-[var(--success)]" : "text-[var(--warning)]"}`}>
                                {savedHour ? (hour.isClosed ? "Saved · Closed" : "Saved · Open") : "Not configured"}
                              </span>
                            </span>
                            <input
                              aria-label={`${days[fallback.dayOfWeek]} opening time`}
                              name="openTime"
                              type="time"
                              required
                              defaultValue={hour.openTime}
                              className="control"
                            />
                            <input
                              aria-label={`${days[fallback.dayOfWeek]} closing time`}
                              name="closeTime"
                              type="time"
                              required
                              defaultValue={hour.closeTime}
                              className="control"
                            />
                            <input
                              aria-label={`${days[fallback.dayOfWeek]} slot minutes`}
                              name="slotMinutes"
                              type="number"
                              min="15"
                              max="240"
                              step="15"
                              required
                              defaultValue={hour.slotMinutes}
                              className="control"
                            />
                            <label className="flex items-center gap-1 font-semibold">
                              <input name="isClosed" type="checkbox" value="true" defaultChecked={hour.isClosed} />
                              Closed
                            </label>
                            <button className="platform-button platform-button--secondary">Save</button>
                          </form>
                        );
                      })}
                    </div>
                  </div>

                  <form action={saveLocationAssignmentsAction}>
                    <input type="hidden" name="clinicId" value={clinic.id} />
                    <input type="hidden" name="locationId" value={location.id} />
                    <p className="text-sm font-semibold">Available at branch</p>
                    <fieldset className="mt-2 space-y-1">
                      <legend className="text-xs text-muted-foreground">Providers</legend>
                      {clinic.providers.map((provider) => (
                        <label key={provider.id} className="block text-sm">
                          <input name="providerIds" type="checkbox" value={provider.id} defaultChecked={providerIds.has(provider.id)} className="mr-2" />
                          {provider.name}
                        </label>
                      ))}
                    </fieldset>
                    <fieldset className="mt-3 space-y-1">
                      <legend className="text-xs text-muted-foreground">Services</legend>
                      {clinic.services.filter((service) => service.active).map((service) => (
                        <label key={service.id} className="block text-sm">
                          <input name="serviceIds" type="checkbox" value={service.id} defaultChecked={serviceIds.has(service.id)} className="mr-2" />
                          {service.name}
                        </label>
                      ))}
                    </fieldset>
                    <button className="secondary mt-3">Save assignments</button>
                  </form>
                </div>

                <div className="mt-4 flex gap-3">
                  {!location.isPrimary && location.active && (
                    <form action={setPrimaryLocationAction}>
                      <input type="hidden" name="clinicId" value={clinic.id} />
                      <input type="hidden" name="locationId" value={location.id} />
                      <button className="platform-button platform-button--secondary">Make primary</button>
                    </form>
                  )}
                  {!location.isPrimary && location.active && (
                    <form action={deactivateLocationAction}>
                      <input type="hidden" name="clinicId" value={clinic.id} />
                      <input type="hidden" name="locationId" value={location.id} />
                      <button className="text-sm font-semibold text-[var(--danger)]">Deactivate branch</button>
                    </form>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </Card>

      <Card title="Feature access" description="Tenant overrides are authoritative and enforced by server-side feature guards.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(FEATURE_REGISTRY).map(([key, feature]) => {
            const override = clinic.featureEntitlements.find((item) => item.featureKey === key);
            const enabled = override?.enabled ?? feature.defaultEnabled;
            return (
              <form action={setFeatureEntitlementAction} key={key} className="flex items-center justify-between rounded-lg border p-3">
                <input type="hidden" name="clinicId" value={clinic.id} />
                <input type="hidden" name="featureKey" value={key} />
                <input type="hidden" name="enabled" value={String(!enabled)} />
                <span className="text-sm font-semibold">{feature.label}</span>
                <button className={enabled ? "text-[var(--success)]" : "text-text-muted"}>{enabled ? "Enabled" : "Disabled"}</button>
              </form>
            );
          })}
        </div>
      </Card>
    </main>
  );
}

function Card({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, required = true, ...props }: { label: string; required?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <input required={required} {...props} className="control mt-1 block w-full" />
    </label>
  );
}

function Area({ label, ...props }: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="text-sm font-semibold sm:col-span-2">
      {label}
      <textarea {...props} className="mt-1 block min-h-20 w-full rounded-lg border bg-background p-2 font-normal" />
    </label>
  );
}

function Select({ name, value, options }: { name: string; value: string; options: string[] }) {
  return (
    <select name={name} defaultValue={value}>
      {options.map((option) => <option key={option}>{option}</option>)}
    </select>
  );
}
