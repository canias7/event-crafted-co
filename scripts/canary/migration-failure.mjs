#!/usr/bin/env node
// Extracts the exact failing migration + error from `supabase start` output.
//
//   node scripts/canary/migration-failure.mjs <start.log> <blockers.json>
//
// Writes a blockers file for summarize.mjs (every DB-dependent write test is
// reported BLOCKED with this reason) and prints a one-line reason that the
// workflow passes to the tests as LOCAL_BLOCKED_REASON.

import fs from "node:fs";

const [logPath, outPath] = process.argv.slice(2);
const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8").replace(/\u001b\[[0-9;]*m/g, "") : "";
const lines = log.split("\n");

let migration = null;
let errorLine = null;
let statement = null;
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/Applying migration (\S+\.sql)/);
  if (m) migration = m[1];
  if (!errorLine && /ERROR:|SQLSTATE|failed to (apply|start)/i.test(lines[i])) {
    errorLine = lines[i].trim();
    const at = lines.slice(i, i + 12).find((l) => /At statement:?/i.test(l));
    const sql = lines.slice(i, i + 12).find((l) => /^\s*(alter|create|insert|update|drop|comment|grant)\b/i.test(l));
    statement = (sql || at || "").trim() || null;
  }
}

const reason = migration
  ? `BLOCKED: migration replay failed at ${migration}: ${errorLine ?? "unknown error"}`
  : `BLOCKED: local Supabase stack failed to start: ${errorLine ?? "see supabase-start.log"}`;

const blockers = [
  {
    project: "migration-replay",
    title: "Replay all supabase/migrations from scratch (supabase start)",
    reason,
    migration,
    error: errorLine,
    statement,
  },
];
fs.writeFileSync(outPath, JSON.stringify(blockers, null, 2));
process.stdout.write(reason.replace(/\n/g, " ").slice(0, 900));
