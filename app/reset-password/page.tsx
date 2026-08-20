import Link from "next/link";
import { resetPasswordAction } from "@/app/login/actions";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth";
import { PLATFORM_NAME } from "@/lib/platform";
import { brandFontVariables } from "@/lib/fonts";

const field =
  "mt-2 h-12 w-full rounded-control border border-border bg-card px-4 text-[15px] text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-[var(--focus-ring)]";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  if (!token) {
    return (
      <main className={`cf-portal ${brandFontVariables} grid min-h-screen place-items-center p-5`}>
        <section className="w-full max-w-md rounded-card border border-border bg-card p-8 text-center shadow-[var(--shadow-overlay)]">
          <h1 className="text-[22px] leading-tight font-semibold text-heading">
            That reset link isn&rsquo;t valid
          </h1>
          <p className="mt-2 text-[13px] leading-6 text-text-muted">
            It may have already been used, or the address got cut short in an email.
          </p>
          <Link
            href="/forgot-password"
            className="mt-6 inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover"
          >
            Ask for a new link
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className={`cf-portal ${brandFontVariables} grid min-h-screen place-items-center p-5`}>
      <section className="w-full max-w-md rounded-card border border-border bg-card p-8 shadow-[var(--shadow-overlay)]">
        <p className="portal-kicker">
          {PLATFORM_NAME}
        </p>
        <h1 className="mt-2.5 text-[26px] leading-tight font-semibold text-heading">
          Choose a new password
        </h1>
        <p className="mt-2 text-[13px] leading-6 text-text-muted">
          At least {PASSWORD_MIN_LENGTH} characters, with an upper-case letter, a lower-case letter
          and a number. You will be signed out on your other devices.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-card border border-danger-border bg-danger-bg p-4 text-[13px] font-semibold text-danger"
          >
            Both passwords need to match, and use at least {PASSWORD_MIN_LENGTH} characters with an
            upper-case letter, a lower-case letter and a number.
          </p>
        )}

        <form action={resetPasswordAction} className="mt-7 flex flex-col gap-5">
          <input type="hidden" name="token" value={token} />
          <label className="block text-[13px] font-semibold text-heading">
            New password
            <input
              name="password"
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              className={field}
            />
          </label>
          <label className="block text-[13px] font-semibold text-heading">
            New password again
            <input
              name="confirmPassword"
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              className={field}
            />
          </label>
          <button className="min-h-12 w-full cursor-pointer rounded-control bg-primary text-[13px] font-semibold text-white hover:bg-primary-hover">
            Save the new password
          </button>
        </form>

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
