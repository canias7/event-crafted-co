// k6 load test for Event Vendora.
//
// Single-box curl tests top out at the sandbox's egress; this lets you
// drive real distributed load (locally with `k6 run`, or massively with
// k6 Cloud) to find the platform's actual breaking point.
//
// Usage:
//   # public edge function (no auth)
//   TARGET=public k6 run loadtest/k6-vendor-read.js
//
//   # authenticated data path — pass a JSON array of vendor JWTs
//   TARGET=auth TOKENS="$(cat tokens.json)" k6 run loadtest/k6-vendor-read.js
//
//   # compare the two query patterns the DB profiling exposed:
//   #   FILTER=none  -> unfiltered select (RLS scans whole table: ~91ms/req)
//   #   FILTER=user  -> select ...&user_id=eq.<uid> (index scan: ~7.7ms/req)
//   TARGET=auth FILTER=user TOKENS="$(cat tokens.json)" k6 run loadtest/k6-vendor-read.js
//
// Get tokens.json by minting sessions server-side with the service role
// (the public login is captcha-gated, so k6 can't log in directly):
//   supabase.auth.admin.generateLink({type:'magiclink',email}) -> verifyOtp
// and write {"<email>": "<access_token>", ...} or just ["jwt1","jwt2",...].

import http from "k6/http";
import { check } from "k6";
import { Trend, Rate } from "k6/metrics";

const PROJECT = __ENV.PROJECT_REF || "pahpjjubhbcbwqjpamwv";
const BASE = `https://${PROJECT}.supabase.co`;
const ANON = __ENV.ANON_KEY || ""; // anon/publishable key, required for the gateway
const TARGET = __ENV.TARGET || "public";
const FILTER = __ENV.FILTER || "none";

// Parse tokens: accept a JSON array, or a JSON object of {email: jwt}.
let TOKENS = [];
if (__ENV.TOKENS) {
  const parsed = JSON.parse(__ENV.TOKENS);
  TOKENS = Array.isArray(parsed) ? parsed : Object.values(parsed);
}

const latency = new Trend("req_latency_ms", true);
const errors = new Rate("req_errors");

// Ramp profile: climb the concurrency ladder so you can see the knee.
export const options = {
  scenarios: {
    ramp: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "20s", target: 25 },
        { duration: "30s", target: 50 },
        { duration: "30s", target: 100 },
        { duration: "30s", target: 200 },
        { duration: "20s", target: 0 },
      ],
      gracefulRampDown: "5s",
    },
  },
  thresholds: {
    req_errors: ["rate<0.05"],          // <5% errors
    req_latency_ms: ["p(95)<3000"],     // p95 under 3s
  },
};

export default function () {
  let url, headers;
  if (TARGET === "auth") {
    const jwt = TOKENS[Math.floor(Math.random() * TOKENS.length)];
    // Decode the JWT 'sub' for the indexed-filter variant.
    let uid = "";
    try {
      uid = JSON.parse(
        decodeURIComponent(escape(atobLike(jwt.split(".")[1]))),
      ).sub;
    } catch (_e) { /* leave blank */ }
    const filter = FILTER === "user" && uid ? `&user_id=eq.${uid}` : "";
    url = `${BASE}/rest/v1/vendor_profiles?select=id,business_name,application_status${filter}`;
    headers = { apikey: ANON, Authorization: `Bearer ${jwt}` };
  } else {
    url = `${BASE}/functions/v1/sitemap-xml`;
    headers = { apikey: ANON };
  }

  const res = http.get(url, { headers });
  latency.add(res.timings.duration);
  errors.add(res.status >= 400);
  check(res, { "status 200": (r) => r.status === 200 });
}

// k6 has atob via encoding, but keep a tiny base64url decoder for safety.
function atobLike(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  // k6's global atob is available in recent versions; fall back if not.
  // eslint-disable-next-line no-undef
  return typeof atob === "function" ? atob(b64) : __ENV.__noatob || "";
}
