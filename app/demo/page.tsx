import type { Metadata } from "next";
import { CheckCircle2, MessageCircle } from "lucide-react";
import DemoForm from "@/components/marketing/DemoForm";
import MarketingMotion from "@/components/marketing/MarketingMotion";
import PlatformExplorer from "@/components/marketing/PlatformExplorer";
import PublicShell from "@/components/marketing/PublicShell";

export const metadata: Metadata = { title: "Book a demo", description: "See ConphiDent’s connected patient, appointment, clinical, billing, WhatsApp and operations workflows.", alternates: { canonical: "/demo" } };
const whatsappHref = process.env.NEXT_PUBLIC_WHATSAPP_URL || "#demo-request";
export default function Demo() { return <PublicShell><MarketingMotion/><section className="mk-page-hero"><div className="cf-wrap" data-reveal><p className="mk-kicker">Book a product walkthrough</p><h1>See how ConphiDent fits your clinic.</h1><p>Explore real product previews, then request a focused walkthrough of the workflows that matter to your team.</p></div></section><PlatformExplorer/><section id="demo-request" className="mk-demo-request"><div className="cf-wrap mk-demo-grid"><div data-reveal><p className="mk-kicker">Request a personalised demo</p><h2>A practical tour—not a generic sales deck.</h2><p>Tell us a little about your clinic. The walkthrough can focus on the patient, scheduling, clinical, billing, WhatsApp, laboratory, inventory or reporting workflows most relevant to you.</p><ul><li><CheckCircle2/> We review your request</li><li><CheckCircle2/> We contact you at the preferred time</li><li><CheckCircle2/> We demonstrate the relevant real workflows</li></ul><a href={whatsappHref} className="mk-whatsapp-link"><MessageCircle/> Prefer WhatsApp? Start there.</a></div><div data-reveal><DemoForm/></div></div></section></PublicShell>; }
