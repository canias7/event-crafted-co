// HILUX sandbox — vendor preview chat. Pick a listing, type messages
// as if you were a host, see HILUX's replies. Optionally override the
// saved custom instructions to A/B-test wording before saving.
//
// Calls the hilux-sandbox edge function. Nothing is persisted; the
// chat resets when the listing changes or the page reloads.

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bot, Loader2, RefreshCw, Send, Sparkles, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SandboxListing {
  id: string;
  business_name: string | null;
  category: string | null;
  hilux_instructions: string | null;
}

interface SandboxMessage {
  role: "user" | "assistant";
  content: string;
  // When kind === "escalation", the message is rendered as a callout
  // instead of a bubble — HILUX chose to defer to the vendor.
  kind?: "reply" | "escalation";
}

export function HiluxSandbox() {
  const { user } = useAuth();
  const [listings, setListings] = useState<SandboxListing[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SandboxMessage[]>([]);
  const [input, setInput] = useState("");
  const [overrideText, setOverrideText] = useState<string>("");
  const [useOverride, setUseOverride] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return;
    (async () => {
      const { data, error } = await supabase
        .from("vendor_profiles")
        .select("id, business_name, category, hilux_instructions")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error("[HiluxSandbox] load listings", error);
        toast.error("Couldn't load your listings.");
        setListings([]);
        return;
      }
      const rows = (data ?? []) as SandboxListing[];
      setListings(rows);
      if (rows.length > 0) setSelectedId((cur) => cur ?? rows[0].id);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const selected = useMemo(
    () => listings?.find((l) => l.id === selectedId) ?? null,
    [listings, selectedId],
  );

  useEffect(() => {
    // Reset transcript when the selected listing changes — otherwise
    // assistant turns from a different listing leak into the new prompt.
    setMessages([]);
    setOverrideText(selected?.hilux_instructions ?? "");
    setUseOverride(false);
  }, [selected?.id, selected?.hilux_instructions]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending]);

  const send = async () => {
    if (!selected) return;
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    const next: SandboxMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(next);
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("hilux-sandbox", {
        body: {
          vendor_id: selected.id,
          instructions_override: useOverride ? overrideText : null,
          // Escalation turns are UI-only — they were never an actual
          // assistant reply to the host. Don't ship them back to
          // Claude or it'll think it's continuing from a "ESCALATE:"
          // string in conversation.
          messages: next
            .filter((m) => m.kind !== "escalation")
            .map((m) => ({ role: m.role, content: m.content })),
        },
      });
      if (error) throw error;
      const reply = (data as { reply?: string } | null)?.reply;
      if (!reply) throw new Error("Empty reply");
      const escalateMatch = reply.match(/^\s*ESCALATE\s*:\s*(.+)$/im);
      if (escalateMatch) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: escalateMatch[1].trim(),
            kind: "escalation",
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: reply, kind: "reply" },
        ]);
      }
    } catch (err: unknown) {
      console.error("[HiluxSandbox] send", err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`HILUX couldn't reply: ${msg}`);
      // Roll back the user turn so they can edit + retry without
      // ending up with an orphan "what?" message.
      setMessages((prev) => prev.slice(0, -1));
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setMessages([]);
    setInput("");
  };

  if (!user) return null;

  return (
    <div className="relative z-10 px-6 md:px-10 mt-4">
      <div className="max-w-3xl mx-auto rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 md:p-7 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.4)]">
        <div className="flex items-start gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "rgba(255, 138, 76, 0.15)" }}
          >
            <Sparkles className="w-5 h-5" style={{ color: "#ff8a4c" }} />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-[11px] uppercase tracking-[0.2em] mb-1"
              style={{ color: "rgba(255, 138, 76, 0.85)" }}
            >
              Sandbox · Preview only
            </p>
            <h3 className="font-editorial text-2xl text-black leading-tight">
              Chat with HILUX as if you were a host.
            </h3>
            <p className="text-sm text-black/60 mt-1">
              Nothing is sent or saved. Use this to pressure-test tone, rules,
              and date handling before going live.
            </p>
          </div>
        </div>

        {listings === null ? (
          <div className="flex items-center gap-2 text-sm text-black/50 py-6">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading…
          </div>
        ) : listings.length === 0 ? (
          <p className="text-sm text-black/60 py-6">
            Add a listing first; HILUX needs a bio + packages to talk about.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <Select
                value={selectedId ?? undefined}
                onValueChange={(v) => setSelectedId(v)}
              >
                <SelectTrigger className="w-full bg-white/70 text-black">
                  <SelectValue placeholder="Choose a listing to test" />
                </SelectTrigger>
                <SelectContent>
                  {listings.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {(l.business_name ?? "Untitled listing") +
                        (l.category ? ` · ${l.category}` : "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={reset}
                className="shrink-0 bg-white/70 text-black"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Reset
              </Button>
            </div>

            <div className="mb-3 rounded-xl bg-white/55 p-3 border border-black/5">
              <label className="flex items-center gap-2 text-xs text-black/70">
                <input
                  type="checkbox"
                  checked={useOverride}
                  onChange={(e) => setUseOverride(e.target.checked)}
                  className="rounded"
                />
                Try different custom instructions just for this preview (saved
                instructions stay untouched)
              </label>
              {useOverride ? (
                <Textarea
                  value={overrideText}
                  onChange={(e) => setOverrideText(e.target.value)}
                  placeholder="e.g. 'Be extremely casual. Always start replies with hey.'"
                  className="mt-2 min-h-[80px] bg-white text-sm text-black"
                  maxLength={4000}
                />
              ) : null}
            </div>

            <div
              ref={scrollRef}
              className="h-[360px] overflow-y-auto rounded-xl bg-white/40 p-3 space-y-2"
            >
              {messages.length === 0 ? (
                <p className="text-sm text-black/45 text-center py-12">
                  Send a message like a host would —
                  <br />
                  <span className="italic">
                    "Are you free on June 7? It's a 50-person wedding."
                  </span>
                </p>
              ) : (
                messages.map((m, i) => {
                  if (m.role === "assistant" && m.kind === "escalation") {
                    return (
                      <div
                        key={i}
                        className="flex items-start gap-2 px-2 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900"
                      >
                        <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
                        <div className="text-sm leading-snug">
                          <p className="font-medium">
                            HILUX would escalate this to you instead of replying.
                          </p>
                          <p className="text-xs text-amber-800 mt-0.5">
                            Reason: {m.content}
                          </p>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-2 ${
                        m.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {m.role === "assistant" ? (
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                          style={{ background: "rgba(255, 138, 76, 0.2)" }}
                        >
                          <Bot className="w-3.5 h-3.5" style={{ color: "#ff8a4c" }} />
                        </div>
                      ) : null}
                      <div
                        className={`max-w-[78%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                          m.role === "user"
                            ? "bg-black text-white rounded-br-sm"
                            : "bg-white text-black rounded-bl-sm border border-black/5"
                        }`}
                      >
                        {m.content}
                      </div>
                      {m.role === "user" ? (
                        <div className="w-6 h-6 rounded-full bg-black/10 flex items-center justify-center shrink-0 mt-0.5">
                          <User className="w-3.5 h-3.5 text-black/60" />
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
              {sending ? (
                <div className="flex items-center gap-2 text-xs text-black/50 pl-8">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  HILUX is thinking…
                </div>
              ) : null}
            </div>

            <div className="mt-3 flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Type a message as if you were a host (Enter to send)"
                className="min-h-[56px] resize-none bg-white text-black"
                disabled={sending}
              />
              <Button
                onClick={send}
                disabled={sending || !input.trim() || !selected}
                className="h-[56px] shrink-0 bg-black text-white hover:bg-black/85 rounded-xl"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
