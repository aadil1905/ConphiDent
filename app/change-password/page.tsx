import { redirect } from "next/navigation";
import { changePasswordAction } from "@/app/login/actions";
import { getCurrentUser, PASSWORD_MIN_LENGTH } from "@/lib/auth";
import { PLATFORM_NAME } from "@/lib/platform";
import { brandFontVariables } from "@/lib/fonts";

const field =
  "mt-2 h-12 w-full rounded-control border border-border bg-card px-4 text-[15px] text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-[var(--focus-ring)]";

export default async function RequiredPasswordChangePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/dashboard");
  const params = await searchParams;

  return (
    <main className={`cf-portal ${brandFontVariables} grid min-h-screen place-items-center p-5`}>
      <section className="w-full max-w-lg rounded-card border border-border bg-card p-8 shadow-[var(--shadow-overlay)]">
        <p className="portal-kicker">
          {PLATFORM_NAME}
        </p>
        <h1 className="mt-2.5 text-[26px] leading-tight font-semibold text-heading">
          Choose your own password
        </h1>
        <p className="mt-2 text-[13px] leading-6 text-text-muted">
          You are signed in with a temporary one. Pick a password only you know, and we will take
          you straight to the workspace.
        </p>

        {params.error && (
          <p
            role="alert"
            className="mt-5 rounded-card border border-danger-border bg-danger-bg p-4 text-[13px] font-semibold text-danger"
          >
            Check the temporary password, and use at least {PASSWORD_MIN_LENGTH} characters with an
            upper-case letter, a lower-case letter and a number.
          </p>
        )}

        <form action={changePasswordAction} className="mt-7 grid gap-4">
          <label className="text-[13px] font-semibold text-heading">
            Temporary password
            <input
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              className={field}
            />
          </label>
          <label className="text-[13px] font-semibold text-heading">
            New password
            <input
              name="password"
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{12,}"
              autoComplete="new-password"
              aria-describedby="password-rule"
              className={field}
            />
            <span id="password-rule" className="mt-1.5 block text-xs font-normal text-text-muted">
              At least {PASSWORD_MIN_LENGTH} characters, with an upper-case letter, a lower-case
              letter and a number.
            </span>
          </label>
          <label className="text-[13px] font-semibold text-heading">
            New password again
            <input
              name="confirmPassword"
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{12,}"
              autoComplete="new-password"
              className={field}
            />
          </label>
          <button className="mt-2 min-h-12 cursor-pointer rounded-control bg-primary text-[13px] font-semibold text-white hover:bg-primary-hover">
            Save it and go to Today
          </button>
        </form>
      </section>
    </main>
  );
}
