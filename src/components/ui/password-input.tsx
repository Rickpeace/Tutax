"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Passwortfeld mit Feststelltasten-Warnung (Welle 28). Kapselt das bestehende Input-UI und
 * blendet — solange die Feststelltaste aktiv ist — eine dezente Warnzeile ein. Der Platz
 * für die Zeile ist reserviert (min-h), damit nichts springt; sie erscheint/verschwindet
 * sauber über getModifierState("CapsLock") auf keydown/keyup.
 *
 * Wiederverwendbar in allen Passwortformularen; reicht alle Input-Props (value/onChange/
 * required/minLength/autoComplete/…) unverändert durch. type ist standardmäßig "password".
 */
export function PasswordInput({
  onKeyDown,
  onKeyUp,
  type = "password",
  ...props
}: React.ComponentProps<typeof Input>) {
  const [capsOn, setCapsOn] = React.useState(false);

  const sync = (e: React.KeyboardEvent<HTMLInputElement>) => {
    try {
      if (typeof e.getModifierState === "function") {
        setCapsOn(e.getModifierState("CapsLock"));
      }
    } catch {
      /* getModifierState nicht verfügbar -> Warnung bleibt aus */
    }
  };

  return (
    <div>
      <Input
        type={type}
        onKeyDown={(e) => {
          sync(e);
          onKeyDown?.(e);
        }}
        onKeyUp={(e) => {
          sync(e);
          onKeyUp?.(e);
        }}
        {...props}
      />
      {/* Reservierte Zeile (min-h-4) -> kein Layout-Springen beim Ein-/Ausblenden. */}
      <div className="min-h-4" aria-live="polite">
        {capsOn && (
          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-500">
            <TriangleAlert className="size-3 shrink-0" aria-hidden />
            Feststelltaste ist aktiviert
          </p>
        )}
      </div>
    </div>
  );
}
