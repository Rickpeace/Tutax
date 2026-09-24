/**
 * Typische Bot-/Link-Vorschau-User-Agents (Audit 24.09.2026): Suchmaschinen, Messenger-
 * Vorschauen (WhatsApp, Slack, Telegram, Discord, Facebook/X, LinkedIn …) und Kommando-
 * zeilen-Werkzeuge. Aufrufe von ihnen zählen NICHT in die Insights.
 *
 * Bewusst NICHT gefiltert: „HeadlessChrome“ — die eigenen Playwright-Tests laufen damit
 * und prüfen die Aufruf-Zählung. Leerer User-Agent = kein Browser → Bot.
 * Reine Logik ohne Imports (Regressionstest: scripts/test-hub-contrast.mjs).
 */
const BOT_UA =
  /(?<!cu)bot\b|(?<!cu)bot[/-]|crawler|crawling|spider|slurp|preview|facebookexternalhit|facebookcatalog|whatsapp\/|slack-imgproxy|embedly|vkshare|mastodon|quora link|outbrain|google-inspectiontool|lighthouse|curl\/|wget\/|python-requests|python-urllib|go-http-client|okhttp|java\/|libwww|httpclient|axios\//i;
// Hinweis: In-App-Browser echter Menschen (z. B. „LinkedInApp“, „Twitter for iPhone“,
// „FBAN/FBIOS“) enthalten kein „bot“ und zählen weiter; deren Vorschau-Abrufer heißen
// LinkedInBot, Twitterbot, TelegramBot, Discordbot, Slackbot … und treffen „bot“.
// „(?<!cu)“: das Android-Handy „CUBOT“ steht im User-Agent und ist kein Bot.

export function isBotUserAgent(ua: string | null | undefined): boolean {
  const s = String(ua ?? "").trim();
  if (!s) return true;
  return BOT_UA.test(s);
}
