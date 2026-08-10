import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import MarketingMotion from "@/components/marketing/MarketingMotion";
import PlatformExplorer from "@/components/marketing/PlatformExplorer";
import ProductTour from "@/components/marketing/ProductTour";
import PublicShell from "@/components/marketing/PublicShell";

export const metadata: Metadata = { title: "Platform", description: "Explore the connected ConphiDent workspace for dental clinic operations.", alternates: { canonical: "/product" } };

export default function Product() { return <PublicShell><MarketingMotion/><section className="mk-page-hero"><div className="cf-wrap" data-reveal><p className="mk-kicker">The ConphiDent platform</p><h1>A connected workspace for the complete clinic day.</h1><p>Patient information, schedules, care, finance, communication and operations work as one system—not a collection of separate screens.</p><div className="mk-actions"><Link href="/demo" className="mk-button">Book a personalised demo <ArrowRight/></Link><Link href="#platform-overview" className="mk-text-link">Explore product areas <ArrowRight/></Link></div></div></section><PlatformExplorer/><ProductTour/><section className="mk-final"><div className="cf-wrap" data-reveal><p className="mk-kicker">See your workflow in the product</p><h2>Explore ConphiDent with your own clinic day in mind.</h2><p>A focused walkthrough can cover patient intake, appointments, clinical care, billing, WhatsApp, laboratory work, inventory and reporting.</p><Link href="/demo" className="mk-button">Book a demo <ArrowRight/></Link></div></section></PublicShell>; }
