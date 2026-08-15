export const dynamic = "force-dynamic";

import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, Link2 } from "lucide-react";
import { LabActionForm } from "@/components/laboratory/LabActionForm";
import { LabAttachmentUploader } from "@/components/laboratory/LabAttachmentUploader";
import { signedImagingAssetPath } from "@/lib/imaging-access";
import { signedLabAttachmentPath } from "@/lib/laboratory-access";
import { allowedLabTransitions, isLabCaseStatus, labDelayThreatensAppointment, labOrderIssues } from "@/lib/laboratory-core";
import { can, requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { approveLabCaseAction, createReworkAction, issueLabDeliveryAction, linkLabImagingAction, postClinicLabMessageAction, transitionLabCaseAction } from "../actions";

const field = "min-h-11 w-full rounded-control border border-border bg-card px-3 text-sm text-foreground outline-none";
const labelClass = "flex flex-col gap-1.5 text-xs font-semibold text-heading";
const ghostButton =
  "inline-flex min-h-11 items-center gap-2 rounded-control border border-border-strong bg-card px-4 text-[13px] font-semibold text-heading hover:bg-muted";

function formatDate(value: Date | null | undefined) {
  return value ? value.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Not recorded";
}

function plain(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

export default async function LaboratoryCasePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("manageLaboratory");
  const caseId = Number((await params).id);
  if (!Number.isInteger(caseId)) notFound();
  const item = await prisma.labCase.findFirst({
    where: { id: caseId, clinicId: user.clinicId },
    include: {
      patient: { select: { id: true, fullName: true, phone: true } }, laboratory: true,
      treatmentPlan: { select: { id: true, title: true } }, treatmentPlanItem: { select: { name: true } }, appointment: { select: { id: true, appointmentDate: true, appointmentTime: true, treatment: true } }, provider: { select: { name: true } }, approvedBy: { select: { fullName: true } },
      events: { orderBy: { createdAt: "desc" }, take: 100 }, messages: { orderBy: { createdAt: "asc" }, include: { authorUser: { select: { fullName: true } } } }, caseAttachments: { orderBy: { createdAt: "desc" } }, deliveryAttempts: { orderBy: { createdAt: "desc" }, take: 20, include: { whatsappOutbox: { select: { status: true, sentAt: true, failureReason: true } } } },
      imagingLinks: { include: { imagingStudy: { include: { assets: { where: { role: { in: ["PREVIEW", "THUMBNAIL", "ORIGINAL"] } }, take: 1 } } } } }, parentCase: { select: { id: true, orderNumber: true } }, reworks: { orderBy: { version: "desc" }, select: { id: true, orderNumber: true, status: true, version: true } },
    },
  });
  if (!item) notFound();
  const availableImaging = await prisma.imagingStudy.findMany({ where: { clinicId: user.clinicId, patientId: item.patientId, archivedAt: null, enteredInErrorAt: null, id: { notIn: item.imagingLinks.map((link) => link.imagingStudyId) } }, orderBy: { acquisitionDate: "desc" }, take: 50, select: { id: true, modality: true, description: true, acquisitionDate: true } });
  const transitions = isLabCaseStatus(item.status) ? allowedLabTransitions(item.status, "CLINIC") : [];
  const issues = labOrderIssues(item);
  const appointmentRisk = labDelayThreatensAppointment({ status: item.status, requiredAt: item.dueDate, appointmentAt: item.patientAppointmentAt });
  const mayApprove = can(user.role, "approveLabOrder");
  const mayRework = mayApprove && ["RECEIVED_BY_CLINIC", "FITTED", "COMPLETED", "REJECTED", "DELIVERED"].includes(item.status);
  const canIssueAccess = ["APPROVED", "QUEUED", "SENT", "DELIVERED_TO_ENDPOINT", "VIEWED", "CLARIFICATION_REQUESTED"].includes(item.status);

  const facts: Array<[string, string | null | undefined]> = [
    ["Dentist", item.provider?.name || item.treatingDoctor],
    ["Plan", item.treatmentPlan?.title],
    ["Plan item", item.treatmentPlanItem?.name],
    ["What it is", item.restorationType || item.caseType],
    ["Material", item.material],
    ["Shade", [item.shade, item.shadeSystem].filter(Boolean).join(" · ")],
    ["Teeth", item.teeth ? `FDI ${item.teeth}` : item.anatomicalScope],
    ["Needed back by", formatDate(item.dueDate)],
    ["Fitting visit", formatDate(item.patientAppointmentAt)],
    ["Margin", item.marginDesign || item.marginType],
    ["Pontic", item.ponticDesign],
    ["Implant system", item.implantSystem],
  ];

  return (
    <div className="flex flex-col gap-5 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/dashboard/laboratory" className="text-xs font-semibold text-primary hover:underline">
            ← Laboratory
          </Link>
          <div className="flex flex-wrap items-baseline gap-x-2.5">
            <h1 className="text-[22px] leading-tight font-bold text-heading">
              {item.caseType} for {item.patient.fullName.split(" ")[0]}
            </h1>
            <span className="inline-flex items-center rounded-pill bg-secondary px-2.5 py-0.5 text-xs font-semibold text-heading">
              {plain(item.status)}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-text-muted">
            {item.orderNumber || `LAB-${item.id}`} · version {item.version} · {item.laboratory?.name || item.labName} ·{" "}
            {item.teeth ? `FDI ${item.teeth}` : item.anatomicalScope}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/dashboard/patients/${item.patient.id}`} className={ghostButton}>Patient 360</Link>
          <Link href={`/dashboard/laboratory/${item.id}/print`} className={ghostButton}>Print the authorisation</Link>
        </div>
      </header>

      {appointmentRisk ? (
        <p className="rounded-card border border-danger-border border-l-[3px] border-l-danger-mark bg-danger-bg px-4 py-3 text-[13px] font-semibold text-danger">
          This case is running late for the fitting visit. Sort it with the lab before you move the patient.
        </p>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="rounded-card border border-border bg-card px-4.5 py-4 shadow-[var(--shadow)]">
            <h2 className="text-base font-semibold text-heading">What the lab is making</h2>
            <p className="mt-0.5 text-[13px] text-text-muted">
              You see the patient&rsquo;s name here. The lab only ever sees {item.patientSafeIdentifier}.
            </p>
            <dl className="mt-3.5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-semibold text-text-muted">{label}</dt>
                  <dd className="mt-0.5 text-[13px] font-semibold text-heading">{value || "—"}</dd>
                </div>
              ))}
            </dl>
            {item.notes || item.occlusionNotes || item.biteNotes ? (
              <div className="mt-3.5 grid gap-2.5 sm:grid-cols-3">
                {([["Instructions", item.notes], ["Occlusion", item.occlusionNotes], ["Bite and design", item.biteNotes]] as const)
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div key={label} className="rounded-chip bg-muted px-3 py-2.5 text-[13px]">
                      <p className="text-xs font-semibold text-text-muted">{label}</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-foreground">{value}</p>
                    </div>
                  ))}
              </div>
            ) : null}
          </section>

          <section className="rounded-card border border-border bg-card px-4.5 py-4 shadow-[var(--shadow)]">
            <h2 className="text-base font-semibold text-heading">Sending it to the lab</h2>
            <p className="mt-0.5 text-[13px] text-text-muted">
              They get a private page that expires in 30 days and can be pulled back. Preparing, sending,
              opening and accepting are each recorded.
            </p>
            {canIssueAccess ? (
              <LabActionForm action={issueLabDeliveryAction} label="Give the lab access" pendingLabel="Preparing…" className="mt-3.5 flex flex-col gap-3">
                <input type="hidden" name="caseId" value={item.id} />
                <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                <label className={labelClass}>How they get it
                  <select name="channel" className={field}>
                    <option value="SECURE_LINK">Make a link I will pass on</option>
                    <option value="SECURE_EMAIL">Email them the link</option>
                    <option value="WHATSAPP_LINK">Send the link on WhatsApp</option>
                  </select>
                </label>
                <label className="flex items-start gap-2 text-[13px] text-foreground">
                  <input required type="checkbox" name="minimumNecessaryConfirmed" value="1" className="mt-0.5 size-4 accent-[var(--primary)]" />
                  This page carries only what this lab needs for this case.
                </label>
              </LabActionForm>
            ) : (
              <p className="mt-3.5 rounded-chip bg-muted px-3 py-2 text-[13px] text-text-muted">
                Approve the authorisation first, then you can give the lab access.
              </p>
            )}
            <div className="mt-3.5">
              {item.deliveryAttempts.length === 0 ? (
                <p className="text-[13px] text-text-muted">Nothing has been sent yet.</p>
              ) : (
                item.deliveryAttempts.map((attempt) => (
                  <div key={attempt.id} className="flex items-center justify-between gap-3 border-t border-border/70 py-2.5 text-[13px] first:border-t-0">
                    <span className="min-w-0">
                      <span className="font-semibold text-heading">{plain(attempt.channel)}</span>
                      <span className="block text-xs text-text-muted">
                        {formatDate(attempt.createdAt)} · {attempt.endpointMasked || "private endpoint"}
                      </span>
                    </span>
                    <span className="rounded-pill bg-muted px-2.5 py-0.5 text-xs font-semibold text-heading">
                      {plain(attempt.whatsappOutbox?.status || attempt.status)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-card border border-border bg-card px-4.5 py-4 shadow-[var(--shadow)]">
            <h2 className="text-base font-semibold text-heading">Talking to the lab</h2>
            <p className="mt-0.5 text-[13px] text-text-muted">Everything said about this case stays here, both ways.</p>
            <div className="mt-3.5 flex max-h-80 flex-col gap-2.5 overflow-y-auto">
              {item.messages.length === 0 ? (
                <p className="text-[13px] text-text-muted">Nothing said yet.</p>
              ) : (
                item.messages.map((message) => (
                  <div key={message.id} className={`rounded-control px-3 py-2.5 text-[13px] ${message.authorType === "LAB" ? "bg-secondary-hover" : "bg-muted"}`}>
                    <p className="text-xs font-semibold text-text-muted">
                      {message.authorType === "LAB" ? item.labName : message.authorUser?.fullName || "Clinic"} · {formatDate(message.createdAt)}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-foreground">{message.body}</p>
                  </div>
                ))
              )}
            </div>
            <LabActionForm action={postClinicLabMessageAction} label="Send it" pendingLabel="Sending…" className="mt-3.5 flex flex-col gap-3">
              <input type="hidden" name="caseId" value={item.id} />
              <label className={labelClass}>Your message
                <textarea required minLength={2} maxLength={4000} name="body" rows={3} className="rounded-control border border-border bg-card p-3 text-sm text-foreground outline-none" placeholder="Ask about the shade, the date, anything" />
              </label>
            </LabActionForm>
          </section>

          <section className="rounded-card border border-border bg-card px-4.5 py-4 shadow-[var(--shadow)]">
            <h2 className="text-base font-semibold text-heading">Files on this case</h2>
            <p className="mt-0.5 text-[13px] text-text-muted">
              Photos, PDFs and scans (STL, OBJ, PLY). Each one is checked and stored privately.
            </p>
            <div className="mt-3.5">
              <LabAttachmentUploader caseId={item.id} />
            </div>
            <div className="mt-3.5">
              {item.caseAttachments.length === 0 ? (
                <p className="text-[13px] text-text-muted">No files yet.</p>
              ) : (
                item.caseAttachments.map((attachment) => (
                  <a
                    key={attachment.id}
                    href={signedLabAttachmentPath(attachment.id, `clinic:${user.clinicId}`)}
                    className="flex items-center justify-between gap-3 border-t border-border/70 py-2.5 text-[13px] first:border-t-0 hover:text-primary"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-heading">{attachment.originalName}</span>
                      <span className="text-xs text-text-muted">
                        {plain(attachment.category)} · {(attachment.sizeBytes / 1024 / 1024).toFixed(1)} MB
                      </span>
                    </span>
                    <FileDown className="size-4 shrink-0" aria-hidden />
                  </a>
                ))
              )}
            </div>
          </section>

          <section className="rounded-card border border-border bg-card px-4.5 py-4 shadow-[var(--shadow)]">
            <h2 className="text-base font-semibold text-heading">X-rays the lab can see</h2>
            <p className="mt-0.5 text-[13px] text-text-muted">
              Linked, never copied — the lab reaches them briefly and only through this case.
            </p>
            {availableImaging.length ? (
              <LabActionForm action={linkLabImagingAction} label="Link it" pendingLabel="Linking…" className="mt-3.5 flex flex-col gap-3">
                <input type="hidden" name="caseId" value={item.id} />
                <label className={labelClass}>Which X-ray
                  <select required name="imagingStudyId" className={field}>
                    <option value="">Pick one of this patient&rsquo;s X-rays</option>
                    {availableImaging.map((study) => (
                      <option key={study.id} value={study.id}>
                        {plain(study.modality)} · {study.acquisitionDate.toLocaleDateString("en-IN")} · {study.description || "study"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelClass}>What for
                  <select name="purpose" className={field}>
                    <option value="REFERENCE">Reference</option>
                    <option value="SHADE">Shade</option>
                    <option value="DESIGN">Design</option>
                    <option value="PRE_TREATMENT">Before treatment</option>
                    <option value="POST_TREATMENT">After treatment</option>
                  </select>
                </label>
              </LabActionForm>
            ) : null}
            <div className="mt-3.5">
              {item.imagingLinks.length === 0 ? (
                <p className="text-[13px] text-text-muted">Nothing linked.</p>
              ) : (
                item.imagingLinks.map((link) => {
                  const asset = link.imagingStudy.assets[0];
                  return (
                    <div key={link.id} className="flex items-center justify-between gap-3 border-t border-border/70 py-2.5 text-[13px] first:border-t-0">
                      <span>
                        <span className="font-semibold text-heading">{plain(link.imagingStudy.modality)}</span>
                        <span className="block text-xs text-text-muted">
                          {plain(link.purpose)} · {link.imagingStudy.acquisitionDate.toLocaleDateString("en-IN")}
                        </span>
                      </span>
                      {asset ? (
                        <a href={signedImagingAssetPath(asset.id, user.clinicId)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                          <Link2 className="size-3" aria-hidden />Open
                        </a>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {mayRework ? (
            <section className="rounded-card border border-danger-border bg-card px-4.5 py-4 shadow-[var(--shadow)]">
              <h2 className="text-base font-semibold text-heading">Send it back for a remake</h2>
              <p className="mt-0.5 text-[13px] text-text-muted">
                A new draft starts, and this case stays exactly as it is — reason, whose fault, cost and
                every file carry across.
              </p>
              <LabActionForm
                action={createReworkAction}
                label="Start the remake"
                pendingLabel="Starting…"
                navigateToCase
                className="mt-3.5 grid gap-3 sm:grid-cols-2"
                buttonClassName="min-h-11 cursor-pointer rounded-control border border-danger-border bg-card px-4 text-[13px] font-semibold text-danger hover:bg-danger-bg disabled:opacity-60 sm:col-span-2"
              >
                <input type="hidden" name="caseId" value={item.id} />
                <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                <label className={`${labelClass} sm:col-span-2`}>What went wrong *
                  <textarea required minLength={8} maxLength={1000} name="reason" rows={2} className="rounded-control border border-border bg-card p-3 text-sm text-foreground outline-none" />
                </label>
                <label className={labelClass}>Whose side
                  <select name="responsibility" className={field}>
                    <option value="UNDETERMINED">Not decided yet</option>
                    <option value="LABORATORY">The lab</option>
                    <option value="CLINIC">Us</option>
                    <option value="SHARED">Both</option>
                  </select>
                </label>
                <label className={labelClass}>New promised date *
                  <input required name="dueDate" type="date" className={field} />
                </label>
                <label className="flex min-h-11 items-center gap-2 text-[13px] font-semibold text-heading sm:col-span-2">
                  <input type="checkbox" name="chargeable" value="1" className="size-4 accent-[var(--primary)]" />
                  We are being charged for this remake
                </label>
              </LabActionForm>
            </section>
          ) : null}

          <section className="rounded-card border border-border bg-card px-4.5 py-4 shadow-[var(--shadow)]">
            <h2 className="text-base font-semibold text-heading">Everything that has happened</h2>
            <div className="mt-3.5 grid gap-2.5 lg:grid-cols-2">
              {item.events.map((event) => (
                <div key={event.id} className="rounded-control bg-muted px-3 py-2.5 text-[13px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-heading">{plain(event.type)}</span>
                    <time className="text-xs text-text-muted">{formatDate(event.createdAt)}</time>
                  </div>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {plain(event.actorType)} · {event.actorName || "system"}
                    {event.fromStatus || event.toStatus ? ` · ${plain(event.fromStatus || "—")} → ${plain(event.toStatus || "—")}` : ""}
                  </p>
                  {event.notes ? <p className="mt-1.5 text-foreground">{event.notes}</p> : null}
                </div>
              ))}
            </div>
            {item.parentCase || item.reworks.length ? (
              <div className="mt-3.5 flex flex-wrap gap-2">
                {item.parentCase ? (
                  <Link href={`/dashboard/laboratory/${item.parentCase.id}`} className={ghostButton}>
                    The original: {item.parentCase.orderNumber || item.parentCase.id}
                  </Link>
                ) : null}
                {item.reworks.map((rework) => (
                  <Link key={rework.id} href={`/dashboard/laboratory/${rework.id}`} className={ghostButton}>
                    {rework.orderNumber} · {plain(rework.status)}
                  </Link>
                ))}
              </div>
            ) : null}
          </section>
        </div>

        <aside className="flex flex-col gap-3 xl:sticky xl:top-24">
          <div className={`rounded-card border px-4 py-3.5 ${issues.length ? "border-warning-border bg-warning-bg" : "border-success-border bg-success-bg"}`}>
            <h2 className="text-[13px] font-bold text-heading">
              {issues.length ? "Before this can be approved" : "Ready to approve"}
            </h2>
            {issues.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-foreground">
                {issues.map((issue) => <li key={issue}>{issue}</li>)}
              </ul>
            ) : (
              <p className="mt-1 text-[13px] text-success">Everything the lab needs is on the case.</p>
            )}
            {["DRAFT", "REWORK"].includes(item.status) && mayApprove ? (
              <LabActionForm action={approveLabCaseAction} label="Approve it" pendingLabel="Approving…" className="mt-3.5 flex flex-col gap-3">
                <input type="hidden" name="caseId" value={item.id} />
                <label className="flex items-start gap-2 text-[13px] text-foreground">
                  <input required type="checkbox" name="approvalAttestation" value="1" className="mt-0.5 size-4 accent-[var(--primary)]" />
                  I have read the case and I am happy for it to go to the lab.
                </label>
              </LabActionForm>
            ) : item.approvedAt ? (
              <p className="mt-2 text-xs text-text-muted">
                Approved {formatDate(item.approvedAt)} by {item.approvedBy?.fullName || "an authorised dentist"}.
              </p>
            ) : null}
          </div>

          {transitions.length ? (
            <div className="rounded-card border border-border bg-card p-4 shadow-[var(--shadow)]">
              <h2 className="text-[15px] font-semibold text-heading">Move this case on</h2>
              <LabActionForm action={transitionLabCaseAction} label="Save the change" pendingLabel="Saving…" className="mt-3 flex flex-col gap-3">
                <input type="hidden" name="caseId" value={item.id} />
                <label className={labelClass}>What has happened
                  <select required name="status" className={field}>
                    <option value="">Pick one</option>
                    {transitions.map((state) => <option key={state} value={state}>{plain(state)}</option>)}
                  </select>
                </label>
                <label className={labelClass}>Why
                  <input name="reason" maxLength={1000} className={field} placeholder="Needed if you cancel or send it back" />
                </label>
              </LabActionForm>
            </div>
          ) : null}

          {item.materialBatchDetails || item.dispatchCarrier || item.dispatchTrackingNumber || item.dispatchNotes ? (
            <div className="rounded-card border border-border bg-card p-4 text-[13px] shadow-[var(--shadow)]">
              <h2 className="text-[15px] font-semibold text-heading">What the lab sent back</h2>
              {item.materialBatchDetails ? <p className="mt-1.5 text-foreground"><span className="font-semibold">Material / batch:</span> {item.materialBatchDetails}</p> : null}
              {item.dispatchCarrier || item.dispatchTrackingNumber ? (
                <p className="mt-1.5 text-foreground">
                  <span className="font-semibold">On its way:</span> {[item.dispatchCarrier, item.dispatchTrackingNumber].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              {item.dispatchNotes ? <p className="mt-1.5 whitespace-pre-wrap text-foreground">{item.dispatchNotes}</p> : null}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
