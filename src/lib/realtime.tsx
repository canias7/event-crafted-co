import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// One realtime channel per signed-in user, shared across the app.
// Pages register listeners via useRealtime() and the provider does
// the .on()/.subscribe() once. This cuts channel count 2-3× vs. the
// previous pattern where every component opened its own channel —
// matters for the Supabase realtime tier (Pro = 500 concurrent).
//
// Listener lifecycle:
//   - Components call useRealtime({ table, filter }, callback)
//   - The hook attaches a single .on() to the shared channel
//   - On unmount, the listener wrapper is no-op'd; the .on() binding
//     stays attached for the channel's lifetime, but the wrapper
//     short-circuits so nothing fires.
//
// The channel itself only tears down when the user signs out (the
// provider re-creates it on user change).

interface ListenerConfig {
  table: string;
  filter?: string;
  /** Defaults to "*" — INSERT | UPDATE | DELETE. */
  event?: "*" | "INSERT" | "UPDATE" | "DELETE";
}

type Listener = (payload: { new: unknown; old: unknown }) => void;

interface ContextValue {
  /** Register a listener; returns an unsubscribe function. */
  subscribe: (config: ListenerConfig, listener: Listener) => () => void;
}

const Ctx = createContext<ContextValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Tracks all active listeners so we can dispatch from the single
  // postgres_changes handler. Stored as a Set per (table, event,
  // filter) key.
  const listenersRef = useRef(new Map<string, Set<Listener>>());
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!user) {
      // Drop any existing channel when the user logs out.
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      listenersRef.current.clear();
      return;
    }

    const channel = supabase.channel(`user-${user.id}`);
    channelRef.current = channel;

    // Single broad-spectrum listener for the public schema. We dispatch
    // to fine-grained per-table/event listeners ourselves so we don't
    // need an .on() per (table, event) tuple.
    channel.on(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "postgres_changes" as any,
      { event: "*", schema: "public" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload: any) => {
        const table = payload.table as string;
        const evt = payload.eventType as string;
        // Match any registered listener for this table+event combo.
        for (const [key, set] of listenersRef.current.entries()) {
          const [t, e] = key.split("|");
          if (t !== table) continue;
          if (e !== "*" && e !== evt) continue;
          for (const fn of set) fn(payload);
        }
      },
    );
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const value = useMemo<ContextValue>(
    () => ({
      subscribe(config, listener) {
        const event = config.event ?? "*";
        const key = `${config.table}|${event}`;
        let set = listenersRef.current.get(key);
        if (!set) {
          set = new Set();
          listenersRef.current.set(key, set);
        }
        // Wrap listener with optional filter check. The filter syntax
        // matches Supabase's: e.g. "user_id=eq.<uuid>".
        const wrapped: Listener = (payload) => {
          if (config.filter && !matchesFilter(payload, config.filter)) return;
          listener(payload);
        };
        set.add(wrapped);
        return () => {
          set?.delete(wrapped);
        };
      },
    }),
    [],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Subscribe a callback to postgres_changes on the user-scoped channel.
 * Listener is automatically unregistered on unmount.
 */
export function useRealtime(
  config: ListenerConfig | null,
  listener: Listener,
) {
  const ctx = useContext(Ctx);
  // Keep a ref to the latest listener so we don't have to resubscribe
  // every render when the callback identity changes.
  const listenerRef = useRef(listener);
  useEffect(() => {
    listenerRef.current = listener;
  }, [listener]);

  useEffect(() => {
    if (!ctx || !config) return;
    return ctx.subscribe(config, (payload) => listenerRef.current(payload));
    // Stringify config so callers can pass inline objects without
    // triggering re-subscribe.
  }, [ctx, config?.table, config?.event, config?.filter]);
}

function matchesFilter(payload: { new: unknown; old: unknown }, filter: string) {
  // Supports the most common form: "column=eq.value". Returns true
  // for anything more exotic so the consumer doesn't accidentally
  // drop events.
  const m = /^([a-z_]+)=eq\.(.+)$/.exec(filter);
  if (!m) return true;
  const [, col, expected] = m;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = (payload.new ?? payload.old) as Record<string, any> | null;
  if (!row) return false;
  return String(row[col]) === expected;
}
