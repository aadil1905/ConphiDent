"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { INTAKE_LINK_DAYS } from "@/lib/patient-intake-link";
import {
 ArrowLeft,
 CheckCircle2,
 ClipboardCopy,
 ExternalLink,
 Loader2,
 MessageCircle,
 RefreshCw,
 Send,
} from "lucide-react";
import { toast } from "sonner";

type SignaturePadProps = {
 label: string;
 required?: boolean;
 onChange: (value: string) => void;
};

export function SignaturePad({ label, required, onChange }: SignaturePadProps) {
 const drawing = useRef(false);
 const pathsRef = useRef<number[][][]>([]);
 const [paths, setPaths] = useState<number[][][]>([]);

 function point(event: React.PointerEvent<SVGSVGElement>) {
 const bounds = event.currentTarget.getBoundingClientRect();
 return [
 Math.max(0, Math.min(600, ((event.clientX - bounds.left) / bounds.width) * 600)),
 Math.max(0, Math.min(180, ((event.clientY - bounds.top) / bounds.height) * 180)),
 ];
 }

 function start(event: React.PointerEvent<SVGSVGElement>) {
 event.preventDefault();
 event.currentTarget.setPointerCapture(event.pointerId);
 drawing.current = true;
 const next = [...pathsRef.current, [point(event)]];
 pathsRef.current = next;
 setPaths(next);
 }

 function move(event: React.PointerEvent<SVGSVGElement>) {
 if (!drawing.current) return;
 event.preventDefault();
 const next = pathsRef.current.map((path, index) =>
 index === pathsRef.current.length - 1 ? [...path, point(event)] : path,
 );
 pathsRef.current = next;
 setPaths(next);
 }

 function finish() {
 if (!drawing.current) return;
 drawing.current = false;
 const visible = pathsRef.current.filter((path) => path.length > 1);
 if (!visible.length) return;
 const lines = visible.map((path) =>
 `<polyline points="${path.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}" fill="none" stroke="#000000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
 ).join("");
 onChange(`data:image/svg+xml;base64,${window.btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 180" width="600" height="180"><rect width="600" height="180" fill="white"/>${lines}</svg>`)}`);
 }

 function clear() {
 drawing.current = false;
 pathsRef.current = [];
 setPaths([]);
 onChange("");
 }

 return (
 <div>
 <div className="mb-2 flex items-center justify-between">
 <span className="text-sm font-semibold">{label} {required && <span className="text-danger-mark">*</span>}</span>
 <button type="button" onClick={clear} className="text-xs font-semibold text-text-muted hover:text-heading">Clear</button>
 </div>
 <svg
 viewBox="0 0 600 180"
 preserveAspectRatio="none"
 onPointerDown={start}
 onPointerMove={move}
 onPointerUp={finish}
 onPointerLeave={finish}
 onPointerCancel={finish}
 className="block h-36 w-full cursor-crosshair touch-none select-none rounded-card border border-border bg-card shadow-inner"
 style={{ touchAction: "none" }}
 aria-label={`${label} drawing area`}
 >
 <rect width="600" height="180" fill="white" />
 {paths.map((path, index) => (
 <polyline key={index} points={path.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="#000" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
 ))}
 </svg>
 <p className="mt-2 text-xs text-text-muted">Sign using a finger, mouse, or stylus.</p>
 </div>
 );
}

type IntakeRequest = {
 id: number;
 patientId: number;
 link: string;
 status: string;
 expiresAt: string;
 warning?: string;
 openedAt?: string | null;
 completedAt?: string | null;
};

const statusStyles: Record<string, string> = {
 CREATED: "bg-muted text-foreground",
 SENT: "bg-secondary text-primary",
 OPENED: "bg-warning-bg text-warning",
 COMPLETED: "bg-success-bg text-success",
 EXPIRED: "bg-danger-bg text-danger",
};

export default function PatientIntakeWizard({ defaultName = "", defaultPhone = "" }: { defaultName?: string; defaultPhone?: string }) {
 const router = useRouter();
 const formRef = useRef<HTMLFormElement>(null);
 const [step, setStep] = useState(1);
 const [working, setWorking] = useState(false);
 const [request, setRequest] = useState<IntakeRequest | null>(null);

 const refreshStatus = useCallback(async (showToast = false) => {
 if (!request) return;
 try {
 const response = await fetch(`/api/patient-intake?id=${request.id}`, { cache: "no-store" });
 const body = await response.json();
 if (!response.ok) throw new Error(body.error || "Could not check status.");
 setRequest((current) => current ? { ...current, ...body } : current);
 if (showToast) toast.success(`Current status: ${body.status}`);
 } catch (error) {
 if (showToast) toast.error(error instanceof Error ? error.message : "Could not check status.");
 }
 }, [request]);

 useEffect(() => {
 if (step !== 2 || !request || request.status === "COMPLETED") return;
 let interval: number | undefined;
 const schedule = () => {
 if (interval) window.clearInterval(interval);
 if (!document.hidden) interval = window.setInterval(() => void refreshStatus(), 8000);
 };
 schedule();
 document.addEventListener("visibilitychange", schedule);
 return () => {
 if (interval) window.clearInterval(interval);
 document.removeEventListener("visibilitychange", schedule);
 };
 }, [step, request, refreshStatus]);

 async function createAndSend() {
 const form = formRef.current;
 if (!form || !form.reportValidity()) return;
 const data = new FormData(form);
 setWorking(true);
 try {
 const response = await fetch("/api/patient-intake", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 fullName: String(data.get("fullName") || ""),
 phone: String(data.get("phone") || ""),
 email: String(data.get("email") || ""),
 dateOfBirth: String(data.get("dateOfBirth") || ""),
 gender: String(data.get("gender") || ""),
 address: String(data.get("address") || ""),
 consentConfirmed: data.get("consentConfirmed") === "1",
 }),
 });
 const body = await response.json();
 if (!response.ok) throw new Error(body.error || "Could not create the intake request.");
 setRequest(body);
 setStep(2);
 if (body.warning) toast.warning("The secure link was created, but WhatsApp could not send it. Use Copy link.");
 else toast.success("Secure intake link sent on WhatsApp.");
 window.scrollTo({ top: 0, behavior: "smooth" });
 } catch (error) {
 toast.error(error instanceof Error ? error.message : "Could not create the intake request.");
 } finally {
 setWorking(false);
 }
 }

 async function copyLink() {
 if (!request) return;
 await navigator.clipboard.writeText(request.link);
 toast.success("Secure intake link copied.");
 }

 /** Statuses are for the database; this is what a person reads. */
const INTAKE_STATUS_WORDS: Record<string, string> = {
  CREATED: "Link made",
  SENT: "Sent to them",
  OPENED: "They opened it",
  IN_PROGRESS: "They are filling it in",
  COMPLETED: "Done — it is in their file",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

const inputClass = "mt-2 min-h-11 w-full rounded-control border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/10";

 return (
 <div className="overflow-hidden rounded-card border bg-card shadow-[var(--shadow)]">
 <div className="flex items-center justify-between gap-4 border-b bg-muted to-white px-6 py-5">
 <div>
 <p className="text-xs font-bold uppercase tracking-normal text-primary">Step {step} of 2</p>
 <h2 className="mt-1 text-xl font-bold">
 {step === 1 ? "Who are they, and where do we send it?" : "Sent — waiting on them"}
 </h2>
 </div>
 {step > 1 && (
 <button type="button" onClick={() => setStep(step - 1)} className="inline-flex min-h-10 items-center gap-2 rounded-control border bg-card px-4 text-sm font-semibold">
 <ArrowLeft className="size-4" /> Back
 </button>
 )}
 </div>

 {step === 1 && (
 <form ref={formRef} className="p-6">
 <div className="grid gap-5 md:grid-cols-2">
 <label className="text-sm font-semibold">Full name <span className="text-danger-mark">*</span><input required minLength={2} name="fullName" defaultValue={defaultName} className={inputClass} /></label>
 <label className="text-sm font-semibold">WhatsApp number <span className="text-danger-mark">*</span><input required minLength={10} name="phone" defaultValue={defaultPhone} inputMode="numeric" className={inputClass} placeholder="10-digit mobile number" /></label>
 <label className="text-sm font-semibold">Email<input name="email" type="email" className={inputClass} /></label>
 <label className="text-sm font-semibold">Date of birth<input name="dateOfBirth" type="date" className={inputClass} /></label>
 <label className="text-sm font-semibold">Gender<select name="gender" className={inputClass}><option value="">Not specified</option><option>Female</option><option>Male</option><option>Non-binary</option><option>Prefer not to say</option></select></label>
 <label className="text-sm font-semibold">Address<input name="address" className={inputClass} /></label>
 </div>
 <div className="mt-6 rounded-card border border-border bg-secondary p-4 text-sm leading-6 text-primary">
 They get a private link that works for {INTAKE_LINK_DAYS} days — allergies, medical history, the consent wording and their signature.
 </div>
 <label className="mt-4 flex items-start gap-3 rounded-card border border-success-border bg-success-bg p-4 text-sm leading-6 text-success"><input required type="checkbox" name="consentConfirmed" value="1" className="mt-1 size-4" /><span>I confirmed the patient agreed to receive this private intake link on the WhatsApp number above.</span></label>
 <div className="mt-6 flex justify-end">
 <button type="button" onClick={createAndSend} disabled={working} className="inline-flex min-h-11 items-center gap-2 rounded-control bg-primary px-6 text-sm font-semibold text-white disabled:opacity-60">
 {working ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
 Create and send on WhatsApp
 </button>
 </div>
 </form>
 )}

 {step === 2 && request && (
 <div className="space-y-5 p-6">
 <div className="rounded-card border bg-muted p-6 text-center">
 <MessageCircle className="mx-auto size-11 text-success" />
 <h3 className="mt-3 text-lg font-bold text-heading">Waiting for the patient</h3>
 <p className="mt-2 text-[13px] text-text-muted">They fill in their allergies, medical history and consent on their phone, and sign it there.</p>
 <span className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusStyles[request.status] || statusStyles.CREATED}`}>
 {INTAKE_STATUS_WORDS[request.status] ?? request.status}
 </span>
 {request.warning && <p className="mt-4 rounded-control bg-warning-bg p-3 text-sm text-warning">WhatsApp did not send it. Copy the link below and send it yourself.</p>}
 </div>
 <div className="grid gap-3 sm:grid-cols-3">
 <button type="button" onClick={copyLink} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border bg-card text-sm font-semibold"><ClipboardCopy className="size-4" /> Copy link</button>
 <a href={request.link} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border bg-card text-sm font-semibold"><ExternalLink className="size-4" /> Open on this device</a>
 <button type="button" onClick={() => refreshStatus(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border bg-card text-sm font-semibold"><RefreshCw className="size-4" /> Check status</button>
 </div>
 {request.status === "COMPLETED" && <div className="flex justify-end"><button type="button" onClick={() => router.push(`/dashboard/patients/${request.patientId}`)} className="inline-flex min-h-11 items-center gap-2 rounded-control bg-primary px-6 text-sm font-semibold text-white"><CheckCircle2 className="size-4" /> Open patient profile</button></div>}
 </div>
 )}
 </div>
 );
}
