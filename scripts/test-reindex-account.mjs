// Chatbot-Index nach Tarif-Upgrade (reindexAccount, src/lib/kb.ts) — OHNE Datenbank/Netz/KI.
// Gratis-Konten werden seit 23.09.2026 nicht indiziert; das Upgrade im Admin baut den Index
// per reindexAccount nach. Geprüft wird, WELCHE Quellen dabei in den Index kommen:
//   - eigene veröffentlichte + öffentliche Anleitungen (inkl. aktiver angepasster Vorlage)
//   - veröffentlichte Wissensartikel
//   - AKTIVIERTE Standard-Vorlagen (zentrale Version, account_id NULL) — sie stehen auf der
//     Hilfe-Seite des Kontos und gehören ins Chatbot-Wissen (Regression 23.09.2026: fehlten)
//   - NICHT: Entwürfe, interne, abgeschaltete oder zentral zurückgezogene Vorlagen
//
// Nutzung:  node scripts/test-reindex-account.mjs
import { register } from "node:module";

const srcBase = JSON.stringify(new URL("../src/", import.meta.url).href);
// Externe Abhängigkeiten von kb.ts durch Attrappen ersetzen (KI, Admin-Client, server-only).
const stubs = {
  "server-only": "",
  "@/lib/openai": "export async function embedMany(xs){return xs.map(()=>[0.1,0.2]);}",
  "@/lib/ai": "export const embeddingsConfigured=()=>true;",
  "@/lib/supabase/admin": "export function createAdminClient(){return globalThis.__fakeAdmin;}",
};
const loader = `const S=${JSON.stringify(stubs)};export async function resolve(s,c,n){if(s in S){return {url:'data:text/javascript,'+encodeURIComponent(S[s]),shortCircuit:true};}if(s.startsWith('@/')){return n(new URL(s.slice(2)+'.ts',${srcBase}).href,c);}return n(s,c);}`;
register("data:text/javascript," + encodeURIComponent(loader), import.meta.url);

const { reindexAccount } = await import("../src/lib/kb.ts");

let failed = false;
const eq = (a, b, m) => {
  const same = JSON.stringify(a) === JSON.stringify(b);
  console.log(`${same ? "✓" : "✗"} ${m}: ${JSON.stringify(a)}${same ? "" : ` (erwartet ${JSON.stringify(b)})`}`);
  if (!same) failed = true;
};

/** Minimaler Supabase-Nachbau inkl. rpc (merkt sich, welche Quellen indiziert werden). */
function fakeClient(db, indexed) {
  return {
    rpc: async (name, args) => {
      if (name === "replace_kb_source") indexed.push(`${args.p_source_type}:${args.p_source_id}`);
      return { data: null, error: null };
    },
    from(table) {
      const rows = () => db[table] ?? [];
      const filters = [];
      const q = {
        select: () => q,
        delete: () => q,
        eq: (c, v) => (filters.push((r) => r[c] === v), q),
        neq: (c, v) => (filters.push((r) => r[c] !== v), q),
        is: (c, v) => (filters.push((r) => (r[c] ?? null) === v), q),
        not: (c, op, v) => (filters.push((r) => !(op === "is" && (r[c] ?? null) === v)), q),
        in: (c, vs) => (filters.push((r) => vs.includes(r[c])), q),
        order: () => q,
        limit: () => q,
        run: () => rows().filter((r) => filters.every((f) => f(r))),
        maybeSingle: async () => ({ data: q.run()[0] ?? null, error: null }),
        single: async () => ({ data: q.run()[0] ?? null, error: null }),
        then: (res, rej) => Promise.resolve({ data: q.run(), error: null }).then(res, rej),
      };
      return q;
    },
  };
}

const ACC = "acc-1";
const tut = (over) => ({ description: null, category_id: null, visibility: "public", status: "published", is_template: false, account_id: ACC, slug: over.id, title: over.id, ...over });

async function run(plan) {
  const indexed = [];
  globalThis.__fakeAdmin = fakeClient(
    {
      accounts: [{ id: ACC, plan }],
      tutorials: [
        tut({ id: "own-live" }),
        tut({ id: "own-draft", status: "draft" }),
        tut({ id: "own-internal", visibility: "internal" }),
        tut({ id: "fork-live" }), // angepasste Kopie von tpl-forked (aktiv)
        tut({ id: "tpl-on", is_template: true, account_id: null }),
        tut({ id: "tpl-off", is_template: true, account_id: null }),
        tut({ id: "tpl-forked", is_template: true, account_id: null }),
        tut({ id: "tpl-withdrawn", is_template: true, account_id: null, status: "draft" }),
        tut({ id: "tpl-other-acc", is_template: true, account_id: null }),
      ],
      account_templates: [
        { account_id: ACC, template_id: "tpl-on", enabled: true, forked_tutorial_id: null },
        { account_id: ACC, template_id: "tpl-off", enabled: false, forked_tutorial_id: null },
        { account_id: ACC, template_id: "tpl-forked", enabled: true, forked_tutorial_id: "fork-live" },
        { account_id: ACC, template_id: "tpl-withdrawn", enabled: true, forked_tutorial_id: null },
        { account_id: "acc-2", template_id: "tpl-other-acc", enabled: true, forked_tutorial_id: null },
      ],
      kb_articles: [
        { id: "art-live", account_id: ACC, status: "published", title: "A", body: null },
        { id: "art-draft", account_id: ACC, status: "draft", title: "B", body: null },
      ],
      steps: [],
      categories: [],
      kb_embeddings: [],
    },
    indexed,
  );
  await reindexAccount(ACC);
  return indexed.sort();
}

eq(
  await run("pro"),
  ["kb_article:art-live", "tutorial:fork-live", "tutorial:own-live", "tutorial:tpl-on"],
  "Upgrade auf Pro: eigene, angepasste UND aktivierte Standard-Vorlagen + Artikel im Index",
);
eq(await run("free"), [], "Gratis: nichts indiziert (Embeddings kosten)");

if (failed) {
  console.log("\n✗ reindexAccount: Fehler");
  process.exit(1);
}
console.log("\n✓ reindexAccount: alle Prüfungen grün");
