export const dynamic = "force-dynamic";

import Link from "next/link";
import PageIntro from "@/components/dashboard/PageIntro";
import { requireFeature } from "@/lib/features";
import { updatePrescriberProfileAction } from "./actions";

const field = "min-h-11 w-full rounded-control border border-border bg-card px-3 text-sm font-normal text-foreground outline-none";

export default async function PrescriberProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireFeature("clinical");
  const { saved, error } = await searchParams;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageIntro
          title="How you sign"
          description="This identity is frozen into every script you issue. It is yours, not the clinic's — a clinic registration cannot sign for you."
        />
        <Link href="/dashboard/prescriptions/new" className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-4 text-[13px] font-semibold text-heading hover:bg-muted">
          Back to prescribing
        </Link>
      </div>

      {saved ? (
        <p className="rounded-card border border-success-border bg-success-bg px-4 py-3 text-sm font-semibold text-success">
          Saved. Your next script signs with this.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-card border border-danger-border bg-danger-bg px-4 py-3 text-sm font-semibold text-danger">
          Your name and registration number are both needed.
        </p>
      ) : null}

      <form action={updatePrescriberProfileAction} className="rounded-card border border-border bg-card px-4.5 py-4 shadow-[var(--shadow)]">
        <h2 className="text-base font-semibold text-heading">Issuer details</h2>
        <p className="mt-0.5 text-[13px] text-text-muted">
          Needed only when signing or correcting a script. Managing sets does not need a registration number.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading sm:col-span-2">Your name *
            <input name="fullName" required minLength={2} maxLength={120} defaultValue={user.fullName} className={field} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">Qualification
            <input name="qualification" maxLength={160} defaultValue={user.qualification ?? ""} placeholder="BDS, MDS" className={field} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">Registration number *
            <input name="registrationNumber" required minLength={2} maxLength={100} defaultValue={user.registrationNumber ?? ""} placeholder="Dental council registration" className={field} />
            <span className="text-xs font-normal text-text-muted">The one issued to you personally.</span>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading sm:col-span-2">Signature line on the script
            <input name="signatureLabel" maxLength={240} defaultValue={user.signatureLabel ?? ""} placeholder={`Digitally issued by ${user.fullName}`} className={field} />
            <span className="text-xs font-normal text-text-muted">Leave it blank for the standard digitally-issued line.</span>
          </label>
          <div className="flex justify-end sm:col-span-2">
            <button className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-primary bg-primary px-5 text-[13px] font-semibold text-white hover:bg-primary-hover">
              Save how you sign
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
