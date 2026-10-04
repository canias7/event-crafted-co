#!/usr/bin/env node
// Scrubs a results directory before it is uploaded as an artifact.
//
//   node scripts/canary/sanitize.mjs <dir>
//
// - Text files (json, md, xml, html, txt, log): JWTs, Supabase/Stripe secret
//   keys and the literal values of the canary's secret env vars are redacted;
//   non-test email addresses are masked.
// - Binary blobs that can't be inspected as text (trace .zip, images) are
//   checked for the same patterns; a trace containing one is DELETED (fail
//   closed). Authenticated projects don't record traces at all, so this is a
//   second line of defence.
// - Any storage-state file that slipped in is deleted.
// Prints only counts, never what it found.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.argv[2];
if (!root || !fs.existsSync(root)) {
  console.log("sanitize: nothing to scan");
  process.exit(0);
}

const SECRET_ENV = [
  "E2E_SUPABASE_SERVICE_ROLE_KEY",
  "E2E_VENDOR_PASSWORD",
  "CLOUDFLARE_API_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "LOCAL_SERVICE_ROLE_KEY",
];
const literals = SECRET_ENV.map((n) => process.env[n]).filter((v) => v && v.length >= 8);
const PATTERNS = [
  /eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, // JWT (access / refresh-bearing)
  /sb_secret_[\w-]+/g,
  /sk_(live|test)_[\w]+/g,
  /whsec_[\w]+/g,
  /"refresh_token"\s*:\s*"[^"]+"/g,
];
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const TEXT_EXT = new Set([".json", ".md", ".xml", ".html", ".txt", ".log", ".csv", ".js", ".css"]);

let redactedFiles = 0;
let deleted = 0;

// Email masking only on data files: in the HTML report's bundled JS a
// pattern like "pkg@1.2.3" looks like an address, and rewriting code would
// break the report.
const MASK_EMAIL_EXT = new Set([".json", ".md", ".xml", ".txt", ".log", ".csv"]);

function redact(text, ext) {
  let out = text;
  for (const lit of literals) out = out.split(lit).join("<redacted-secret>");
  for (const re of PATTERNS) out = out.replace(re, "<redacted>");
  if (MASK_EMAIL_EXT.has(ext)) {
    out = out.replace(EMAIL, (m) => (m.endsWith("@eventvendora.test") || m.endsWith("@example.com") ? m : "<email>"));
  }
  return out;
}

function containsSecret(buf) {
  const s = buf.toString("latin1");
  return literals.some((l) => s.includes(l)) || PATTERNS.some((re) => new RegExp(re.source).test(s));
}

function zipContainsSecret(file) {
  try {
    const listing = execFileSync("unzip", ["-p", file], { maxBuffer: 512 * 1024 * 1024 });
    return containsSecret(listing);
  } catch {
    return true; // can't inspect → don't publish
  }
}

function visit(p) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    if (path.basename(p) === ".auth") {
      fs.rmSync(p, { recursive: true, force: true });
      deleted++;
      return;
    }
    for (const f of fs.readdirSync(p)) visit(path.join(p, f));
    return;
  }
  const ext = path.extname(p).toLowerCase();
  if (/storage-?state|auth.*\.json$/i.test(path.basename(p)) && ext === ".json" && !p.includes("summary")) {
    const text = fs.readFileSync(p, "utf8");
    if (/-auth-token|access_token/.test(text)) {
      fs.rmSync(p);
      deleted++;
      return;
    }
  }
  if (TEXT_EXT.has(ext)) {
    const text = fs.readFileSync(p, "utf8");
    const clean = redact(text, ext);
    if (clean !== text) {
      fs.writeFileSync(p, clean);
      redactedFiles++;
    }
    return;
  }
  if (ext === ".zip") {
    if (zipContainsSecret(p)) {
      fs.rmSync(p);
      deleted++;
    }
    return;
  }
  // Images / other binaries: drop if they carry a secret literal.
  if (containsSecret(fs.readFileSync(p))) {
    fs.rmSync(p);
    deleted++;
  }
}

visit(root);
console.log(`sanitize: ${redactedFiles} text file(s) redacted, ${deleted} file(s)/dir(s) removed`);
