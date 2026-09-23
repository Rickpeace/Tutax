import { EMBED_TRANSPARENT_CSS } from "./transparent";

// Ladezustand der Chat-only-Seite: KEIN Skeleton (das der Hilfe-Seite würde im 76-px-iFrame
// als farbige Blöcke durchscheinen) — nur durchsichtig, bis der Knopf da ist.
export default function ChatLoading() {
  return <style>{EMBED_TRANSPARENT_CSS}</style>;
}
