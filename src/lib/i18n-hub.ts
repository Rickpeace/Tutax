/**
 * Feste UI-Strings der öffentlichen Hilfe-Seite (Welle 13, Mehrsprachigkeit).
 * Deutsch ist das Original; en/pl/tr sind Zusatzsprachen, die der Kunde je Konto
 * aktivieren kann. NUR die festen Bausteine (Buttons, Labels, Suchfeld) — Tutorial-
 * Inhalte selbst liegen übersetzt in den *_translations-Tabellen.
 *
 * Bewusst KEIN Bibliotheks-Overhead: ein flaches Wörterbuch + `t(lang, key)`.
 * Fällt eine Sprache/ein Schlüssel weg, wird auf Deutsch zurückgegriffen.
 */

export type HubLang = "de" | "en" | "pl" | "tr";
/** Zusätzlich aktivierbare Sprachen (accounts.languages). Deutsch ist immer an. */
export type ExtraLang = "en" | "pl" | "tr";

export const HUB_LANGS: readonly HubLang[] = ["de", "en", "pl", "tr"] as const;
export const EXTRA_LANGS: readonly ExtraLang[] = ["en", "pl", "tr"] as const;

/** Anzeigenamen der Sprachen (im Umschalter). */
export const LANG_LABEL: Record<HubLang, string> = {
  de: "DE",
  en: "EN",
  pl: "PL",
  tr: "TR",
};

/** Voller Sprachname (Einstellungen, für Toasts). */
export const LANG_NAME: Record<HubLang, string> = {
  de: "Deutsch",
  en: "Englisch",
  pl: "Polnisch",
  tr: "Türkisch",
};

/** BCP-47-Codes für hreflang. */
export const LANG_BCP47: Record<HubLang, string> = {
  de: "de",
  en: "en",
  pl: "pl",
  tr: "tr",
};

/** Wie die KI die Zielsprache beim Übersetzen benennen soll. */
export const LANG_TARGET: Record<ExtraLang, string> = {
  en: "English",
  pl: "Polish",
  tr: "Turkish",
};

type Key =
  | "next"
  | "back"
  | "done"
  | "finished"
  | "finishedSub"
  | "stepXofY"
  | "restart"
  | "searchPlaceholder"
  | "searchAria"
  | "helpTitle"
  | "stuck"
  | "stuckThanks"
  | "helpful"
  | "yes"
  | "no"
  | "feedbackThanks"
  | "print"
  | "allTutorials"
  | "noneYet"
  | "noneFound"
  | "resetSearch"
  | "didYouMean"
  | "searchingSimilar"
  | "notRight"
  | "subtitle";

