import { LockKeyhole, Mail, ShieldCheck, Stethoscope } from "lucide-react";
import Link from "next/link";
import LoginSubmitButton from "@/components/auth/LoginSubmitButton";
import { loginAction } from "./actions";
import { PLATFORM_NAME, tenantFromRequestHost } from "@/lib/platform";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, tenant] = await Promise.all([searchParams, tenantFromRequestHost()]);
  const workspaceName = tenant?.brandName || tenant?.name || PLATFORM_NAME;

  return (
    <main className="login-screen relative min-h-screen overflow-hidden bg-[#f7fafc] p-4 sm:p-6 lg:p-8">
      <div className="absolute inset-x-0 top-0 h-72 bg-gradient-to-br from-cyan-950 via-sky-900 to-teal-700" />
      <div className="absolute -left-24 top-10 size-80 rounded-full border border-white/10" />
      <div className="absolute right-8 top-20 size-52 rounded-full bg-cyan-300/10 blur-3xl" />

      <div className="relative mx-auto grid min-h-[calc(100vh-2rem)] max-w-6xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_28px_80px_-36px_rgba(15,23,42,0.45)] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden bg-gradient-to-br from-slate-950 via-cyan-950 to-teal-800 p-10 text-white lg:flex lg:flex-col">
          <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:28px_28px]" />
          <div className="relative">
            <div className="inline-flex size-12 items-center justify-center rounded-2xl border border-white/20 bg-white/10 shadow-lg backdrop-blur-sm">
              <Stethoscope className="size-6" />
            </div>
            <p className="mt-8 text-xs font-bold uppercase tracking-[0.22em] text-cyan-200">Clinical workspace</p>
            <h1 className="mt-3 max-w-md text-4xl font-bold leading-tight tracking-tight">{workspaceName}</h1>
            <p className="mt-4 max-w-md text-base leading-7 text-cyan-50/80">A secure, focused workspace for your clinic&apos;s daily patient care.</p>
          </div>

          <div className="relative mt-auto rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur-sm">
            <ShieldCheck className="size-6 text-cyan-200" />
            <p className="mt-4 text-lg font-semibold">Private by design</p>
            <p className="mt-2 text-sm leading-6 text-cyan-50/75">Access is limited to authorised clinic staff. Keep your sign-in details private.</p>
          </div>
        </section>

        <section className="flex min-h-full items-center justify-center p-6 sm:p-10 lg:p-14">
          <div className="w-full max-w-sm">
            <div className="flex items-center gap-3 lg:hidden">
              <div className="grid size-11 place-items-center rounded-2xl bg-cyan-50 text-cyan-800"><Stethoscope className="size-5" /></div>
              <p className="font-bold tracking-tight text-slate-900">{workspaceName}</p>
            </div>
            <p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-cyan-700 lg:mt-0">Staff sign in</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Welcome back</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Sign in with your authorised staff email and password.</p>

            {error && <p role="alert" className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">We could not sign you in with those details. Please try again.</p>}

            <form action={loginAction} className="mt-8 space-y-5">
              <label className="block text-sm font-semibold text-slate-800">
                Email address
                <span className="relative mt-2 block">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <input name="email" type="email" required autoComplete="email" placeholder="name@clinic.com" className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-cyan-600 focus:bg-white focus:ring-4 focus:ring-cyan-100" />
                </span>
              </label>
              <label className="block text-sm font-semibold text-slate-800">
                Password
                <span className="relative mt-2 block">
                  <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <input name="password" type="password" required autoComplete="current-password" placeholder="Enter your password" className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-cyan-600 focus:bg-white focus:ring-4 focus:ring-cyan-100" />
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-600"><input name="remember" type="checkbox" className="size-4 rounded border-slate-300 text-cyan-700 focus:ring-cyan-600" /> Remember me on this device</label>
              <LoginSubmitButton />
            </form>

            <div className="mt-8 border-t border-slate-100 pt-5 text-center text-sm text-slate-500">
              <Link className="font-semibold text-cyan-700 transition hover:text-cyan-900 hover:underline" href="/forgot-password">Forgot password?</Link>
              <p className="mt-3">Need access? Contact your clinic administrator.</p>
              <p className="mt-2 text-xs">New clinics are provisioned securely by the platform team.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
