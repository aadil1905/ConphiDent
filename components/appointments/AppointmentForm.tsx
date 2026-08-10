"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { toast } from "sonner";
import { CalendarPlus, Loader2 } from "lucide-react";

import { appointmentSchema } from "@/lib/validations";
import type { AppointmentFormValues } from "@/lib/validations";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AppointmentFormProps = {
  defaultValues?: Partial<AppointmentFormValues>;
  appointmentId?: number;
  mode?: "create" | "edit";
  providers?: Array<{ id: number; name: string }>;
  chairs?: Array<{ id: number; name: string }>;
  returnTo?: string;
};

const timeHours = Array.from({ length: 12 }, (_, index) => String(index + 1));
const timeMinutes = ["00", "15", "30", "45"];

function toTimeParts(time: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return { hour: "", minute: "", period: "AM" as const };
  const hour24 = Number(match[1]);
  return { hour: String(hour24 % 12 || 12), minute: match[2], period: hour24 >= 12 ? "PM" as const : "AM" as const };
}

function toTwentyFourHourTime(hour: string, minute: string, period: "AM" | "PM") {
  if (!hour || !minute) return "";
  const hour12 = Number(hour);
  const hour24 = period === "PM" ? (hour12 % 12) + 12 : hour12 % 12;
  return `${String(hour24).padStart(2, "0")}:${minute}`;
}

