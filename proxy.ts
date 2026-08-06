import { NextResponse, type NextRequest } from "next/server";
import { readSessionCookie } from "@/lib/auth-token";
const publicApi = ["/api/webhook", "/api/health", "/api/cron/follow-ups", "/api/public-intake", "/api/demo-requests"];
export async function proxy(request: NextRequest) { const { pathname } = request.nextUrl; if (publicApi.some((path) => pathname.startsWith(path))) return NextResponse.next(); const session = await readSessionCookie(request.cookies.get("dentalai_session")?.value); if (session) return NextResponse.next(); if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Authentication required." }, { status: 401 }); return NextResponse.redirect(new URL("/login", request.url)); }
export const config = { matcher: ["/dashboard/:path*", "/settings/:path*", "/api/:path*"] };
