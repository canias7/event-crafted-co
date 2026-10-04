import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import { startFunction, startStub, type RunningFunction, type Stub } from "./harness";

// Webhook signature + duplicate-delivery contracts, run against the REAL edge
// function code (supabase/functions/*) with synthetic secrets and a stub
// database. Independent of the migration replay, so these run even when the
// local Supabase stack can't be built. No external calls: payment, email and
// streaming providers are unreachable from the function process.

const STRIPE_SECRET = "whsec_canary_test_secret";
const now = () => Math.floor(Date.now() / 1000);

function stripeSignature(payload: string, secret: string, t = now()): string {
  const v1 = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

function stripeEvent(id: string, type: string): string {
  return JSON.stringify({
    id,
    object: "event",
    type,
    api_version: "2024-06-20",
    created: now(),
    livemode: false,
    data: { object: { id: `obj_${id}`, object: "customer" } },
  });
}

async function post(fn: RunningFunction, body: string, headers: Record<string, string> = {}) {
  const res = await fetch(fn.url, { method: "POST", body, headers: { "content-type": "application/json", ...headers } });
  return { status: res.status, text: await res.text() };
}

for (const fnName of ["stripe-webhook", "vendorapay-webhook"] as const) {
  test.describe(`${fnName}: Stripe signature + dedupe`, () => {
    test.describe.configure({ mode: "serial" });
    let stub: Stub;
    let fn: RunningFunction;

    test.beforeAll(async () => {
      stub = await startStub();
      fn = await startFunction(fnName, {
        STRIPE_SECRET_KEY: "sk_test_canary_not_a_real_key",
        STRIPE_WEBHOOK_SECRET: STRIPE_SECRET,
        VENDORAPAY_WEBHOOK_SECRET: STRIPE_SECRET,
        SUPABASE_URL: stub.url,
        SUPABASE_SERVICE_ROLE_KEY: "stub-service-role",
      });
    });
    test.afterAll(async () => {
      await fn?.stop();
      await stub?.stop();
    });

    test("rejects a request with no signature, before touching the database", async () => {
      const r = await post(fn, stripeEvent("evt_nosig", "customer.created"));
      expect(r.status).toBe(400);
      expect(stub.requests, "no DB access on an unsigned request").toEqual([]);
    });

    test("rejects a forged signature, before touching the database", async () => {
      const body = stripeEvent("evt_forged", "customer.created");
      const r = await post(fn, body, { "stripe-signature": stripeSignature(body, "whsec_attacker_guess") });
      expect(r.status).toBe(400);
      expect(r.text).toContain("invalid signature");
      expect(stub.requests).toEqual([]);
    });

    test("rejects a correctly signed but stale (replayed) event", async () => {
      const body = stripeEvent("evt_stale", "customer.created");
      const r = await post(fn, body, { "stripe-signature": stripeSignature(body, STRIPE_SECRET, now() - 3600) });
      expect(r.status, "Stripe's 5-minute tolerance should reject a 1h-old signature").toBe(400);
      expect(stub.requests).toEqual([]);
    });

    test("rejects a body altered after signing", async () => {
      const body = stripeEvent("evt_tamper", "customer.created");
      const sig = stripeSignature(body, STRIPE_SECRET);
      const r = await post(fn, body.replace("customer.created", "checkout.session.completed"), { "stripe-signature": sig });
      expect(r.status).toBe(400);
    });

    if (fnName === "stripe-webhook") {
      test("accepts a valid event once and logs it for dedupe", async () => {
        const body = stripeEvent("evt_valid_1", "customer.created");
        const r = await post(fn, body, { "stripe-signature": stripeSignature(body, STRIPE_SECRET) });
        expect(r.status, fn.logs().slice(-500)).toBe(200);
        expect(r.text).toBe("ok");
        const logged = stub.writes("stripe_events");
        expect(logged.length).toBe(1);
        expect((logged[0].body as { id: string }).id).toBe("evt_valid_1");
      });

      test("a duplicate delivery is acknowledged without being processed again", async () => {
        const before = stub.writes().length;
        const body = stripeEvent("evt_valid_1", "customer.created");
        const r = await post(fn, body, { "stripe-signature": stripeSignature(body, STRIPE_SECRET) });
        expect(r.status).toBe(200);
        expect(r.text).toBe("ok (duplicate)");
        // Only the (conflicting) dedupe insert was attempted — no handler writes.
        const after = stub.writes().slice(before);
        expect(after.map((w) => w.table)).toEqual(["stripe_events"]);
      });
    } else {
      test("accepts a valid event of a type it doesn't handle, without DB writes", async () => {
        const body = stripeEvent("evt_ignored", "customer.created");
        const r = await post(fn, body, { "stripe-signature": stripeSignature(body, STRIPE_SECRET) });
        expect(r.status, fn.logs().slice(-500)).toBe(200);
        expect(r.text).toBe("ok (ignored)");
        expect(stub.writes()).toEqual([]);
      });

      test("a duplicate delivery of a handled event is acknowledged without processing", async () => {
        // Pretend this payment event was already processed (row exists), so the
        // handler must stop at the dedupe insert and never reach Stripe or
        // the payment tables.
        stub.seed("stripe_events", "evt_dup_pi");
        const body = stripeEvent("evt_dup_pi", "payment_intent.succeeded");
        const r = await post(fn, body, { "stripe-signature": stripeSignature(body, STRIPE_SECRET) });
        expect(r.status, fn.logs().slice(-500)).toBe(200);
        expect(r.text).toBe("ok (duplicate)");
        expect(stub.writes().map((w) => w.table)).toEqual(["stripe_events"]);
      });
    }
  });
}

// ---- resend-webhook (Svix signatures) ----

const RESEND_KEY = crypto.randomBytes(24);
const RESEND_SECRET = `whsec_${RESEND_KEY.toString("base64")}`;

function svixHeaders(id: string, body: string, key: Buffer, ts = now()) {
  const sig = crypto.createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  return { "svix-id": id, "svix-timestamp": String(ts), "svix-signature": `v1,${sig}` };
}

const resendBody = (emailId: string) =>
  JSON.stringify({
    type: "email.delivered",
    created_at: new Date().toISOString(),
    data: { email_id: emailId, to: ["e2e-host-1@eventvendora.test"], subject: "Canary synthetic" },
  });

test.describe("resend-webhook: Svix signature + dedupe", () => {
  test.describe.configure({ mode: "serial" });
  let stub: Stub;
  let fn: RunningFunction;
  test.beforeAll(async () => {
    stub = await startStub();
    fn = await startFunction("resend-webhook", {
      RESEND_WEBHOOK_SECRET: RESEND_SECRET,
      SUPABASE_URL: stub.url,
      SUPABASE_SERVICE_ROLE_KEY: "stub-service-role",
    });
  });
  test.afterAll(async () => {
    await fn?.stop();
    await stub?.stop();
  });

  test("rejects missing signature headers", async () => {
    const r = await post(fn, resendBody("em_1"));
    expect(r.status).toBe(401);
    expect(stub.requests).toEqual([]);
  });

  test("rejects a forged signature", async () => {
    const body = resendBody("em_1");
    const r = await post(fn, body, svixHeaders("msg_forged", body, crypto.randomBytes(24)));
    expect(r.status).toBe(401);
    expect(stub.requests).toEqual([]);
  });

  test("accepts a valid event and upserts it idempotently", async () => {
    const body = resendBody("em_valid");
    const r = await post(fn, body, svixHeaders("msg_valid", body, RESEND_KEY));
    expect(r.status, fn.logs().slice(-500)).toBe(200);
    const w = stub.writes("email_events");
    expect(w.length).toBe(1);
    expect(w[0].query, "must upsert on resend_event_id so retries can't double-count").toContain("on_conflict=resend_event_id");
  });

  test("a duplicate delivery maps to the same idempotency key", async () => {
    const body = resendBody("em_valid");
    const r = await post(fn, body, svixHeaders("msg_valid", body, RESEND_KEY));
    expect(r.status).toBe(200);
    const keys = stub.writes("email_events").flatMap((w) => (w.body as { resend_event_id: string }[]).map((x) => x.resend_event_id));
    expect(new Set(keys).size, "both deliveries must target one row").toBe(1);
  });

  test("rejects a correctly signed but stale (replayed) event", async () => {
    // Svix's spec rejects timestamps outside a 5-minute window to bound replays.
    const before = stub.writes().length;
    const body = resendBody("em_stale");
    const r = await post(fn, body, svixHeaders("msg_stale", body, RESEND_KEY, now() - 24 * 3600));
    expect(r.status, "a day-old signed webhook should be rejected").toBe(401);
    expect(stub.writes().length).toBe(before);
  });
});

// ---- mux-webhook (Standard-Webhooks style t=,v1=) ----

const MUX_SECRET = "mux_canary_secret";
const muxSig = (body: string, secret: string, t = now()) =>
  `t=${t},v1=${crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
const muxBody = JSON.stringify({ type: "video.asset.ready", data: { id: "asset_canary" } });

test.describe("mux-webhook: signature checks", () => {
  test.describe.configure({ mode: "serial" });
  let stub: Stub;
  let fn: RunningFunction;
  test.beforeAll(async () => {
    stub = await startStub();
    fn = await startFunction("mux-webhook", {
      MUX_WEBHOOK_SECRET: MUX_SECRET,
      SUPABASE_URL: stub.url,
      SUPABASE_SERVICE_ROLE_KEY: "stub-service-role",
    });
  });
  test.afterAll(async () => {
    await fn?.stop();
    await stub?.stop();
  });

  test("accepts a valid signature", async () => {
    const r = await post(fn, muxBody, { "mux-signature": muxSig(muxBody, MUX_SECRET) });
    expect(r.status, fn.logs().slice(-500)).toBe(200);
  });

  test("rejects a forged signature", async () => {
    const r = await post(fn, muxBody, { "mux-signature": muxSig(muxBody, "wrong") });
    expect(r.status).toBe(400);
  });

  test("rejects a stale signature (5-minute window)", async () => {
    const r = await post(fn, muxBody, { "mux-signature": muxSig(muxBody, MUX_SECRET, now() - 3600) });
    expect(r.status).toBe(400);
  });
});

test("mux-webhook fails closed when MUX_WEBHOOK_SECRET is not configured", async () => {
  // A deploy missing the secret must reject events rather than let anyone
  // flip live-stream state with an unsigned request.
  const stub = await startStub();
  const fn = await startFunction("mux-webhook", { SUPABASE_URL: stub.url, SUPABASE_SERVICE_ROLE_KEY: "stub-service-role" });
  try {
    const r = await post(fn, muxBody);
    expect(r.status, "unsigned event accepted while the secret is unset").toBeGreaterThanOrEqual(400);
  } finally {
    await fn.stop();
    await stub.stop();
  }
});
