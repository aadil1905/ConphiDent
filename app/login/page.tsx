import Image from "next/image";
import Link from "next/link";
import { LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import LoginSubmitButton from "@/components/auth/LoginSubmitButton";
import ClearLocalDrafts from "@/components/auth/ClearLocalDrafts";
import { loginAction } from "./actions";
import { brandFontVariables } from "@/lib/fonts";
import { PLATFORM_NAME, tenantFromRequestHost } from "@/lib/platform";

const field =
  "h-12 w-full rounded-control border border-border bg-card pr-4 pl-11 text-[15px] text-foreground outline-none transition-colors placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-[var(--primary-soft)]";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, tenant] = await Promise.all([searchParams, tenantFromRequestHost()]);
  const workspaceName = tenant?.brandName || tenant?.name || PLATFORM_NAME;

  return (
    <main className={`cf-portal ${brandFontVariables} relative min-h-screen p-4 sm:p-6 lg:p-8`}>
      <div className="relative mx-auto grid min-h-[calc(100vh-2rem)] max-w-6xl overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow-overlay)] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="portal-ink relative hidden overflow-hidden p-10 lg:flex lg:flex-col">
          <div className="relative">
            <Image
              src="/conphident-logo-transparent.png"
              alt="ConphiDent"
              width={1764}
              height={864}
              priority
              className="h-9 w-auto brightness-0 invert"
            />
            <p className="portal-kicker on-ink mt-10">Clinical workspace</p>
            <h1 className="mt-4 max-w-md text-[36px] leading-tight font-semibold">{workspaceName}</h1>
            <p className="mt-4 max-w-md text-[15px] leading-7 text-white/70">
              A quiet, focused place for the day&rsquo;s patient care.
            </p>
          </div>

          <div className="relative mt-auto border-t border-white/12 pt-6">
            <ShieldCheck className="size-5 text-[var(--gold-on-ink)]" aria-hidden />
            <p className="mt-3 text-[16px] font-semibold text-white">Private by design</p>
            <p className="mt-2 max-w-sm text-[13px] leading-6 text-white/70">
              Only staff your clinic has added can get in. Keep your sign-in details to yourself.
            </p>
          </div>
        </section>

        <section className="flex min-h-full items-center justify-center p-6 sm:p-10 lg:p-14">
          <div className="w-full max-w-sm">
            <Image
              src="/conphident-logo-transparent.png"
              alt="ConphiDent"
              width={1764}
              height={864}
              className="h-8 w-auto lg:hidden"
            />

            <p className="portal-kicker mt-8 lg:mt-0">Staff sign in</p>
            <h2 className="mt-3 text-[28px] leading-tight font-semibold text-heading">Welcome back</h2>
            <p className="mt-2.5 text-[13.5px] leading-6 text-text-muted">
              Use the email and password your clinic set up for you.
            </p>

            {error && (
              <p
                role="alert"
                className="mt-6 rounded-control border border-danger-border bg-danger-bg px-4 py-3 text-[13px] font-semibold text-danger"
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

              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[13px] text-text-muted">
                <input
                  name="remember"
                  type="checkbox"
                  className="size-4 cursor-pointer accent-[var(--primary)]"
                />
                Keep me signed in on this device
              </label>

              <LoginSubmitButton />
              <ClearLocalDrafts />
            </form>

            <div className="mt-7 border-t border-border pt-5 text-[13px] text-text-muted">
              <Link className="font-semibold text-primary hover:underline" href="/forgot-password">
                Forgotten your password?
              </Link>
              <p className="mt-3">
                Not set up yet?{" "}
                <Link className="font-semibold text-primary hover:underline" href="/">
                  See what ConphiDent does
                </Link>
                .
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
