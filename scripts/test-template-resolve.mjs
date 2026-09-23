// Vorlagen auf der öffentlichen Hilfe-Seite (Audit 23.09.2026) — resolveCustomerTutorial,
// forkIsServable und getCatalog aus src/lib/templates.ts gegen eine kleine In-Memory-
// Nachbildung des Supabase-Clients. OHNE Datenbank/Netz. Prüft:
//   1) Angepasste Vorlage (Fork) + Vorlage beim Kunden abgeschaltet -> URL liefert nichts,
//      Chatbot-Index-Regel (forkIsServable) sagt nein; aktiviert -> Fork wird ausgeliefert.
//   2) Vorlage zentral zurückgezogen -> Fork ebenfalls nicht mehr erreichbar.
//   3) Eigene Anleitung + Vorlage mit gleichem Slug -> eigene gewinnt, Hub zeigt EINE Karte.
//   4) Eigene Anleitung + Fork mit Zusatz-Slug -> beide erreichbar.
//
// Nutzung:  node scripts/test-template-resolve.mjs
import { register } from "node:module";

const srcBase = JSON.stringify(new URL("../src/", import.meta.url).href);
const loader = `export async function resolve(s,c,n){if(s==='server-only'){return {url:'data:text/javascript,',shortCircuit:true};}if(s.startsWith('@/')){return n(new URL(s.slice(2)+'.ts',${srcBase}).href,c);}return n(s,c);}`;
register("data:text/javascript," + encodeURIComponent(loader), import.meta.url);

const { resolveCustomerTutorial, forkIsServable, getCatalog } = await import("../src/lib/templates.ts");

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: ${JSON.stringify(a)}${JSON.stringify(a) === JSON.stringify(b) ? "" : ` (erwartet ${JSON.stringify(b)})`}`);

/** Minimaler Supabase-Nachbau: select/eq/neq/is/not/in/order/limit/maybeSingle/single. */
function fakeClient(db) {
  return {
    from(table) {
      const rows = () => db[table] ?? [];
      const filters = [];
      let limit = null;
      const q = {
        select: () => q,
        eq: (c, v) => (filters.push((r) => r[c] === v), q),
        neq: (c, v) => (filters.push((r) => r[c] !== v), q),
        is: (c, v) => (filters.push((r) => (r[c] ?? null) === v), q),
        not: (c, op, v) => (filters.push((r) => !(op === "is" && (r[c] ?? null) === v)), q),
        in: (c, vs) => (filters.push((r) => vs.includes(r[c])), q),
        order: () => q,
        limit: (n) => ((limit = n), q),
        run() {
          let out = rows().filter((r) => filters.every((f) => f(r)));
          if (limit != null) out = out.slice(0, limit);
          return out;
        },
        maybeSingle: async () => {
          const out = q.run();
          if (out.length > 1) return { data: null, error: { message: "multiple rows" } };
          return { data: out[0] ?? null, error: null };
        },
        single: async () => q.maybeSingle(),
        then: (res, rej) => Promise.resolve({ data: q.run(), error: null }).then(res, rej),
      };
      return q;
    },
  };
}

const ACC = "acc-1";
const base = (over) => ({ description: null, freshness: "ok", category_id: null, visibility: "public", status: "published", is_template: false, account_id: ACC, created_at: "2026-01-01", ...over });

function world({ enabled = true, tplStatus = "published", ownSameSlug = false, forkSlug = "rechnung" } = {}) {
  const tutorials = [
    base({ id: "tpl-1", title: "Rechnung stellen", slug: "rechnung", is_template: true, account_id: null, status: tplStatus }),
    base({ id: "fork-1", title: "Rechnung stellen (angepasst)", slug: forkSlug }),
  ];
  if (ownSameSlug) tutorials.push(base({ id: "own-1", title: "Eigene Rechnung", slug: "rechnung", created_at: "2025-01-01" }));
  return fakeClient({
    tutorials,
    account_templates: [{ account_id: ACC, template_id: "tpl-1", enabled, forked_tutorial_id: "fork-1", category_id: null }],
  });
}

// 1) abgeschaltet vs. aktiviert
{
  const off = world({ enabled: false });
  eq(await resolveCustomerTutorial(off, ACC, "rechnung"), null, "1: Fork, Vorlage abgeschaltet -> Seite nicht erreichbar");
  eq(await forkIsServable(off, ACC, "fork-1"), false, "1: Fork, Vorlage abgeschaltet -> nicht in den Chatbot");
  const on = world({ enabled: true });
  eq(await resolveCustomerTutorial(on, ACC, "rechnung"), "fork-1", "1: Fork, Vorlage aktiv -> Fork wird ausgeliefert");
  eq(await forkIsServable(on, ACC, "fork-1"), true, "1: Fork, Vorlage aktiv -> darf in den Chatbot");
  eq(await forkIsServable(on, ACC, "tpl-1"), true, "1: Kein Fork (Vorlage selbst) -> unverändert erlaubt");
  const cat = await getCatalog(on, ACC);
  eq(cat.filter((e) => e.visible).map((e) => e.key), ["fork-tpl-1"], "1: Hub zeigt die angepasste Vorlage");
  const catOff = await getCatalog(off, ACC);
  eq(catOff.filter((e) => e.visible).length, 0, "1: Hub verbirgt die abgeschaltete Vorlage");
}

// 2) zentral zurückgezogen
{
  const w = world({ tplStatus: "draft" });
  eq(await resolveCustomerTutorial(w, ACC, "rechnung"), null, "2: Vorlage zurückgezogen -> Fork nicht erreichbar");
  eq(await forkIsServable(w, ACC, "fork-1"), false, "2: Vorlage zurückgezogen -> Fork nicht in den Chatbot");
}

// 3) Altbestand: eigene Anleitung mit Vorlagen-Slug (Fork mit gleichem Slug, zwei Zeilen)
{
  const w = world({ ownSameSlug: true });
  eq(await resolveCustomerTutorial(w, ACC, "rechnung"), "own-1", "3: eigene Anleitung gewinnt deterministisch (kein maybeSingle-Fehler)");
  const cat = await getCatalog(w, ACC);
  const visible = cat.filter((e) => e.visible);
  eq(visible.map((e) => e.slug), ["rechnung"], "3: Hub zeigt EINE Karte je Adresse");
  eq(visible[0].key, "own-own-1", "3: … und zwar die erreichbare (eigene)");
}

// 4) neuer Fork mit Zusatz-Slug neben eigener Anleitung
{
  const w = world({ ownSameSlug: true, forkSlug: "rechnung-2" });
  eq(await resolveCustomerTutorial(w, ACC, "rechnung"), "own-1", "4: /rechnung -> eigene Anleitung");
  eq(await resolveCustomerTutorial(w, ACC, "rechnung-2"), "fork-1", "4: /rechnung-2 -> angepasste Vorlage");
  const cat = await getCatalog(w, ACC);
  eq(cat.filter((e) => e.visible).map((e) => e.slug).sort(), ["rechnung", "rechnung-2"], "4: beide Karten sichtbar, eindeutige Adressen");
}

if (failed) {
  console.log("\n✗ Vorlagen-Auflösung: Fehler");
  process.exit(1);
}
console.log("\n✓ Vorlagen-Auflösung: alle Prüfungen grün");
