import { test as base, expect, type Page } from "@playwright/test";
import { FIRST_PARTY_HOSTS } from "./env";

// Every canary test runs through this fixture. It watches the browser for the
// failures a plain "HTTP 200" check misses and fails the test on:
//   - uncaught page errors (pageerror)
//   - console.error messages that aren't on the narrow known-noise list
//   - first-party requests (site + Supabase) that fail at the network level
//     or come back 5xx
// 4xx responses from first-party hosts are recorded as annotations (PostgREST
// legitimately returns 401/406 in some flows) so they show up in the report
// without failing the run on their own.

// Known third-party / browser noise that says nothing about the app. Keep this
// list short and specific: every entry hides a class of message.
const CONSOLE_NOISE: RegExp[] = [
  /challenges\.cloudflare\.com/i, // Turnstile iframe chatter
  /Failed to load resource: the server responded with a status of 4\d\d/i, // covered by the 4xx annotations
  /\[GSI_LOGGER\]/i,
  /Download the React DevTools/i,
  /ResizeObserver loop/i,
  /favicon/i,
];

const IGNORED_FAILURES: RegExp[] = [
  /net::ERR_ABORTED/i, // in-flight requests cancelled by a navigation
  /NS_BINDING_ABORTED/i,
];

export interface GuardLog {
  pageErrors: string[];
  consoleErrors: string[];
  failedRequests: string[];
  serverErrors: string[];
  clientErrors: string[];
}

function isFirstParty(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return FIRST_PARTY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

// Strip query strings + anything token-shaped before a URL goes in a report.
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "<jwt>");
  } catch {
    return "<unparseable url>";
  }
}

export function redactText(text: string): string {
  return text
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "<jwt>")
    .replace(/(sb_secret_|sk_live_|sk_test_|whsec_)[\w-]+/g, "$1<redacted>")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, (m) => (m.endsWith("@eventvendora.test") ? m : "<email>"));
}

export function attachGuard(page: Page): GuardLog {
  const log: GuardLog = {
    pageErrors: [],
    consoleErrors: [],
    failedRequests: [],
    serverErrors: [],
    clientErrors: [],
  };
  page.on("pageerror", (err) => log.pageErrors.push(redactText(err.message)));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (CONSOLE_NOISE.some((re) => re.test(text))) return;
    log.consoleErrors.push(redactText(text).slice(0, 300));
  });
  page.on("requestfailed", (req) => {
    const failure = req.failure()?.errorText ?? "unknown";
    if (!isFirstParty(req.url())) return;
    if (IGNORED_FAILURES.some((re) => re.test(failure))) return;
    log.failedRequests.push(`${req.method()} ${redactUrl(req.url())} — ${failure}`);
  });
  page.on("response", (res) => {
    if (!isFirstParty(res.url())) return;
    const s = res.status();
    if (s >= 500) log.serverErrors.push(`${s} ${res.request().method()} ${redactUrl(res.url())}`);
    else if (s >= 400) log.clientErrors.push(`${s} ${res.request().method()} ${redactUrl(res.url())}`);
  });
  return log;
}

type Fixtures = { guard: GuardLog };

export const test = base.extend<Fixtures>({
  guard: [
    async ({ page }, use, testInfo) => {
      const log = attachGuard(page);
      await use(log);
      // Record everything (sanitized) so the report shows it even on a pass.
      for (const [type, list] of Object.entries(log)) {
        for (const description of (list as string[]).slice(0, 20)) {
          testInfo.annotations.push({ type: `guard:${type}`, description });
        }
      }
      // A test can opt out of the guard's verdict (e.g. it deliberately
      // provokes an error) by annotating `guard:off`.
      if (testInfo.annotations.some((a) => a.type === "guard:off")) return;
      if (testInfo.status !== "passed") return; // don't mask the real failure
      expect.soft(log.pageErrors, "Uncaught page errors").toEqual([]);
      expect.soft(log.consoleErrors, "Unexpected console errors").toEqual([]);
      expect.soft(log.failedRequests, "Failed first-party requests").toEqual([]);
      expect.soft(log.serverErrors, "First-party 5xx responses").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

// The page is "settled": no full-screen auth spinner, no skeleton-only body.
// Catches pages that render a loading state forever.
export async function expectSettled(page: Page, timeout = 20_000) {
  await expect(page.getByText("Loading…", { exact: true }), "stuck on the Loading… spinner").toHaveCount(0, {
    timeout,
  });
  await expect
    .poll(async () => (await page.locator("body").innerText()).trim().length, {
      message: "page body never rendered real content",
      timeout,
    })
    .toBeGreaterThan(40);
}

// No horizontal scrolling at the current viewport (2px rounding tolerance).
export async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const el = document.scrollingElement || document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
  expect(overflow, `horizontal overflow on ${label}`).toBeLessThanOrEqual(2);
}
