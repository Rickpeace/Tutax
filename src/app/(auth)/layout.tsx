import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-5 py-10">
      <Link href="/" className="mb-8">
        <Wordmark size="lg" />
      </Link>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-[0_10px_40px_rgba(16,21,36,0.06)] sm:p-7">
        {children}
      </div>
      {/* Rechtliches auch vor dem Anmelden erreichbar (Runde 4). */}
      <p className="mt-6 text-xs text-muted-foreground">
        <a href="/impressum" className="hover:underline">
          Impressum
        </a>
        <span className="mx-1.5 opacity-50">·</span>
        <a href="/datenschutz" className="hover:underline">
          Datenschutz
        </a>
      </p>
    </div>
  );
}
