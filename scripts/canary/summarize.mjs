#!/usr/bin/env node
// Turns a Playwright JSON report into a readable + machine-readable summary
// and decides the job's verdict.
//
//   node scripts/canary/summarize.mjs --results <results.json> --out <dir>
//        [--title "..."] [--meta metadata.json] [--preflight preflight.json]
//        [--blockers blockers.json]
//
// Buckets (reported separately, never merged):
//   passed   passed on the first attempt
//   flaky    failed at least once, passed on retry  (shown, not hidden)
//   failed   failed every attempt
//   blocked  could not run: required config missing, a setup step failed, or
//            an external blocker (e.g. migrations don't replay) — counts
//            against the verdict, because missing coverage isn't health
//   skipped  intentionally not run for a reason that isn't a blocker
//
// Exit code 1 if anything failed or was blocked (or the report is missing).
// Appends Markdown to $GITHUB_STEP_SUMMARY when set.

import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith("--") ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []),
);
const outDir = args.out || "canary-results";
const title = args.title || "Vendora canary";
const readJson = (p) => {
  try {
    return p && fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
  } catch {
    return null;
  }
};

const report = readJson(args.results);
const meta = readJson(args.meta);
const preflight = readJson(args.preflight);
const externalBlockers = readJson(args.blockers) || [];

