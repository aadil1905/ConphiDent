import type { MetadataRoute } from "next";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.conphident.live";
export default function robots(): MetadataRoute.Robots { return { rules: { userAgent: "*", allow: "/", disallow: ["/dashboard/", "/platform/", "/api/", "/login", "/setup"] }, sitemap: `${siteUrl}/sitemap.xml` }; }
