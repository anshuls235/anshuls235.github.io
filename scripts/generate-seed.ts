import { readFile, writeFile } from "node:fs/promises";
import { validateSnapshot } from "../src/lib/content";
import { TABLES } from "../src/lib/types";
const { content } = validateSnapshot(
  JSON.parse(await readFile("src/content/fallback.json", "utf8")),
);
const quote = (s: string) => "'" + s.replace(/'/g, "''") + "'";
let sql =
  "-- Generated from the reviewed published snapshot. Idempotent: inserts missing IDs only.\n-- Never overwrites dashboard edits; do not re-seed to restore content.\nbegin;\n";
for (const table of TABLES) {
  const rows = content[table];
  if (!rows.length) continue;
  sql += `insert into public.${table} select * from jsonb_populate_recordset(null::public.${table},${quote(JSON.stringify(rows))}::jsonb) on conflict (id) do nothing;\n`;
}
sql += "commit;\n";
await writeFile("supabase/seed.sql", sql);
console.log(
  "Generated reviewed initial seed; existing IDs will not be overwritten.",
);
