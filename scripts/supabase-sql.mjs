/**
 * Run SQL against the linked Supabase project from the command line.
 *
 * The Supabase MCP server is not always connected to a given session, and the
 * CLI is not linked in this repository, so this is the smallest possible bridge
 * to the Management API's SQL endpoint:
 *
 *   node scripts/supabase-sql.mjs "select 1"
 *   node scripts/supabase-sql.mjs --file supabase/migrations/xyz.sql
 *
 * Reads SUPABASE_ACCESS_TOKEN (required) and SUPABASE_PROJECT_REF (optional; the
 * linked project ref is the default). Nothing here is used at runtime by the
 * application, and no credential is written to disk.
 */
import { readFile } from "node:fs/promises";

const DEFAULT_PROJECT_REF = "kziwwyiybxvzshojdzet";

const token = (process.env.SUPABASE_ACCESS_TOKEN ?? "").trim();
const projectRef = (process.env.SUPABASE_PROJECT_REF ?? "").trim() || DEFAULT_PROJECT_REF;

if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN is not set.");
  process.exit(1);
}

const argv = process.argv.slice(2);
const fileFlagIndex = argv.indexOf("--file");

let query;

if (fileFlagIndex !== -1) {
  const path = argv[fileFlagIndex + 1];
  if (!path) {
    console.error("--file needs a path.");
    process.exit(1);
  }
  query = await readFile(path, "utf8");
} else {
  query = argv.join(" ").trim();
}

if (!query) {
  console.error("Usage: node scripts/supabase-sql.mjs \"<sql>\" | --file <path.sql>");
  process.exit(1);
}

const response = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  },
);

const text = await response.text();

if (!response.ok) {
  console.error(`HTTP ${response.status}`);
  console.error(text);
  process.exit(1);
}

try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}
