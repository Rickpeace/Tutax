// Wendet alle SQL-Migrationen aus supabase/migrations/ in Reihenfolge an.
// Nutzung:  node --env-file=.env.local scripts/apply-migrations.mjs
// Liest SUPABASE_DB_URL aus der Umgebung (siehe .env.local.example).

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "supabase", "migrations");

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error(
    "✗ SUPABASE_DB_URL fehlt. In .env.local eintragen (Supabase → Settings → Database → Connection string → URI).",
  );
  process.exit(1);
}

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log(`Verbunden. ${files.length} Migrationsdatei(en) gefunden.\n`);
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    process.stdout.write(`→ ${file} … `);
    await client.query(sql);
    console.log("ok");
  }
  console.log("\n✓ Alle Migrationen angewendet.");
} catch (err) {
  console.error(`\n✗ Fehler: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
