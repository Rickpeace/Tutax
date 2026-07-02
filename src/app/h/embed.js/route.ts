import { appBaseUrl } from "@/lib/url";

/**
 * Script-Chat-Bubble (REVIEW H4): ein einziges <script>-Tag bettet die KI-Hilfe als
 * schwebende Bubble auf JEDER Firmen-Website ein. Liegt bewusst unter /h -> vom
 * Auth-Proxy ausgenommen (öffentlich, keine Session nötig).
 *
 * Das Script erzeugt ein fixed positioniertes iFrame auf die Chat-only-Seite
 * (/h/{account}/chat?embedded=1). Der ChatWidget im iFrame meldet per postMessage
 * "chat-open"/"chat-close"; das Script vergrößert/verkleinert daraufhin das iFrame.
 * Alles inline, Vanilla JS, IIFE, defensiv gegen doppelte Einbindung.
 */

export const dynamic = "force-static";

export async function GET() {
  const origin = appBaseUrl();

  // origin wird als JSON in den String eingesetzt -> sicher escaped, kein Template-Leak.
  const script = `(function () {
  "use strict";
  if (window.__steplyBubble) return;
  window.__steplyBubble = true;

  var ORIGIN = ${JSON.stringify(origin)};

  // Konto aus der eigenen <script>-URL lesen (?account=slug).
  var me = document.currentScript;
  if (!me) {
    var scripts = document.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].src && scripts[i].src.indexOf("/h/embed.js") !== -1) { me = scripts[i]; break; }
    }
  }
  var account = "";
  try { account = new URL(me.src).searchParams.get("account") || ""; } catch (e) {}
  if (!account) return;

  var CLOSED = 76;
  var iframe = document.createElement("iframe");
  iframe.src = ORIGIN + "/h/" + encodeURIComponent(account) + "/chat?embedded=1";
  iframe.title = "Hilfe-Assistent";
  iframe.setAttribute("allowtransparency", "true");
  iframe.style.cssText = [
    "position:fixed",
    "bottom:16px",
    "right:16px",
    "width:" + CLOSED + "px",
    "height:" + CLOSED + "px",
    "border:0",
    "background:transparent",
    "z-index:2147483000",
    "border-radius:9999px",
    "box-shadow:none",
    "transition:width .18s ease, height .18s ease, border-radius .18s ease",
    "color-scheme:normal"
  ].join(";");

  function setOpen() {
    iframe.style.width = "min(400px, calc(100vw - 24px))";
    iframe.style.height = "min(640px, calc(100vh - 24px))";
    iframe.style.borderRadius = "16px";
  }
  function setClosed() {
    iframe.style.width = CLOSED + "px";
    iframe.style.height = CLOSED + "px";
    iframe.style.borderRadius = "9999px";
  }

  window.addEventListener("message", function (ev) {
    if (ev.origin !== ORIGIN) return;
    var d = ev.data;
    if (!d || typeof d !== "object") return;
    if (d.steply === "chat-open") setOpen();
    else if (d.steply === "chat-close") setClosed();
  });

  function mount() {
    if (document.body) document.body.appendChild(iframe);
    else document.addEventListener("DOMContentLoaded", function () { document.body.appendChild(iframe); });
  }
  mount();
})();`;

  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