export default function AppointmentForm({
  defaultValues,
  appointmentId,
  mode = "create",
  providers = [],
  chairs = [],
  returnTo,
}: AppointmentFormProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [knownPatient, setKnownPatient] = useState<string | null>(null);

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

     appointmentDate:
  defaultValues?.appointmentDate ?? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),

      appointmentTime: defaultValues?.appointmentTime ?? "09:00",

      treatment: defaultValues?.treatment ?? "New Consultation",

      status:
        defaultValues?.status ?? "Pending",

      notes:
        defaultValues?.notes ?? "",
      providerId: defaultValues?.providerId ?? null,
      chairId: defaultValues?.chairId ?? null,
    },
  });

  useEffect(() => {
    register("status");
  }, [register]);

  const status = useWatch({ control, name: "status" });
  const phone = useWatch({ control, name: "phone" });
  const appointmentTime = useWatch({ control, name: "appointmentTime" });
  const timeParts = toTimeParts(appointmentTime);

  function updateAppointmentTime(next: Partial<typeof timeParts>) {
    const hour = next.hour ?? timeParts.hour;
    const minute = next.minute ?? timeParts.minute;
    const period = next.period ?? timeParts.period;
    setValue("appointmentTime", toTwentyFourHourTime(hour, minute, period), { shouldValidate: true, shouldDirty: true });
  }

  useEffect(() => {
    const cleanPhone = (phone || "").replace(/\D/g, "").slice(-10);
    if (cleanPhone.length !== 10 || mode === "edit") return;
    const timer = window.setTimeout(async () => {
      const response = await fetch(`/api/patients?phone=${cleanPhone}`);
      const body = await response.json();
      if (body.patient) { setKnownPatient(body.patient.fullName); setValue("patientName", body.patient.fullName, { shouldDirty: true }); setValue("treatment", "Follow Up", { shouldDirty: true }); }
      else { setKnownPatient(null); setValue("treatment", "New Consultation", { shouldDirty: true }); }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [phone, mode, setValue]);

  async function onSubmit(
    values: AppointmentFormValues
  ) {
    try {
      setLoading(true);

      const url =
        mode === "create"
          ? "/api/appointments"
          : `/api/appointments/${appointmentId}`;

      const method =
        mode === "create"
          ? "POST"
          : "PATCH";

      const response = await fetch(url, {
        method,

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error(
          "Failed to save appointment."
        );
      }
      const saved = await response.json();

      toast.success(
        mode === "create"
          ? "Appointment created successfully."
          : "Appointment updated successfully."
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
        mode === "create"
          ? "Failed to create appointment."
          : "Failed to update appointment."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="overflow-hidden rounded-3xl border border-border bg-white shadow-sm"
    >
      <div className="border-b border-border bg-gradient-to-r from-sky-50 to-white px-6 py-5">
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sky-100 text-sky-700"><CalendarPlus className="size-5" /></div>
          <div><h2 className="text-lg font-bold text-slate-950">Appointment details</h2><p className="mt-1 text-sm text-muted-foreground">Add the patient, schedule, visit reason, and booking status.</p></div>
        </div>
      </div>
      <div className="space-y-6 p-6">
      <div className="grid gap-5 md:grid-cols-2">

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-800">
            Patient name <span className="text-red-500">*</span>
          </label>

          <Input
            placeholder="John Doe"
            className="h-11 rounded-xl bg-white"
            {...register("patientName")}
          />
          {knownPatient ? <p className="text-xs font-medium text-emerald-700">Existing patient found · follow-up selected</p> : null}

          {errors.patientName && (
            <p className="text-sm text-destructive">
              {errors.patientName.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-800">
            Phone number <span className="text-red-500">*</span>
          </label>

          <Input
            placeholder="10-digit mobile number"
            className="h-11 rounded-xl bg-white"
            {...register("phone")}
          />

          {errors.phone && (
            <p className="text-sm text-destructive">
              {errors.phone.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-800">
            Appointment date <span className="text-red-500">*</span>
          </label>

          <Input
  type="date"
  lang="en-CA"
  className="h-11 rounded-xl bg-white"
  {...register("appointmentDate")}
/>
          {errors.appointmentDate && (
            <p className="text-sm text-destructive">
              {errors.appointmentDate.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-800">
            Appointment time <span className="text-red-500">*</span>
          </label>

          <div className="grid grid-cols-3 gap-2">
            <select aria-label="Appointment hour" value={timeParts.hour} onChange={(event) => updateAppointmentTime({ hour: event.target.value })} className="h-11 rounded-xl border bg-white px-3 text-sm"><option value="">Hour</option>{timeHours.map((hour) => <option key={hour} value={hour}>{hour}</option>)}</select>
            <select aria-label="Appointment minute" value={timeParts.minute} onChange={(event) => updateAppointmentTime({ minute: event.target.value })} className="h-11 rounded-xl border bg-white px-3 text-sm"><option value="">Minute</option>{timeMinutes.map((minute) => <option key={minute} value={minute}>{minute}</option>)}</select>
            <select aria-label="Appointment period" value={timeParts.period} onChange={(event) => updateAppointmentTime({ period: event.target.value as "AM" | "PM" })} className="h-11 rounded-xl border bg-white px-3 text-sm"><option value="AM">AM</option><option value="PM">PM</option></select>
          </div>
          <input type="hidden" {...register("appointmentTime")} />

          {errors.appointmentTime && (
            <p className="text-sm text-destructive">
              {errors.appointmentTime.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-800">
            Reason for visit
          </label>

          <select className="h-11 w-full rounded-xl border bg-white px-3" {...register("treatment")}><option>New Consultation</option><option>Follow Up</option><option>Emergency</option><option>Cleaning</option><option>RCT</option><option>Crown</option><option>Other</option></select>

          {errors.treatment && (
            <p className="text-sm text-destructive">
              {errors.treatment.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-800">
            Status
          </label>

          <Select
            value={status}
            onValueChange={(value) =>
              setValue(
                "status",
                value as AppointmentFormValues["status"],
                {
                  shouldValidate: true,
                  shouldDirty: true,
                }
              )
            }
          >
            <SelectTrigger className="h-11 w-full rounded-xl bg-white">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="Pending">
                Pending
              </SelectItem>

              <SelectItem value="Confirmed">
                Confirmed
              </SelectItem>

              <SelectItem value="Completed">
                Completed
              </SelectItem>

              <SelectItem value="Cancelled">
                Cancelled
              </SelectItem>
              <SelectItem value="No-show">
                No-show
              </SelectItem>
            </SelectContent>
          </Select>

          <input
            type="hidden"
            {...register("status")}
          />

          {errors.status && (
            <p className="text-sm text-destructive">
              {errors.status.message}
            </p>
          )}
        </div>

        <label className="space-y-2 text-sm font-semibold text-slate-800">Provider
          <select {...register("providerId", { setValueAs: (value) => value ? Number(value) : null })} className="h-11 w-full rounded-xl border bg-white px-3"><option value="">Unassigned</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select>
        </label>

        <label className="space-y-2 text-sm font-semibold text-slate-800">Chair
          <select {...register("chairId", { setValueAs: (value) => value ? Number(value) : null })} className="h-11 w-full rounded-xl border bg-white px-3"><option value="">Unassigned</option>{chairs.map((chair) => <option key={chair.id} value={chair.id}>{chair.name}</option>)}</select>
        </label>
      </div>
            <div className="space-y-2">
        <label className="text-sm font-semibold text-slate-800">
          Notes
        </label>

        <Textarea
          rows={5}
          placeholder="Additional notes about the appointment..."
          className="rounded-xl bg-white"
          {...register("notes")}
        />

        {errors.notes && (
          <p className="text-sm text-destructive">
            {errors.notes.message}
          </p>
        )}
      </div>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-border bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          className="h-11 rounded-xl px-5"
          onClick={() =>
            router.push(returnTo || "/dashboard/appointments")
          }
        >
          Cancel
        </Button>

        <Button
          type="submit"
          disabled={loading}
          className="h-11 rounded-xl px-6"
        >
          {loading ? <><Loader2 className="size-4 animate-spin" />{mode === "create" ? "Creating appointment..." : "Saving changes..."}</> :
            mode === "create"
              ? "Create Appointment"
              : "Save Changes"}
        </Button>
      </div>
    </form>
      );
}
