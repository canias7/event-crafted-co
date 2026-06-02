import { describe, it, expect, vi } from "vitest";

// Toast is a UI side-effect; stub it so the handlers run headless.
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { handleEmailBillingError, handleInsufficientCredits } from "./credits";

// Mimic a FunctionsHttpError: the JSON body hangs off err.context.
function errWith(body: unknown): unknown {
  return { context: { json: async () => body } };
}
const navigate = () => {};

describe("handleEmailBillingError", () => {
  it("handles both billing responses (email_not_enabled + insufficient_credits)", async () => {
    expect(await handleEmailBillingError(errWith({ error: "email_not_enabled" }), navigate)).toBe(true);
    expect(
      await handleEmailBillingError(errWith({ error: "insufficient_credits", cost: 3 }), navigate),
    ).toBe(true);
  });

  it("returns false for unrelated errors and missing context", async () => {
    expect(await handleEmailBillingError(errWith({ error: "something_else" }), navigate)).toBe(false);
    expect(await handleEmailBillingError(new Error("network"), navigate)).toBe(false);
  });
});

describe("handleInsufficientCredits", () => {
  it("fires only on insufficient_credits", async () => {
    expect(
      await handleInsufficientCredits(errWith({ error: "insufficient_credits", cost: 5 }), navigate),
    ).toBe(true);
    expect(await handleInsufficientCredits(errWith({ error: "email_not_enabled" }), navigate)).toBe(false);
  });
});
