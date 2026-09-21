"use client";

import { StatusSwitch } from "@/components/app/status-switch";

/**
 * Ein-/Aus-Schalter mit fester Beschriftung (Standard-Anleitungen „Auf der Hilfe-Seite",
 * Wissensdatenbank „Im KI-Assistenten aktiv"). Seit Welle 50d derselbe Stil wie der
 * Status-Schalter der Anleitungs-Karten — keine eigene Variante mehr.
 */
export function HelpToggle({
  on,
  onToggle,
  disabled,
  label = "Auf der Hilfe-Seite",
  compact,
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
}) {
  return (
    <StatusSwitch
      on={on}
      onToggle={onToggle}
      disabled={disabled}
      labelOn={label}
      labelOff={label}
      title={label}
      compact={compact}
    />
  );
}
