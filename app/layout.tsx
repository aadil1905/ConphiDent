import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { brandFontVariables } from "@/lib/fonts";
import "./marketing.css";
import "./portal.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.conphident.live"),
  title: { default: "ConphiDent | The operating system for modern dental clinics", template: "%s | ConphiDent" },
  description: "ConphiDent connects your dental clinic's WhatsApp, appointments, CRM, clinical work, billing and operations in one intelligent workspace.",
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "en_IN", siteName: "ConphiDent", title: "ConphiDent | The operating system for modern dental clinics", description: "More confident care. One connected clinic." },
  twitter: { card: "summary_large_image", title: "ConphiDent | The operating system for modern dental clinics", description: "More confident care. One connected clinic." },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The font variables live on the root so every surface can reach them —
    // the clinic workspace, the Control Center and the public site alike.
    <html lang="en" className={`h-full antialiased ${brandFontVariables}`}>
      {/* AdministrativeActionConfirmation used to mount here. Its scope check
          was `.dashboard-shell`, a class nothing has rendered since Phase B,
          so it has been a no-op with a MutationObserver on every page —
          including the marketing site. Reason fields collect real reasons. */}
      <body className="min-h-full flex flex-col">
        {children}

        <Toaster
          position="top-right"
          richColors
          closeButton
        />
      </body>
    </html>
  );
}
