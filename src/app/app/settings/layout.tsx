import { Suspense } from "react";
import { SettingsSidebar, SettingsMobileNav } from "@/components/app/settings-nav";

/**
 * Einstellungen mit Seitenleiste (Welle 50c, Entwurf „App-Makeover" §2):
 * Desktop = linke Leiste mit Gruppen, mobil = Auswahl oben. Kein „← Dashboard"-Link
 * mehr — die Kopfleiste ist immer da. Leiste/Auswahl lesen usePathname → eigene
 * Suspense-Grenzen (cacheComponents), die statische Hülle bleibt sofort sichtbar.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-1">
      <aside className="hidden w-[240px] shrink-0 border-r-2 border-line px-3 py-[18px] lg:block">
        <div className="sticky top-[82px]">
          <Suspense fallback={<div className="h-96" />}>
            <SettingsSidebar />
          </Suspense>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-8 lg:pt-6">
        <div className="mb-5 lg:hidden">
          <Suspense fallback={<div className="h-11 rounded-full border-2 border-line bg-card" />}>
            <SettingsMobileNav />
          </Suspense>
        </div>
        <div className="max-w-[820px]">{children}</div>
      </main>
    </div>
  );
}
