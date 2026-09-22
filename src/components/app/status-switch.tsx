"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * EIN Schalter-Stil für die ganze App (Welle 50d): Regler (Teal an, Beige aus) + Beschriftung.
 * Genutzt von den Anleitungs-Karten/-Zeilen, dem Editor-Kopf („Veröffentlicht/Entwurf“,
 * „Mit Schulungsnachweis“), den Standard-Anleitungen („Auf der Hilfe-Seite“) und der
 * Wissensdatenbank. Reine Darstellung — die Aktion kommt über `onToggle`.
 */
export function StatusSwitch({
  on,
  onToggle,
  labelOn = "Veröffentlicht",
  labelOff = "Entwurf",
  title,
  disabled,
  busy,
  compact,
  className,
}: {
  on: boolean;
  onToggle: () => void;
  labelOn?: string;
  labelOff?: string;
  title?: string;
  disabled?: boolean;
  /** Zeigt einen kleinen Lade-Kreis hinter der Beschriftung. */
  busy?: boolean;
  /** Beschriftung erst ab sm (mobil fehlt in Listenzeilen der Platz). */
  compact?: boolean;
  className?: string;
}) {
  const label = on ? labelOn : labelOff;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      // Fester Name für Screenreader („Veröffentlicht, Schalter, an/aus") — der sichtbare Text
      // wechselt mit dem Zustand und wäre als Name irreführend („Entwurf, Schalter, aus").
      aria-label={labelOn}
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "flex shrink-0 items-center gap-2 text-xs font-extrabold disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      title={title}
    >
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-teal" : "bg-[#e3d7c2]"}`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-all ${on ? "left-[18px]" : "left-0.5"}`}
        />
      </span>
      <span aria-hidden className={`${compact ? "hidden sm:inline" : ""} ${on ? "text-teal-text" : "text-muted-foreground"}`}>
        {label}
      </span>
      {busy && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />}
    </button>
  );
}
