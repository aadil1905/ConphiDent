import Link from "next/link";
import { logEnquiryAction } from "@/app/dashboard/growth/actions";

/**
 * Somebody is on the phone right now, so this asks for three things and gets
 * out of the way. It is a plain form on a URL-toggled card — it works before
 * the JavaScript lands, which is the point when the phone is ringing.
 */
export default function LogEnquiry({
  wants,
  closeHref,
  invalid,
}: {
  wants: string[];
  closeHref: string;
  invalid: boolean;
}) {
  return (
    <section className="rounded-card border border-border-strong bg-card px-5.5 py-4 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">Someone just called</h2>
          <p className="text-xs text-text-muted">
            Three fields. You can fill the rest in after you have spoken to them.
          </p>
        </div>
        <Link
          href={closeHref}
          className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3 text-xs font-semibold text-heading hover:bg-muted"
        >
          Close
        </Link>
      </div>

      {invalid && (
        <p className="mt-3 rounded-control border border-danger-border bg-danger-bg px-3 py-2 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-danger">
          Nothing was saved. A name of two letters or more and a 10-digit mobile are what we need to
          reach them.
        </p>
      )}

      <form action={logEnquiryAction} className="mt-3 flex flex-col gap-3">
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">Their name</span>
            <input
              name="fullName"
              required
              minLength={2}
              maxLength={120}
              placeholder="Kavita Shirke"
              className="min-h-11 rounded-control border border-border bg-card px-3 text-[length:var(--text-secondary)] text-foreground"
            />
            <span className="text-xs text-text-muted">A first name is enough to start.</span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">Mobile</span>
            <input
              name="phone"
              required
              inputMode="numeric"
              pattern="[0-9 +\-]{10,20}"
              title="We need 10 digits to message them."
              placeholder="98204 41127"
              className="min-h-11 rounded-control border border-border bg-card px-3 text-[length:var(--text-secondary)] tabular-nums text-foreground"
            />
            <span className="text-xs text-text-muted">We need 10 digits to message them.</span>
          </label>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-xs font-semibold text-heading">What do they want?</legend>
            <div className="flex flex-wrap gap-1.5">
              {wants.map((want, index) => (
                <label key={want} className="cursor-pointer">
                  <input
                    type="radio"
                    name="serviceInterest"
                    value={want}
                    defaultChecked={index === 0}
                    className="peer sr-only"
                  />
                  <span className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3 text-[length:var(--text-secondary)] font-semibold text-heading peer-checked:border-primary peer-checked:bg-primary-soft peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary">
                    {want}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            name="intent"
            value="queue"
            className="inline-flex min-h-11 cursor-pointer items-center rounded-control bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            Add to the queue
          </button>
          <button
            type="submit"
            name="intent"
            value="book"
            className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-border-strong bg-card px-4 text-sm font-semibold text-heading hover:bg-muted"
          >
            Add and book them now
          </button>
        </div>
        <p className="text-xs text-text-muted">
          Either way, a reminder to call them back is set for tomorrow morning.
        </p>
      </form>
    </section>
  );
}
