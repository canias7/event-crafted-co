import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Everything the hoisted vi.mock factory needs must itself be hoisted.
const { mockClient } = vi.hoisted(() => {
  const THREADS = [
    { id: "A", title: "hey wassup", updated_at: "2026-06-01T22:46:29Z" },
    { id: "B", title: "hey how are you", updated_at: "2026-06-01T15:45:40Z" },
  ];
  const MESSAGES: Record<string, any[]> = {
    A: [
      { id: "a1", role: "user", type: "text", content: "hey wassup", attachments: null, created_at: "2026-06-01T22:46:00Z" },
      { id: "a2", role: "assistant", type: "text", content: "REPLY_IN_THREAD_A", attachments: null, created_at: "2026-06-01T22:46:10Z" },
    ],
    B: [
      { id: "b1", role: "user", type: "text", content: "hey how are you", attachments: null, created_at: "2026-06-01T15:45:00Z" },
      { id: "b2", role: "assistant", type: "text", content: "REPLY_IN_THREAD_B", attachments: null, created_at: "2026-06-01T15:45:10Z" },
    ],
  };

  function from(table: string) {
    const state: { table: string; threadId?: string; maybeSingle?: boolean } = { table };
    const q: any = {
      select: () => q,
      order: () => q,
      limit: () => q,
      update: () => q,
      ilike: () => q,
      in: () => q,
      not: () => q,
      eq: (col: string, val: string) => {
        if (col === "thread_id") state.threadId = val;
        return q;
      },
      maybeSingle: () => {
        state.maybeSingle = true;
        return q;
      },
      single: () => q,
      then: (onF: any, onR: any) => Promise.resolve(resolve(state)).then(onF, onR),
    };
    return q;
  }
  // Simulate a transient warmup: the very first my_space_messages query
  // comes back empty (as if the session/connection wasn't ready), then
  // subsequent queries return the real rows.
  let messageQueryCount = 0;
  function resolve(state: { table: string; threadId?: string; maybeSingle?: boolean }) {
    if (state.table === "my_space_threads") return { data: THREADS, error: null };
    if (state.table === "my_space_messages") {
      messageQueryCount++;
      if (messageQueryCount === 1) return { data: [], error: null };
      return { data: MESSAGES[state.threadId ?? ""] ?? [], error: null };
    }
    return { data: state.maybeSingle ? null : [], error: null };
  }
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    mockClient: {
      from,
      channel: () => channel,
      removeChannel: () => {},
      auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) },
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockClient }));
// Mimic auth hydration on a fresh page load: `user` is undefined for the
// first render(s), then resolves a tick later. This makes loadThreads run
// twice (empty → real), exactly like production.
vi.mock("@/hooks/useAuth", async () => {
  const React = await import("react");
  return {
    useAuth: () => {
      const [user, setUser] = React.useState<{ id: string } | null>(null);
      React.useEffect(() => {
        const t = setTimeout(() => setUser({ id: "u1" }), 30);
        return () => clearTimeout(t);
      }, []);
      return { user };
    },
  };
});

import { MySpaceChat } from "@/components/super-agents/MySpaceChat";

describe("MySpaceChat — initial thread load", () => {
  it("recovers from a transient-empty first response and shows the auto-selected thread's messages without switching", async () => {
    render(<MySpaceChat />);
    // First my_space_messages query returns empty (warmup); the loader
    // retries and the assistant reply appears — no thread switch needed.
    await waitFor(
      () => expect(screen.getByText("REPLY_IN_THREAD_A")).toBeInTheDocument(),
      { timeout: 3000 },
    );
  });
});
