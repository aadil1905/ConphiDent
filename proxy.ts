import { NextResponse, type NextRequest } from "next/server";
import { readSessionCookie } from "@/lib/auth-token";
const publicApi = [
  "/api/webhook",
  "/api/health",
  "/api/cron/booking-reminders",
  "/api/cron/follow-ups",
  "/api/cron/whatsapp-outbox",
  "/api/public-intake",
  "/api/demo-requests",
  "/api/clinic-signup",
  "/api/laboratory/cases",
  "/api/laboratory/attachments",
  "/api/laboratory/imaging",
];
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  const setupHost = (process.env.SETUP_DOMAIN || "")
    .split(":")[0]
    .toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1";
  const platformDomain = (process.env.PLATFORM_DOMAIN || "")
    .split(":")[0]
    .toLowerCase();
  // "www" is the marketing site, not a clinic. Treating every *.domain host as
  // a tenant made the public homepage resolve to a workspace entry point and
  // redirect every visitor to /login. tenantFromRequestHost() in lib/platform.ts
  // excludes the apex and www the same way — the two must agree.
  const isTenantHost = Boolean(
    platformDomain
      && host.endsWith(`.${platformDomain}`)
      && host !== setupHost
      && host !== `www.${platformDomain}`,
  );
  // The setup host is where clinics onboard themselves, so its root serves the
  // public signup landing. It is a rewrite rather than a redirect so the address
  // bar keeps the bare domain. The operator portal below stays authenticated.
  if (setupHost && host === setupHost && pathname === "/")
    return NextResponse.rewrite(new URL("/start", request.url));
  if (setupHost && host === setupHost && pathname.startsWith("/dashboard"))
    return NextResponse.redirect(new URL("/setup", request.url));
  if (
    (pathname.startsWith("/setup") || pathname.startsWith("/platform")) &&
    !local &&
    (host !== setupHost || isTenantHost)
  )
    return NextResponse.redirect(new URL("/dashboard", request.url));
  // The marketing homepage is public. "/" is matched only so the setup host and
  // clinic subdomains can be sent to their own entry points, both handled above;
  // reaching the session check below would serve /login to every visitor.
  if (pathname === "/" && !isTenantHost) return NextResponse.next();
  if (publicApi.some((path) => pathname.startsWith(path)))
    return NextResponse.next();
  if (pathname.startsWith("/lab/cases/")) return NextResponse.next();
  const session = await readSessionCookie(
    request.cookies.get("dentalai_session")?.value,
  );
  if (session) return NextResponse.next();
  if (pathname.startsWith("/api/"))
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  return NextResponse.redirect(new URL("/login", request.url));
}
export const config = {
  matcher: [
    "/",
    "/setup/:path*",
    "/platform/:path*",
    "/dashboard/:path*",
    "/settings/:path*",
    "/change-password/:path*",
    "/lab/:path*",
    "/api/:path*",
  ],
};
