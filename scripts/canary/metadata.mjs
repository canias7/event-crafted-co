#!/usr/bin/env node
// Records WHAT the canary tested: URL, the deployed build (entry bundle
// fingerprint), the Cloudflare Pages production deployment (id + commit) when
// a token is available, the triggering commit, and the time.
//
// Usage: node scripts/canary/metadata.mjs <out.json>
// Never prints secrets; the Cloudflare token is only sent to api.cloudflare.com.

import fs from "node:fs";
import path from "node:path";

const out = process.argv[2] || "apps/web/canary-results/metadata.json";
const baseUrl = (process.env.CANARY_BASE_URL || "https://eventvendora.com").replace(/\/$/, "");
const project = process.env.CANARY_PAGES_PROJECT || "vendora-web";

async function deployedBuild() {
  try {
    const res = await fetch(`${baseUrl}/`, { headers: { "cache-control": "no-cache" } });
    const html = await res.text();
    return {
      http_status: res.status,
      server: res.headers.get("server"),
      cf_ray: res.headers.get("cf-ray"),
      entry_bundle: html.match(/\/assets\/index-[\w-]+\.js/)?.[0] ?? null,
    };
  } catch (err) {
    return { error: String(err?.message ?? err) };
  }
}

async function cloudflareDeployment() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) return { available: false, reason: "CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID not provided to the canary" };
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${project}/deployments?env=production&per_page=1`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return { available: false, reason: `Cloudflare API ${res.status}` };
    const body = await res.json();
    const d = body?.result?.[0];
    if (!d) return { available: false, reason: "no production deployment returned" };
    return {
      available: true,
      project,
      id: d.id,
      short_id: d.short_id,
      url: d.url,
      created_on: d.created_on,
      branch: d.deployment_trigger?.metadata?.branch ?? null,
      commit: d.deployment_trigger?.metadata?.commit_hash ?? null,
      status: d.latest_stage?.status ?? null,
    };
  } catch (err) {
    return { available: false, reason: String(err?.message ?? err) };
  }
}

const meta = {
  tested_url: baseUrl,
  started_at: new Date().toISOString(),
  trigger: process.env.GITHUB_EVENT_NAME || "local",
  canary_commit: process.env.GITHUB_SHA || null,
  // For workflow_run triggers: the commit the deploy workflow just shipped.
  deploy_run_commit: process.env.CANARY_DEPLOY_SHA || null,
  deploy_run_url: process.env.CANARY_DEPLOY_RUN_URL || null,
  run_url: process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null,
  build: await deployedBuild(),
  cloudflare: await cloudflareDeployment(),
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(meta, null, 2));
console.log(`tested ${meta.tested_url} · bundle ${meta.build.entry_bundle ?? "?"} · cloudflare ${meta.cloudflare.available ? `${meta.cloudflare.short_id} @ ${meta.cloudflare.commit?.slice(0, 7)}` : `n/a (${meta.cloudflare.reason})`}`);
