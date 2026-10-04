import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Test harness for running real Supabase edge functions in isolation.
//
// - startStub(): a tiny PostgREST stand-in. It records every request the
//   function makes and emulates the one behavior the webhook contracts depend
//   on: a unique-key conflict (23505) on a duplicate insert.
// - startFunction(): runs supabase/functions/<name>/index.ts UNMODIFIED under
//   Deno (via launch.ts, which only moves the listener to a free port), with
//   synthetic secrets, the stub as SUPABASE_URL, cached modules only, and all
//   outbound HTTPS pointed at a dead proxy — so no real Stripe / Resend / Mux
//   / AI call can leave the runner.

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../../../..");
const LAUNCHER = path.join(here, "webhooks/launch.ts");
const DENO = process.env.DENO_BIN || "deno";

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

export interface StubRequest {
  method: string;
  table: string;
  query: string;
  body: unknown;
}

export interface Stub {
  url: string;
  requests: StubRequest[];
  /** Pretend a row with this key already exists (next insert → 23505). */
  seed(table: string, key: string): void;
  writes(table?: string): StubRequest[];
  stop(): Promise<void>;
}

// Keys that make a row unique per table, for conflict emulation.
const UNIQUE_KEY: Record<string, string> = {
  stripe_events: "id",
  email_events: "resend_event_id",
};

export async function startStub(): Promise<Stub> {
  const requests: StubRequest[] = [];
  const seen = new Map<string, Set<string>>();
  const keyset = (t: string) => {
    if (!seen.has(t)) seen.set(t, new Set());
    return seen.get(t)!;
  };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://stub");
      const table = url.pathname.replace(/^\/rest\/v1\//, "");
      let body: unknown = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = raw;
      }
      requests.push({ method: req.method ?? "", table, query: url.search, body });
      const send = (status: number, payload: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
      };
      if (req.method === "POST" && UNIQUE_KEY[table]) {
        const rows = Array.isArray(body) ? body : [body];
        const k = UNIQUE_KEY[table];
        const isUpsert = /on_conflict=/.test(url.search) || /resolution=merge-duplicates/.test(String(req.headers.prefer ?? ""));
        const dup = rows.some((r) => keyset(table).has(String((r as Record<string, unknown>)?.[k])));
        if (dup && !isUpsert) {
          return send(409, { code: "23505", message: "duplicate key value violates unique constraint" });
        }
        rows.forEach((r) => keyset(table).add(String((r as Record<string, unknown>)?.[k])));
        return send(201, []);
      }
      if (req.method === "GET") return send(200, []);
      return send(req.method === "POST" ? 201 : 200, []);
    });
  });
  const port = await freePort();
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    seed: (table, key) => keyset(table).add(key),
    writes: (table) => requests.filter((r) => r.method !== "GET" && (!table || r.table === table)),
    stop: () => new Promise((r) => server.close(() => r())),
  };
}

export interface RunningFunction {
  url: string;
  logs: () => string;
  stop: () => Promise<void>;
}

export async function startFunction(name: string, env: Record<string, string | undefined>): Promise<RunningFunction> {
  const port = await freePort();
  const entry = path.join(REPO_ROOT, "supabase/functions", name, "index.ts");
  let out = "";
  const childEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    DENO_DIR: process.env.DENO_DIR,
    DENO_CERT: process.env.DENO_CERT,
    HARNESS_PORT: String(port),
    // No egress: any external HTTPS call fails fast instead of reaching a real
    // provider. The stub is on 127.0.0.1, which bypasses the proxy.
    HTTPS_PROXY: "http://127.0.0.1:9",
    HTTP_PROXY: "http://127.0.0.1:9",
    NO_PROXY: "127.0.0.1,localhost",
  };
  for (const [k, v] of Object.entries(env)) if (v !== undefined) childEnv[k] = v;
  const child: ChildProcess = spawn(
    DENO,
    ["run", "-A", "--cached-only", "--no-lock", LAUNCHER, entry],
    { env: childEnv, cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout?.on("data", (d) => (out += d));
  child.stderr?.on("data", (d) => (out += d));

  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`${name} exited during startup:\n${out.slice(-2000)}`);
    try {
      await fetch(url, { method: "OPTIONS" });
      break;
    } catch {
      if (Date.now() > deadline) throw new Error(`${name} did not start in 60s:\n${out.slice(-2000)}`);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return {
    url,
    logs: () => out,
    stop: async () => {
      child.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 100));
    },
  };
}