const rows = [];
function walk(suite, trail) {
  const here = suite.title && !suite.title.endsWith(".ts") ? [...trail, suite.title] : trail;
  for (const spec of suite.specs || []) {
    for (const t of spec.tests || []) {
      const results = t.results || [];
      const annotations = [...(t.annotations || []), ...results.flatMap((r) => r.annotations || [])];
      const blockedNote = annotations.find((a) => /^BLOCKED/i.test(a.description || "") || a.type === "blocked");
      const errors = results
        .flatMap((r) => r.errors || (r.error ? [r.error] : []))
        .map((e) => (e.message || "").replace(/\u001b\[[0-9;]*m/g, "").split("\n").filter((l) => l.trim() && !/^\s*(\d+ \||at |>)/.test(l)).slice(0, 14).join(" ").trim())
        .filter(Boolean);
      let bucket;
      if (t.status === "flaky") bucket = "flaky";
      else if (t.status === "unexpected") bucket = "failed";
      else if (t.status === "skipped") {
        // Not run at all (results empty / only "skipped") because a dependency
        // project failed, or skipped with a BLOCKED reason → blocked.
        bucket = blockedNote || results.length === 0 ? "blocked" : "skipped";
      } else bucket = "passed";
      rows.push({
        project: t.projectName,
        file: spec.file,
        title: [...here, spec.title].join(" › "),
        bucket,
        attempts: results.map((r) => r.status),
        reason:
          bucket === "blocked"
            ? blockedNote?.description || "not run: a dependency (setup) failed or was skipped"
            : bucket === "skipped"
              ? annotations.find((a) => a.type === "skip")?.description || ""
              : "",
        errors: bucket === "failed" || bucket === "flaky" ? [...new Set(errors)].slice(0, 2) : [],
        untested: annotations.filter((a) => a.type === "untested").map((a) => a.description),
        notes: annotations
          .filter((a) => ["data", "session", "guard:clientErrors"].includes(a.type))
          .map((a) => `${a.type}: ${a.description}`),
      });
    }
  }
  for (const child of suite.suites || []) walk(child, here);
}
for (const s of report?.suites || []) walk(s, []);

for (const b of externalBlockers) {
  rows.push({ project: b.project || "external", file: "", title: b.title, bucket: "blocked", attempts: [], reason: b.reason, errors: [], untested: [], notes: [] });
}

const count = (b) => rows.filter((r) => r.bucket === b).length;
const totals = {
  passed: count("passed"),
  failed: count("failed"),
  flaky: count("flaky"),
  blocked: count("blocked"),
  skipped: count("skipped"),
};
const missingReport = !report;
const verdict = missingReport ? "error" : totals.failed || totals.blocked ? "fail" : "pass";

const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const md = [];
md.push(`## ${title}: ${verdict === "pass" ? "✅ pass" : verdict === "fail" ? "❌ fail" : "⚠️ no results"}`);
if (verdict === "pass" && totals.flaky) md.push(`> Passed, but **${totals.flaky} flaky** test(s) only passed on retry. See below.`);
if (missingReport) md.push("> The Playwright JSON report was not produced: the test run itself crashed. Treat as a failure.");
md.push("");
md.push("| Passed | Failed | Flaky | Blocked | Skipped |", "|---:|---:|---:|---:|---:|");
md.push(`| ${totals.passed} | ${totals.failed} | ${totals.flaky} | ${totals.blocked} | ${totals.skipped} |`);
md.push("");
if (meta) {
  md.push("### What was tested", "");
  md.push(`- URL: ${meta.tested_url}`);
  md.push(`- Time: ${meta.started_at} · trigger: \`${meta.trigger}\``);
  if (meta.canary_commit) md.push(`- Canary code commit: \`${meta.canary_commit.slice(0, 7)}\``);
  if (meta.deploy_run_commit) md.push(`- Deploy run commit: \`${meta.deploy_run_commit.slice(0, 7)}\` (${meta.deploy_run_url ?? ""})`);
  md.push(`- Deployed build: \`${meta.build?.entry_bundle ?? "unknown"}\` (${meta.build?.server ?? "?"}, HTTP ${meta.build?.http_status ?? "?"})`);
  md.push(
    meta.cloudflare?.available
      ? `- Cloudflare Pages \`${meta.cloudflare.project}\` deployment \`${meta.cloudflare.short_id}\` from \`${meta.cloudflare.branch}@${(meta.cloudflare.commit || "").slice(0, 7)}\` (${meta.cloudflare.created_on})`
      : `- Cloudflare deployment identity: not available (${meta.cloudflare?.reason ?? "no metadata"})`,
  );
  md.push("");
}
if (preflight) {
  const missing = preflight.required.filter((v) => !v.set);
  md.push("### Configuration (names only)", "");
  md.push("| Variable | Required | Set |", "|---|---|---|");
  for (const v of preflight.required) md.push(`| \`${v.name}\` | yes | ${v.set ? "✅" : "❌ **missing**"} |`);
  for (const v of preflight.optional) md.push(`| \`${v.name}\` | no | ${v.set ? "✅" : "—"} |`);
  if (missing.length) md.push("", `**Blocker:** authenticated coverage cannot run until ${missing.map((v) => `\`${v.name}\``).join(", ")} ${missing.length > 1 ? "are" : "is"} set.`);
  md.push("");
}
const section = (bucket, heading, withDetail) => {
  const list = rows.filter((r) => r.bucket === bucket);
  if (!list.length) return;
  md.push(`### ${heading} (${list.length})`, "");
  md.push(withDetail ? "| Project | Test | Detail |" : "| Project | Test |", withDetail ? "|---|---|---|" : "|---|---|");
  for (const r of list) {
    const detail = bucket === "flaky" ? `attempts: ${r.attempts.join(" → ")}. ${r.errors[0] ?? ""}` : r.errors.join(" / ") || r.reason;
    md.push(withDetail ? `| ${r.project} | ${esc(r.title)} | ${esc(detail).slice(0, 400)} |` : `| ${r.project} | ${esc(r.title)} |`);
  }
  md.push("");
};
section("failed", "❌ Failed", true);
section("blocked", "⛔ Blocked", true);
section("flaky", "⚠️ Flaky (passed only on retry)", true);
section("skipped", "Skipped", true);
const untested = [...new Set(rows.flatMap((r) => r.untested))];
if (untested.length) {
  md.push("### Untested coverage (declared by the tests)", "");
  for (const u of untested) md.push(`- ${esc(u)}`);
  md.push("");
}
md.push("<details><summary>Passed tests</summary>", "");
md.push("| Project | Test |", "|---|---|");
for (const r of rows.filter((r) => r.bucket === "passed")) md.push(`| ${r.project} | ${esc(r.title)} |`);
md.push("", "</details>", "");

fs.mkdirSync(outDir, { recursive: true });
const summary = { title, verdict, totals, meta, preflight, tests: rows };
fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(outDir, "summary.md"), md.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join("\n") + "\n");
console.log(`${title}: ${verdict} — ${JSON.stringify(totals)}`);
process.exit(verdict === "pass" ? 0 : 1);
