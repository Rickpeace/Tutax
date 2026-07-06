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
  | "heroTitle"
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
  | "subtitle"
  | "readAloud"
  | "pauseAloud"
  | "soundOn"
  | "soundOff"
  | "autoOn"
  | "autoOff"
  // Welle 29 — restliche Hilfe-Seiten-Strings (Kategorien-Fallback, Wizard, Druckansicht,
  // Fußzeilen, Sprachumschalter, Chat-Assistent). Ins bestehende Wörterbuch statt neuer Lib.
  | "otherCategory"
  | "stepsHeading"
  | "stepNoun"
  | "enlargeImage"
  | "imagePreview"
  | "close"
  | "screenshotComing"
  | "printNow"
  | "backToGuide"
  | "ifPrefix"
  | "continueWithStep"
  | "end"
  | "printView"
  | "providedBy"
  | "createdWith"
  | "imprint"
  | "privacy"
  | "language"
  | "chatGreeting"
  | "chatTitle"
  | "chatDisclaimer"
  | "chatPlaceholder"
  | "chatReset"
  | "chatResetConfirm"
  | "chatResetTitle"
  | "chatSend"
  | "chatLauncher"
  | "chatClose"
  | "chatTyping"
  | "chatDone"
  | "chatError"
  | "chatErrorRetry"
  | "chatRateLimit"
  | "chatNotConfigured"
  | "chatOffTopic"
  | "chatClarify"
  | "chatNoAnswer";

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
    heroTitle: "Wie können wir helfen?",
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
    readAloud: "Schritt vorlesen",
    pauseAloud: "Vorlesen pausieren",
    soundOn: "Ton an",
    soundOff: "Ton aus",
    autoOn: "Automatisch abspielen",
    autoOff: "Automatik aus",
    otherCategory: "Sonstiges",
    stepsHeading: "Schritte",
    stepNoun: "Schritt",
    enlargeImage: "Bild vergrößern",
    imagePreview: "Bildvorschau",
    close: "Schließen",
    screenshotComing: "Screenshot folgt",
    printNow: "Drucken",
    backToGuide: "Zur Anleitung",
    ifPrefix: "Wenn",
    continueWithStep: "weiter mit Schritt {n}",
    end: "Ende",
    printView: "Druckansicht",
    providedBy: "Bereitgestellt von {name} · powered by Steply",
    createdWith: "Erstellt mit Steply",
    imprint: "Impressum",
    privacy: "Datenschutz",
    language: "Sprache",
    chatGreeting:
      "Hallo! Ich bin der Hilfe-Assistent von {name}. Stellen Sie mir eine Frage – ich finde die passende Anleitung.",
    chatTitle: "Hilfe-Assistent",
    chatDisclaimer:
      "Antworten werden automatisiert per KI erstellt – bitte keine personenbezogenen Daten eingeben.",
    chatPlaceholder: "Frage stellen …",
    chatReset: "Neu",
    chatResetConfirm: "Gespräch wirklich löschen?",
    chatResetTitle: "Gespräch zurücksetzen",
    chatSend: "Senden",
    chatLauncher: "Hilfe-Assistent",
    chatClose: "Hilfe-Assistent schließen",
    chatTyping: "tippt",
    chatDone: "Antwort erhalten",
    chatError: "Es ist ein Fehler aufgetreten.",
    chatErrorRetry: "Es ist gerade ein Fehler aufgetreten – bitte später erneut versuchen.",
    chatRateLimit: "Zu viele Anfragen – bitte einen Moment warten und erneut versuchen.",
    chatNotConfigured:
      "Der Hilfe-Assistent ist noch nicht aktiviert. Bitte schauen Sie sich solange die Anleitungen oben an.",
    chatOffTopic:
      "Ich bin der Hilfe-Assistent von {name} und kann Ihnen nur bei Fragen rund um die Organisation und ihre Anleitungen weiterhelfen.",
    chatClarify: "Können Sie Ihr Anliegen bitte etwas genauer beschreiben?",
    chatNoAnswer: "Das kann ich Ihnen leider nicht sicher beantworten.",
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
    heroTitle: "How can we help?",
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
    readAloud: "Read step aloud",
    pauseAloud: "Pause reading",
    soundOn: "Sound on",
    soundOff: "Sound off",
    autoOn: "Play automatically",
    autoOff: "Autoplay off",
    otherCategory: "Other",
    stepsHeading: "Steps",
    stepNoun: "Step",
    enlargeImage: "Enlarge image",
    imagePreview: "Image preview",
    close: "Close",
    screenshotComing: "Screenshot coming",
    printNow: "Print",
    backToGuide: "Back to guide",
    ifPrefix: "If",
    continueWithStep: "continue with step {n}",
    end: "End",
    printView: "Print view",
    providedBy: "Provided by {name} · powered by Steply",
    createdWith: "Created with Steply",
    imprint: "Legal notice",
    privacy: "Privacy",
    language: "Language",
    chatGreeting:
      "Hi! I'm {name}'s help assistant. Ask me a question – I'll find the right guide.",
    chatTitle: "Help assistant",
    chatDisclaimer:
      "Answers are generated automatically by AI – please do not enter any personal data.",
    chatPlaceholder: "Ask a question …",
    chatReset: "New",
    chatResetConfirm: "Really delete this conversation?",
    chatResetTitle: "Reset conversation",
    chatSend: "Send",
    chatLauncher: "Help assistant",
    chatClose: "Close help assistant",
    chatTyping: "typing",
    chatDone: "Answer received",
    chatError: "An error occurred.",
    chatErrorRetry: "An error occurred just now – please try again later.",
    chatRateLimit: "Too many requests – please wait a moment and try again.",
    chatNotConfigured:
      "The help assistant isn't active yet. In the meantime, please browse the guides above.",
    chatOffTopic:
      "I'm {name}'s help assistant and can only help with questions about the organization and its guides.",
    chatClarify: "Could you describe your request a bit more precisely?",
    chatNoAnswer: "I'm afraid I can't answer that reliably.",
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
    heroTitle: "Jak możemy pomóc?",
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
    readAloud: "Przeczytaj krok na głos",
    pauseAloud: "Wstrzymaj czytanie",
    soundOn: "Dźwięk włączony",
    soundOff: "Dźwięk wyłączony",
    autoOn: "Odtwarzaj automatycznie",
    autoOff: "Autoodtwarzanie wyłączone",
    otherCategory: "Inne",
    stepsHeading: "Kroki",
    stepNoun: "Krok",
    enlargeImage: "Powiększ obraz",
    imagePreview: "Podgląd obrazu",
    close: "Zamknij",
    screenshotComing: "Zrzut ekranu wkrótce",
    printNow: "Drukuj",
    backToGuide: "Do instrukcji",
    ifPrefix: "Jeśli",
    continueWithStep: "przejdź do kroku {n}",
    end: "Koniec",
    printView: "Wersja do druku",
    providedBy: "Udostępniane przez {name} · powered by Steply",
    createdWith: "Utworzono w Steply",
    imprint: "Nota prawna",
    privacy: "Prywatność",
    language: "Język",
    chatGreeting:
      "Cześć! Jestem asystentem pomocy {name}. Zadaj mi pytanie – znajdę odpowiednią instrukcję.",
    chatTitle: "Asystent pomocy",
    chatDisclaimer:
      "Odpowiedzi są generowane automatycznie przez AI – prosimy nie wprowadzać danych osobowych.",
    chatPlaceholder: "Zadaj pytanie …",
    chatReset: "Nowa",
    chatResetConfirm: "Na pewno usunąć rozmowę?",
    chatResetTitle: "Zresetuj rozmowę",
    chatSend: "Wyślij",
    chatLauncher: "Asystent pomocy",
    chatClose: "Zamknij asystenta pomocy",
    chatTyping: "pisze",
    chatDone: "Otrzymano odpowiedź",
    chatError: "Wystąpił błąd.",
    chatErrorRetry: "Właśnie wystąpił błąd – spróbuj ponownie później.",
    chatRateLimit: "Zbyt wiele zapytań – odczekaj chwilę i spróbuj ponownie.",
    chatNotConfigured:
      "Asystent pomocy nie jest jeszcze aktywny. W międzyczasie przejrzyj instrukcje powyżej.",
    chatOffTopic:
      "Jestem asystentem pomocy {name} i mogę pomóc tylko w pytaniach dotyczących organizacji i jej instrukcji.",
    chatClarify: "Czy możesz opisać swoją sprawę nieco dokładniej?",
    chatNoAnswer: "Niestety nie mogę tego pewnie odpowiedzieć.",
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
    heroTitle: "Size nasıl yardımcı olabiliriz?",
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
    readAloud: "Adımı sesli oku",
    pauseAloud: "Okumayı duraklat",
    soundOn: "Ses açık",
    soundOff: "Ses kapalı",
    autoOn: "Otomatik oynat",
    autoOff: "Otomatik oynatma kapalı",
    otherCategory: "Diğer",
    stepsHeading: "Adımlar",
    stepNoun: "Adım",
    enlargeImage: "Resmi büyüt",
    imagePreview: "Resim önizleme",
    close: "Kapat",
    screenshotComing: "Ekran görüntüsü yakında",
    printNow: "Yazdır",
    backToGuide: "Kılavuza dön",
    ifPrefix: "Eğer",
    continueWithStep: "adım {n} ile devam edin",
    end: "Son",
    printView: "Yazdırma görünümü",
    providedBy: "{name} tarafından sağlanır · powered by Steply",
    createdWith: "Steply ile oluşturuldu",
    imprint: "Künye",
    privacy: "Gizlilik",
    language: "Dil",
    chatGreeting:
      "Merhaba! Ben {name} yardım asistanıyım. Bana bir soru sorun – doğru kılavuzu bulayım.",
    chatTitle: "Yardım asistanı",
    chatDisclaimer:
      "Yanıtlar yapay zeka tarafından otomatik oluşturulur – lütfen kişisel veri girmeyin.",
    chatPlaceholder: "Soru sorun …",
    chatReset: "Yeni",
    chatResetConfirm: "Sohbet gerçekten silinsin mi?",
    chatResetTitle: "Sohbeti sıfırla",
    chatSend: "Gönder",
    chatLauncher: "Yardım asistanı",
    chatClose: "Yardım asistanını kapat",
    chatTyping: "yazıyor",
    chatDone: "Yanıt alındı",
    chatError: "Bir hata oluştu.",
    chatErrorRetry: "Şu anda bir hata oluştu – lütfen daha sonra tekrar deneyin.",
    chatRateLimit: "Çok fazla istek – lütfen biraz bekleyip tekrar deneyin.",
    chatNotConfigured:
      "Yardım asistanı henüz etkin değil. Bu sırada yukarıdaki kılavuzlara göz atın.",
    chatOffTopic:
      "Ben {name} yardım asistanıyım ve yalnızca kuruluş ve kılavuzlarıyla ilgili sorularda yardımcı olabilirim.",
    chatClarify: "Talebinizi biraz daha ayrıntılı açıklayabilir misiniz?",
    chatNoAnswer: "Maalesef bunu kesin olarak yanıtlayamıyorum.",
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

/**
 * Übersetzten Kategorienamen holen (Welle 29). Quelle bleibt der deutsche `name`;
 * `categories.name_i18n` (jsonb {_src, en, pl, tr}) trägt die Übersetzungen. Fehlt
 * die Zielsprache (oder ist leer), fällt es auf den deutschen Namen zurück.
 */
export function categoryName(
  row: { name: string; name_i18n?: unknown },
  lang: HubLang,
): string {
  if (lang === "de") return row.name;
  const i18n = row.name_i18n;
  if (i18n && typeof i18n === "object") {
    const v = (i18n as Record<string, unknown>)[lang];
    if (typeof v === "string" && v.trim()) return v;
  }
  return row.name;
}
