"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import type { AppointmentFormValues } from "@/lib/validations";
import { appointmentSchema } from "@/lib/validations";
import Pending from "@/components/ui/pending";
import { useUnsavedGuard } from "@/components/ui/unsaved-guard";

type AppointmentLocation = {
  id: number;
  name: string;
  timezone?: string | null;
  active?: boolean;
  isPrimary: boolean;
  providerIds: number[];
  serviceIds: number[];
  hours: Array<{
    dayOfWeek: number;
    openTime: string;
    closeTime: string;
    slotMinutes: number;
    isClosed: boolean;
    sortOrder: number;
  }>;
};

type AppointmentFormProps = {
  defaultValues?: Partial<AppointmentFormValues>;
  appointmentId?: number;
  /**
   * The appointment as the page that rendered this form read it. Sent back on
   * save so a second person's edit cannot quietly overwrite a first one that
   * landed in between.
   */
  revision?: string;
  mode?: "create" | "edit";
  clinicTimezone?: string;
  locations?: AppointmentLocation[];
  providers?: Array<{ id: number; name: string; active?: boolean }>;
  chairs?: Array<{ id: number; name: string; active?: boolean }>;
  services?: Array<{ id: number; name: string; active?: boolean }>;
  returnTo?: string;
};

function localClock(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find((item) => item.type === type)?.value ?? ""
  );
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

function todayFor(timeZone: string) {
  try {
    return localClock(timeZone).date;
  } catch {
    return localClock("Asia/Kolkata").date;
  }
}

function displayTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return time;
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

function configuredSlots(
  location: AppointmentLocation | undefined,
  date: string,
  clinicTimezone: string,
) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!location || !match) return [];
  const parsedDate = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  ));
  if (
    parsedDate.getUTCFullYear() !== Number(match[1])
    || parsedDate.getUTCMonth() !== Number(match[2]) - 1
    || parsedDate.getUTCDate() !== Number(match[3])
  ) return [];

  const dayOfWeek = parsedDate.getUTCDay();
  const slots = Array.from(new Set(location.hours
    .filter((hours) => hours.dayOfWeek === dayOfWeek && !hours.isClosed)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .flatMap((hours) => {
      const [openHour, openMinute] = hours.openTime.split(":").map(Number);
      const [closeHour, closeMinute] = hours.closeTime.split(":").map(Number);
      const open = openHour * 60 + openMinute;
      const close = closeHour * 60 + closeMinute;
      if (
        !Number.isInteger(hours.slotMinutes)
        || hours.slotMinutes < 15
        || open >= close
      ) return [];
      const result: string[] = [];
      for (
        let current = open;
        current + hours.slotMinutes <= close;
        current += hours.slotMinutes
      ) {
        result.push(
          `${String(Math.floor(current / 60)).padStart(2, "0")}:${String(current % 60).padStart(2, "0")}`,
        );
      }
      return result;
    }))).sort();

  let current;
  try {
    current = localClock(location.timezone || clinicTimezone);
  } catch {
    return [];
  }
  if (date < current.date) return [];
  return date === current.date
    ? slots.filter((slot) => slot > current.time)
    : slots;
}