/** {n}/{total} werden im Wizard eingesetzt (Ersatz für „Schritt X von Y“). */
const DICT: Record<HubLang, Record<Key, string>> = {
  de: {
    next: "Weiter",
    back: "Zurück",
    done: "Fertig",
    finished: "Fertig!",
    finishedSub: "Sie haben die Anleitung abgeschlossen.",
    stepXofY: "Schritt {n} von {total}",
    restart: "Von vorne",
    searchPlaceholder: "Anleitung suchen …",
    searchAria: "Anleitung suchen",
    helpTitle: "Hilfe & Anleitungen",
    stuck: "Ich komme hier nicht weiter",
    stuckThanks:
      "Danke – wir schauen uns diesen Schritt an. Nutzen Sie gern den Hilfe-Assistenten unten rechts.",
    helpful: "War diese Anleitung hilfreich?",
    yes: "Ja",
    no: "Nein",
    feedbackThanks: "Danke für Ihr Feedback!",
    print: "Zum Ausdrucken",
    allTutorials: "Alle Anleitungen",
    noneYet: "Noch keine veröffentlichten Anleitungen.",
    noneFound: "Keine Anleitung zu „{q}“ gefunden.",
    resetSearch: "Suche zurücksetzen",
    didYouMean: "Meinten Sie:",
    searchingSimilar: "Ähnliche Anleitungen werden gesucht …",
    notRight:
      "Nicht das Richtige dabei? Fragen Sie den Hilfe-Assistenten unten rechts.",
    subtitle: "Hilfe & Anleitungen",
  },
  en: {
    next: "Next",
    back: "Back",
    done: "Done",
    finished: "Done!",
    finishedSub: "You have completed the guide.",
    stepXofY: "Step {n} of {total}",
    restart: "Start over",
    searchPlaceholder: "Search guides …",
    searchAria: "Search guides",
    helpTitle: "Help & Guides",
    stuck: "I'm stuck here",
    stuckThanks:
      "Thanks – we'll take a look at this step. Feel free to use the help assistant in the bottom right.",
    helpful: "Was this guide helpful?",
    yes: "Yes",
    no: "No",
    feedbackThanks: "Thanks for your feedback!",
    print: "Print version",
    allTutorials: "All guides",
    noneYet: "No published guides yet.",
    noneFound: "No guide found for “{q}”.",
    resetSearch: "Reset search",
    didYouMean: "Did you mean:",
    searchingSimilar: "Searching for similar guides …",
    notRight:
      "Not what you were looking for? Ask the help assistant in the bottom right.",
    subtitle: "Help & Guides",
  },
  pl: {
    next: "Dalej",
    back: "Wstecz",
    done: "Gotowe",
    finished: "Gotowe!",
    finishedSub: "Ukończyłeś tę instrukcję.",
    stepXofY: "Krok {n} z {total}",
    restart: "Od nowa",
    searchPlaceholder: "Szukaj instrukcji …",
    searchAria: "Szukaj instrukcji",
    helpTitle: "Pomoc i instrukcje",
    stuck: "Utknąłem w tym miejscu",
    stuckThanks:
      "Dziękujemy – przyjrzymy się temu krokowi. Skorzystaj z asystenta pomocy w prawym dolnym rogu.",
    helpful: "Czy ta instrukcja była pomocna?",
    yes: "Tak",
    no: "Nie",
    feedbackThanks: "Dziękujemy za opinię!",
    print: "Wersja do druku",
    allTutorials: "Wszystkie instrukcje",
    noneYet: "Brak opublikowanych instrukcji.",
    noneFound: "Nie znaleziono instrukcji dla „{q}”.",
    resetSearch: "Wyczyść wyszukiwanie",
    didYouMean: "Czy chodziło Ci o:",
    searchingSimilar: "Szukanie podobnych instrukcji …",
    notRight:
      "Nie znalazłeś tego, czego szukasz? Zapytaj asystenta pomocy w prawym dolnym rogu.",
    subtitle: "Pomoc i instrukcje",
  },
  tr: {
    next: "İleri",
    back: "Geri",
    done: "Bitti",
    finished: "Bitti!",
    finishedSub: "Kılavuzu tamamladınız.",
    stepXofY: "Adım {n} / {total}",
    restart: "Baştan başla",
    searchPlaceholder: "Kılavuz ara …",
    searchAria: "Kılavuz ara",
    helpTitle: "Yardım ve Kılavuzlar",
    stuck: "Burada takıldım",
    stuckThanks:
      "Teşekkürler – bu adımı inceleyeceğiz. Sağ alttaki yardım asistanını kullanabilirsiniz.",
    helpful: "Bu kılavuz yardımcı oldu mu?",
    yes: "Evet",
    no: "Hayır",
    feedbackThanks: "Geri bildiriminiz için teşekkürler!",
    print: "Yazdırma sürümü",
    allTutorials: "Tüm kılavuzlar",
    noneYet: "Henüz yayınlanmış kılavuz yok.",
    noneFound: "„{q}“ için kılavuz bulunamadı.",
    resetSearch: "Aramayı sıfırla",
    didYouMean: "Şunu mu demek istediniz:",
    searchingSimilar: "Benzer kılavuzlar aranıyor …",
    notRight:
      "Aradığınız bu değil mi? Sağ alttaki yardım asistanına sorun.",
    subtitle: "Yardım ve Kılavuzlar",
  },
};

export type HubLabels = Record<Key, string>;

/** Ist der Wert eine gültige Zusatzsprache? (searchParam-Validierung) */
export function isExtraLang(v: unknown): v is ExtraLang {
  return v === "en" || v === "pl" || v === "tr";
}

/**
 * searchParam `?lang=` in eine gültige Sprache übersetzen. Nur aktivierte
 * Sprachen werden akzeptiert; alles andere (auch fehlend/„de“) → Deutsch.
 */
export function resolveLang(
  raw: string | string[] | undefined,
  enabled: readonly string[] | null | undefined,
): HubLang {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (isExtraLang(v) && (enabled ?? []).includes(v)) return v;
  return "de";
}

/** Einzelnen UI-String holen, mit {platzhalter}-Ersetzung; DE-Fallback. */
export function t(
  lang: HubLang,
  key: Key,
  vars?: Record<string, string | number>,
): string {
  const raw = DICT[lang]?.[key] ?? DICT.de[key];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/** Komplettes Label-Objekt für eine Sprache (an Client-Komponenten reichen). */
export function labelsFor(lang: HubLang): HubLabels {
  return { ...DICT.de, ...DICT[lang] };
}
