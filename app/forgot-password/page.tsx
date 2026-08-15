import Link from "next/link";
import { requestPasswordResetAction } from "@/app/login/actions";
import { PLATFORM_NAME } from "@/lib/platform";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; expired?: string }>;
}) {
  const { sent, expired } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-background p-5">
      <section className="w-full max-w-md rounded-card border border-border bg-card p-8 shadow-[var(--shadow-overlay)]">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-primary uppercase">
          {PLATFORM_NAME}
        </p>
        <h1 className="mt-2.5 text-[26px] leading-tight font-bold text-heading">
          Forgotten your password?
        </h1>

        {sent ? (
          <p className="mt-5 rounded-card border border-success-border bg-success-bg p-4 text-[13px] leading-6 text-success">
            If that email belongs to a staff account, the link is on its way. Have a look in your
            inbox, and in spam if it is not there.
          </p>
        ) : (
          <>
            <p className="mt-2 text-[13px] leading-6 text-text-muted">
              Tell us your staff email and we will send you a link. It works for 30 minutes.
            </p>
            {expired && (
              <p
                role="alert"
                className="mt-4 rounded-card border border-warning-border bg-warning-bg p-4 text-[13px] font-semibold text-warning"
              >
                That link has run out. Ask for a fresh one below.
              </p>
            )}
            <form action={requestPasswordResetAction} className="mt-7">
              <label className="text-[13px] font-semibold text-heading">
                Email address
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="name@clinic.com"
                  className="mt-2 h-12 w-full rounded-control border border-border bg-card px-4 text-[15px] text-foreground outline-none transition-colors placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-[var(--focus-ring)]"
                />
              </label>
              <button className="mt-5 min-h-12 w-full cursor-pointer rounded-control bg-primary text-[13px] font-semibold text-white hover:bg-primary-hover">
                Send me the link
              </button>
            </form>
          </>
        )}

        <Link
          href="/login"
          className="mt-7 inline-block text-[13px] font-semibold text-primary hover:underline"
        >
          ← Back to sign in
        </Link>
      </section>
    </main>
  );
}
