import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import "./marketing.css";

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
    <html lang="en" className="h-full antialiased">
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