export default function AppointmentForm({
  defaultValues,
  appointmentId,
  revision,
  mode = "create",
  clinicTimezone = "Asia/Kolkata",
  locations = [],
  providers = [],
  chairs = [],
  services = [],
  returnTo,
}: AppointmentFormProps) {
  const router = useRouter();
  const { formRef: unsavedFormRef, release: releaseUnsaved, dialog: unsavedDialog } = useUnsavedGuard();
  const [loading, setLoading] = useState(false);
  const [knownPatient, setKnownPatient] = useState<string | null>(null);

  const primaryLocation = locations.find((location) => location.isPrimary) ?? locations[0];
  const initialDate = defaultValues?.appointmentDate ?? todayFor(clinicTimezone);
  const initialLocationId = defaultValues?.locationId ?? primaryLocation?.id ?? null;
  const initialLocation = locations.find((location) => location.id === initialLocationId);
  const initialTime = defaultValues?.appointmentTime
    ?? configuredSlots(initialLocation, initialDate, clinicTimezone)[0]
    ?? "";

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      patientName: defaultValues?.patientName ?? "",
      phone: defaultValues?.phone ?? "",
      appointmentDate: initialDate,
      appointmentTime: initialTime,
      treatment: defaultValues?.treatment ?? services[0]?.name ?? "New Consultation",
      status: defaultValues?.status ?? "Pending",
      notes: defaultValues?.notes ?? "",
      locationId: initialLocationId,
      providerId: defaultValues?.providerId ?? null,
      chairId: defaultValues?.chairId ?? null,
    },
  });

  useEffect(() => {
    register("status");
  }, [register]);

  const status = useWatch({ control, name: "status" });
  const phone = useWatch({ control, name: "phone" });
  const appointmentDate = useWatch({ control, name: "appointmentDate" });
  const appointmentTime = useWatch({ control, name: "appointmentTime" });
  const locationId = useWatch({ control, name: "locationId" });
  const providerId = useWatch({ control, name: "providerId" });
  const treatment = useWatch({ control, name: "treatment" });
  const selectedLocation = locations.find((location) => location.id === locationId);
  const preservingOriginalSchedule = mode === "edit"
    && locationId === initialLocationId
    && appointmentDate === initialDate;

  const availableTimes = useMemo(
    () => configuredSlots(selectedLocation, appointmentDate, clinicTimezone),
    [selectedLocation, appointmentDate, clinicTimezone],
  );
  const selectableTimes = preservingOriginalSchedule
    && appointmentTime
    && !availableTimes.includes(appointmentTime)
    ? [appointmentTime, ...availableTimes]
    : availableTimes;
  const visibleProviders = useMemo(() => providers.filter((provider) => (
    Boolean(selectedLocation?.providerIds.includes(provider.id))
    || (preservingOriginalSchedule && provider.id === providerId)
  )), [preservingOriginalSchedule, providerId, providers, selectedLocation]);
  const visibleServices = useMemo(() => {
    const assigned = selectedLocation?.serviceIds ?? [];
    return services.filter((service) => (
      (service.active !== false && (!assigned.length || assigned.includes(service.id)))
      || (preservingOriginalSchedule && service.name === treatment)
    ));
  }, [preservingOriginalSchedule, selectedLocation, services, treatment]);

  useEffect(() => {
    if (preservingOriginalSchedule && appointmentTime) return;
    if (!availableTimes.includes(appointmentTime)) {
      setValue("appointmentTime", availableTimes[0] ?? "", {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
  }, [appointmentTime, availableTimes, preservingOriginalSchedule, setValue]);

  useEffect(() => {
    if (providerId && !visibleProviders.some((provider) => provider.id === providerId)) {
      setValue("providerId", null, { shouldDirty: true });
    }
  }, [providerId, setValue, visibleProviders]);

  useEffect(() => {
    if (!visibleServices.some((service) => service.name === treatment)) {
      setValue("treatment", visibleServices[0]?.name ?? "New Consultation", {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
  }, [setValue, treatment, visibleServices]);

  useEffect(() => {
    const cleanPhone = (phone || "").replace(/\D/g, "").slice(-10);
    if (cleanPhone.length !== 10 || mode === "edit") return;
    const timer = window.setTimeout(async () => {
      const response = await fetch(`/api/patients?phone=${cleanPhone}`);
      const body = await response.json();
      const followUp = visibleServices.find((service) => /follow[ -]?up/i.test(service.name));
      const consultation = visibleServices.find((service) => /consult/i.test(service.name));
      if (body.patient) {
        setKnownPatient(body.patient.fullName);
        setValue("patientName", body.patient.fullName, { shouldDirty: true });
        if (followUp) setValue("treatment", followUp.name, { shouldDirty: true });
      } else {
        setKnownPatient(null);
        if (consultation) setValue("treatment", consultation.name, { shouldDirty: true });
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [phone, mode, setValue, visibleServices]);

  async function onSubmit(values: AppointmentFormValues) {
    try {
      setLoading(true);
      const url = mode === "create"
        ? "/api/appointments"
        : `/api/appointments/${appointmentId}`;
      const response = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        // `expectedRevision` is the appointment as this page read it. The API
        // refuses the save if somebody else has changed it since, rather than
        // letting this form's copy of every field overwrite theirs.
        body: JSON.stringify(mode === "edit" && revision ? { ...values, expectedRevision: revision } : values),
      });
      const saved = await response.json().catch(() => ({}));
      if (!response.ok) {
        // A stale save is refused rather than merged, and deliberately does not
        // refresh behind the user: the fields on screen are still their version,
        // so quietly reloading the server data would leave them looking at the
        // other person's appointment through their own form and save over it
        // anyway. The message asks them to reload, which discards this copy.
        throw new Error(saved.error || "Failed to save appointment.");
      }

      releaseUnsaved();
      toast.success(
        mode === "create"
          ? "Appointment created successfully."
          : "Appointment updated successfully.",
      );
      if (mode === "create" && saved.intakeRequired) {
        const query = new URLSearchParams({
          name: values.patientName,
          phone: values.phone.replace(/\D/g, "").slice(-10),
        });
        router.push(`/dashboard/patient-intake?${query.toString()}`);
      } else {
        router.push(returnTo || "/dashboard/appointments");
      }
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save appointment.",
      );
    } finally {
      setLoading(false);
    }
  }

  const treatmentOptions = visibleServices.length
    ? visibleServices
    : [{ id: 0, name: "New Consultation", active: true }];

  const field = "min-h-11 w-full rounded-control border border-border bg-card px-3 text-sm font-normal text-foreground outline-none";
  const labelClass = "flex flex-col gap-1.5 text-xs font-semibold text-heading";
  const errorClass = "text-[13px] font-normal text-danger";

  return (
    <form ref={unsavedFormRef} onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      {unsavedDialog}
      <section className="rounded-card border border-border bg-card px-5.5 py-4 shadow-[var(--shadow)]">
        <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">Who is coming, and when</h2>
        <p className="mt-0.5 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
          Nothing here blocks a booking — if a day has no set slots, you can still type a time.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={labelClass}>Their name<span aria-hidden className="font-normal text-danger-mark"> *</span>
            <input placeholder="Full name" className={field} {...register("patientName")} />
            {knownPatient ? <span className="text-xs font-normal text-success">We know them — details filled in.</span> : null}
            {errors.patientName ? <span className={errorClass}>{errors.patientName.message}</span> : null}
          </label>

          <label className={labelClass}>Their phone<span aria-hidden className="font-normal text-danger-mark"> *</span>
            <input placeholder="Mobile number" className={field} {...register("phone")} />
            {errors.phone ? <span className={errorClass}>{errors.phone.message}</span> : null}
          </label>

          <label className={labelClass}>Which branch<span aria-hidden className="font-normal text-danger-mark"> *</span>
            <select className={field} {...register("locationId", { setValueAs: (value) => value ? Number(value) : null })}>
              <option value="">Pick a branch</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}{location.isPrimary ? " (main)" : ""}{location.active === false ? " (closed — kept as it was)" : ""}
                </option>
              ))}
            </select>
            {errors.locationId ? <span className={errorClass}>{errors.locationId.message}</span> : null}
          </label>

          <label className={labelClass}>Which day<span aria-hidden className="font-normal text-danger-mark"> *</span>
            <input type="date" lang="en-CA" className={field} {...register("appointmentDate")} />
            {errors.appointmentDate ? <span className={errorClass}>{errors.appointmentDate.message}</span> : null}
          </label>

          {/* Booking never dead-ends: when no slots are set up for a day, the
              time becomes free text and the visit still saves. */}
          <label className={labelClass}>What time<span aria-hidden className="font-normal text-danger-mark"> *</span>
            {selectableTimes.length ? (
              <select
                className={field}
                value={appointmentTime}
                onChange={(event) => setValue("appointmentTime", event.target.value, { shouldValidate: true, shouldDirty: true })}
              >
                {selectableTimes.map((time) => (
                  <option key={time} value={time}>{displayTime(time)}</option>
                ))}
              </select>
            ) : (
              <input
                type="time"
                className={`${field} tabular-nums`}
                value={appointmentTime}
                onChange={(event) => setValue("appointmentTime", event.target.value, { shouldValidate: true, shouldDirty: true })}
              />
            )}
            <input type="hidden" {...register("appointmentTime")} />
            {!selectableTimes.length ? (
              <span className="text-[13px] font-normal text-text-muted">
                Nothing is set up for this day yet. Pick another day, or type a time here — it will still save.
              </span>
            ) : null}
            {errors.appointmentTime ? <span className={errorClass}>{errors.appointmentTime.message}</span> : null}
          </label>

          <label className={labelClass}>What for
            <select className={field} {...register("treatment")}>
              {treatmentOptions.map((service) => (
                <option key={service.id} value={service.name}>
                  {service.name}{service.active === false ? " (retired — kept as it was)" : ""}
                </option>
              ))}
            </select>
            {errors.treatment ? <span className={errorClass}>{errors.treatment.message}</span> : null}
          </label>

          <label className={labelClass}>Where it stands
            <select
              className={field}
              value={status}
              onChange={(event) => setValue("status", event.target.value as AppointmentFormValues["status"], { shouldValidate: true, shouldDirty: true })}
            >
              {(["Pending", "Confirmed", "Completed", "Cancelled", "No-show"] as const).map((item) => (
                <option key={item} value={item}>
                  {item === "Pending" ? "Not confirmed" : item === "No-show" ? "Did not come" : item}
                </option>
              ))}
            </select>
            <input type="hidden" {...register("status")} />
            {errors.status ? <span className={errorClass}>{errors.status.message}</span> : null}
          </label>

          <label className={labelClass}>Which dentist
            <select {...register("providerId", { setValueAs: (value) => value ? Number(value) : null })} className={field}>
              <option value="">Nobody yet</option>
              {visibleProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}{provider.active === false ? " (not working — kept as it was)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className={labelClass}>Which chair
            <select {...register("chairId", { setValueAs: (value) => value ? Number(value) : null })} className={field}>
              <option value="">Not decided</option>
              {chairs.map((chair) => (
                <option key={chair.id} value={chair.id}>
                  {chair.name}{chair.active === false ? " (out of use — kept as it was)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className={`${labelClass} md:col-span-2`}>Anything to note
            <textarea
              rows={4}
              maxLength={5000}
              placeholder="Anything the team should know before they arrive"
              className="rounded-control border border-border bg-card p-3 text-sm font-normal text-foreground outline-none"
              {...register("notes")}
            />
            {errors.notes ? <span className={errorClass}>{errors.notes.message}</span> : null}
          </label>
        </div>
      </section>

      <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <button
          type="button"
          disabled={loading}
          onClick={() => router.push(returnTo || "/dashboard/appointments")}
          className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-border-strong bg-card px-4 text-[13px] font-semibold text-heading hover:bg-muted disabled:opacity-60"
        >
          Go back
        </button>
        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-control border border-primary bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {loading ? (
            <Pending label={mode === "create" ? "Booking…" : "Saving…"} />
          ) : mode === "create" ? "Book it" : "Save the change"}
        </button>
      </div>
    </form>
  );
}
