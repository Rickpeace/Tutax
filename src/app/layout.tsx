import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { appBaseUrl } from "@/lib/url";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

// Design-Handoff 07/2026 („desing claude/README.md"): EINE Marken-Schrift —
// Nunito 600–900 (Fließtext 600/700, Buttons/Labels 800, Headlines 900).
// --font-display bleibt als Variable erhalten (zeigt ebenfalls auf Nunito),
// damit bestehende .font-display-Verwendungen nicht brechen.
const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["600", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(appBaseUrl()),
  title: {
    default: "Steply – Klickbare Hilfe-Anleitungen für Organisationen",
    template: "%s · Steply",
  },
  description:
    "Erstellen Sie per Drag & Drop klickbare Schritt-für-Schritt-Anleitungen mit Screenshots, Highlights und Verzweigungen – gehostet im CI Ihrer Organisation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={`${nunito.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <TooltipProvider delay={200}>{children}</TooltipProvider>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
