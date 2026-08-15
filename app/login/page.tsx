import { LockKeyhole, Mail, ShieldCheck, Stethoscope } from "lucide-react";
import Link from "next/link";
import LoginSubmitButton from "@/components/auth/LoginSubmitButton";
import { loginAction } from "./actions";
import { PLATFORM_NAME, tenantFromRequestHost } from "@/lib/platform";

const field =
  "h-12 w-full rounded-control border border-border bg-card pr-4 pl-11 text-[15px] text-foreground outline-none transition-colors placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-[var(--focus-ring)]";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, tenant] = await Promise.all([searchParams, tenantFromRequestHost()]);
  const workspaceName = tenant?.brandName || tenant?.name || PLATFORM_NAME;

  return (
    <main className="relative min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="relative mx-auto grid min-h-[calc(100vh-2rem)] max-w-6xl overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow-overlay)] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden bg-heading p-10 text-white lg:flex lg:flex-col">
          <div className="relative">
            <span className="inline-flex size-12 items-center justify-center rounded-control border border-white/20 bg-white/10">
              <Stethoscope className="size-6" aria-hidden />
            </span>
            <p className="mt-8 text-[11px] font-semibold tracking-[0.08em] text-secondary uppercase">
              Clinical workspace
            </p>
            <h1 className="mt-3 max-w-md text-[34px] leading-tight font-bold">{workspaceName}</h1>
            <p className="mt-4 max-w-md text-[15px] leading-7 text-white/75">
              A quiet, focused place for the day&rsquo;s patient care.
            </p>
          </div>

          <div className="relative mt-auto rounded-card border border-white/15 bg-white/10 p-5">
            <ShieldCheck className="size-6 text-secondary" aria-hidden />
            <p className="mt-3.5 text-[17px] font-semibold">Private by design</p>
            <p className="mt-2 text-[13px] leading-6 text-white/75">
              Only staff you have added can get in. Keep your sign-in details to yourself.
            </p>
          </div>
        </section>

        <section className="flex min-h-full items-center justify-center p-6 sm:p-10 lg:p-14">
          <div className="w-full max-w-sm">
            <div className="flex items-center gap-3 lg:hidden">
              <span className="grid size-11 place-items-center rounded-control bg-secondary text-heading">
                <Stethoscope className="size-5" aria-hidden />
              </span>
              <p className="font-semibold text-heading">{workspaceName}</p>
            </div>

            <p className="mt-8 text-[11px] font-semibold tracking-[0.08em] text-primary uppercase lg:mt-0">
              Staff sign in
            </p>
            <h2 className="mt-2.5 text-[26px] leading-tight font-bold text-heading">Welcome back</h2>
            <p className="mt-2 text-[13px] leading-6 text-text-muted">
              Use the email and password your clinic set up for you.
            </p>

            {error && (
              <p
                role="alert"
                className="mt-6 rounded-card border border-danger-border bg-danger-bg px-4 py-3 text-[13px] font-semibold text-danger"
              >
                That email and password did not match. Check them and try again.
              </p>
            )}

            <form action={loginAction} className="mt-7 flex flex-col gap-5">
              <label className="block text-[13px] font-semibold text-heading">
                Email address
                <span className="relative mt-2 block">
                  <Mail
                    className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-text-muted"
                    aria-hidden
                  />
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="name@clinic.com"
                    className={field}
                  />
                </span>
              </label>

              <label className="block text-[13px] font-semibold text-heading">
                Password
                <span className="relative mt-2 block">
                  <LockKeyhole
                    className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-text-muted"
                    aria-hidden
                  />
                  <input
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="Your password"
                    className={field}
                  />
                </span>
              </label>

              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[13px] text-text-muted">
                <input
                  name="remember"
                  type="checkbox"
                  className="size-4 cursor-pointer accent-[var(--primary)]"
                />
                Keep me signed in on this device
              </label>

              <LoginSubmitButton />
            </form>

            <div className="mt-7 border-t border-border pt-5 text-center text-[13px] text-text-muted">
              <Link
                className="font-semibold text-primary hover:underline"
                href="/forgot-password"
              >
                Forgotten your password?
              </Link>
              <p className="mt-3">Need an account? Ask whoever runs your clinic.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
