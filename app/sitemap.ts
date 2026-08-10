import type { MetadataRoute } from "next";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.conphident.live";
export default function sitemap(): MetadataRoute.Sitemap { return [
  { url: siteUrl, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
  { url: `${siteUrl}/product`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.9 },
  { url: `${siteUrl}/features`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
  { url: `${siteUrl}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
  { url: `${siteUrl}/demo`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.9 },
  { url: `${siteUrl}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  { url: `${siteUrl}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
]; }
