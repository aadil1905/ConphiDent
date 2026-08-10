import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";
const scriptSources = ["'self'", "'unsafe-inline'", "https://connect.facebook.net"];
if (!isProduction) scriptSources.push("'unsafe-eval'");

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      { key: "Content-Security-Policy", value: [
        "default-src 'self'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "img-src 'self' data: https:",
        "style-src 'self' 'unsafe-inline'",
        `script-src ${scriptSources.join(" ")}`,
        "connect-src 'self' https://api.openai.com https://graph.facebook.com https://www.facebook.com",
        "frame-src https://www.facebook.com https://web.facebook.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "object-src 'none'",
      ].join("; ") },
      ...(isProduction ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
    ];
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
