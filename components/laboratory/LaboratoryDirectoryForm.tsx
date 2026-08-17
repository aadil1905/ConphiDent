"use client";

import { saveLaboratoryAction } from "@/app/dashboard/laboratory/actions";
import { LabActionForm } from "@/components/laboratory/LabActionForm";

const field = "min-h-11 w-full rounded-control border px-3 text-sm";

export function LaboratoryDirectoryForm() {
  return <LabActionForm action={saveLaboratoryAction} label="Save laboratory" pendingLabel="Saving laboratory..." className="mt-4 grid gap-3 sm:grid-cols-2" buttonClassName="min-h-11 rounded-control bg-primary px-4 text-sm font-semibold text-primary-foreground sm:col-span-2 disabled:opacity-60">
    <label className="text-xs font-semibold">Display name<input required name="name" maxLength={200} className={`${field} mt-1`}/></label>
    <label className="text-xs font-semibold">Legal name<input name="legalName" maxLength={240} className={`${field} mt-1`}/></label>
    <label className="text-xs font-semibold">Contact person<input name="contactName" maxLength={160} className={`${field} mt-1`}/></label>
    <label className="text-xs font-semibold">Primary technician<input name="technicianName" maxLength={160} className={`${field} mt-1`}/></label>
    <label className="text-xs font-semibold sm:col-span-2">Technicians<input name="technicians" className={`${field} mt-1`} placeholder="Comma-separated names"/></label>
    <label className="text-xs font-semibold">Phone<input name="phone" inputMode="tel" className={`${field} mt-1`}/></label>
    <label className="text-xs font-semibold">WhatsApp<input name="whatsapp" inputMode="tel" className={`${field} mt-1`}/></label>
    <label className="text-xs font-semibold">Email<input name="email" type="email" maxLength={254} className={`${field} mt-1`}/></label>
    <label className="text-xs font-semibold">Normal turnaround days<input name="defaultTurnaroundDays" type="number" min="1" max="365" className={`${field} mt-1`}/></label>
    <label className="text-xs font-semibold sm:col-span-2">Address<input name="address" maxLength={1000} className={`${field} mt-1`}/></label>
    <label className="text-xs font-semibold">GSTIN / tax number<input name="gstNumber" maxLength={40} className={`${field} mt-1`}/></label>
    <label className="text-xs font-semibold">Tax configuration<input name="taxInformation" maxLength={1000} className={`${field} mt-1`}/></label>
    <label className="text-xs font-semibold sm:col-span-2">Supported services<input name="services" className={`${field} mt-1`} placeholder="Crowns, bridges, aligners…"/></label>
    <label className="text-xs font-semibold sm:col-span-2">Materials<input name="materials" className={`${field} mt-1`} placeholder="Zirconia, E-max, Co-Cr…"/></label>
    <label className="text-xs font-semibold">Pickup schedule<input name="pickupSchedule" maxLength={500} className={`${field} mt-1`}/></label>
    <label className="text-xs font-semibold">Delivery schedule<input name="deliverySchedule" maxLength={500} className={`${field} mt-1`}/></label>
    <label className="text-xs font-semibold">Preferred communication<select name="preferredCommunication" className={`${field} mt-1`}><option value="SECURE_LINK">Secure portal link</option><option value="SECURE_EMAIL">Secure email link</option><option value="WHATSAPP_LINK">WhatsApp secure link</option><option value="PRINT">Printed authorization</option></select></label>
    <label className="text-xs font-semibold">Integration type<select name="integrationType" className={`${field} mt-1`}><option value="SECURE_PORTAL">Secure ConphiDent portal</option><option value="LAB_API">Certified lab API</option><option value="SECURE_EMAIL">Secure email</option><option value="MANUAL_PRINT">Manual print</option></select></label>
    <label className="text-xs font-semibold">Quality score %<input name="qualityScore" type="number" min="0" max="100" step="0.1" className={`${field} mt-1`}/></label>
    <label className="text-xs font-semibold">Remake rate %<input name="remakeRate" type="number" min="0" max="100" step="0.1" className={`${field} mt-1`}/></label>
    <label className="text-xs font-semibold">On-time delivery %<input name="onTimeDeliveryRate" type="number" min="0" max="100" step="0.1" className={`${field} mt-1`}/></label>
    <label className="text-xs font-semibold sm:col-span-2">Data-processing notes<textarea name="dataProcessingNotes" maxLength={1500} className="mt-1 min-h-20 w-full rounded-control border px-3 py-2 text-sm"/></label>
    <label className="flex items-start gap-2 text-xs font-semibold sm:col-span-2"><input type="checkbox" name="dataProcessingAccepted" value="1"/> Contract and minimum-necessary data-processing configuration has been reviewed.</label>
    <label className="text-xs font-semibold sm:col-span-2">Internal notes<textarea name="notes" maxLength={2000} className="mt-1 min-h-20 w-full rounded-control border px-3 py-2 text-sm"/></label>
  </LabActionForm>;
}

