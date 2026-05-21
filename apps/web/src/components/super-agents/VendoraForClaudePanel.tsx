// Vendora for Claude — the MCP connector panel. Shows the
// connector URL, lets the vendor mint a Personal Access Token,
// shows install instructions for Claude.ai and Claude Code, and
// surfaces the live tool catalog so the vendor knows what Claude
// can do once connected.

import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Flame,
  Inbox,
  Key,
  Layers,
  Loader2,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  ScrollText,
  Send,
  Settings2,
  Sparkles,
  Sunrise,
  Tag,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { VendoraForClaudeLogo } from "./AgentLogos";
import { McpCallLog } from "./McpCallLog";

// Hardcoded for now. The MCP server lives at this URL once the
// vendora-mcp edge function is deployed.
const MCP_URL = "https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/vendora-mcp";

interface TokenRow {
  id: string;
  token_prefix: string;
  name: string | null;
  scope: "read_only" | "read_write" | null;
  vendor_id: string | null;
  last_used_at: string | null;
  created_at: string;
}

interface VendorListing {
  id: string;
  business_name: string | null;
}

interface ToolInfo {
  name: string;
  label: string;
  blurb: string;
  Icon: typeof Inbox;
}

interface ToolGroup {
  title: string;
  tools: ToolInfo[];
}

interface PromptInfo {
  name: string;
  label: string;
  blurb: string;
  Icon: typeof Inbox;
}

const TOOL_GROUPS: ToolGroup[] = [
  {
    title: "Read",
    tools: [
      {
        name: "list_inquiries",
        label: "List inquiries",
        blurb:
          "\"What hot leads do I have this week?\" — filterable by status or lead score.",
        Icon: Inbox,
      },
      {
        name: "get_inquiry",
        label: "Read an inquiry + transcript",
        blurb:
          "\"Show me the conversation with Sarah and summarize it.\" — pulls inquiry + last 30 messages.",
        Icon: Layers,
      },
      {
        name: "get_hilux_settings",
        label: "Inspect HILUX settings",
        blurb:
          "\"What's HILUX set to?\" — returns every toggle, greeting, and reply length.",
        Icon: Settings2,
      },
      {
        name: "list_listings",
        label: "List your listings",
        blurb:
          "\"What listings do I have live?\" — returns your vendor profiles + approval status.",
        Icon: Sparkles,
      },
      {
        name: "get_action_log",
        label: "Read HILUX's activity log",
        blurb:
          "\"What has HILUX been doing today?\" — returns every reply, escalation, follow-up, and archive HILUX performed.",
        Icon: ScrollText,
      },
      {
        name: "get_mcp_call_log",
        label: "Read Claude's own MCP call log",
        blurb:
          "\"Recap what you've done for me today\" — Claude reflects on every tool call it made through this connector.",
        Icon: ScrollText,
      },
    ],
  },
  {
    title: "Write",
    tools: [
      {
        name: "send_reply",
        label: "Reply to a thread",
        blurb:
          "\"Reply to Sarah saying we're booked that weekend.\" — sends as you, not as HILUX.",
        Icon: Send,
      },
      {
        name: "pause_hilux_thread",
        label: "Pause HILUX on a thread",
        blurb:
          "\"Pause HILUX in this conversation, I'll handle it.\" — HILUX stays out of that single thread.",
        Icon: PauseCircle,
      },
      {
        name: "resume_hilux_thread",
        label: "Resume HILUX on a thread",
        blurb:
          "\"Hand this back to HILUX.\" — HILUX picks the conversation back up on the next host message.",
        Icon: PlayCircle,
      },
      {
        name: "update_hilux_settings",
        label: "Update HILUX settings",
        blurb:
          "\"Turn on quiet hours and set my greeting to 'hey y'all'.\" — flips toggles, edits greeting / length.",
        Icon: Pencil,
      },
      {
        name: "mark_inquiry",
        label: "Mark an inquiry",
        blurb:
          "\"Mark Sarah's inquiry as won — they booked us.\" — sets status (won / lost / replied / etc).",
        Icon: Tag,
      },
      {
        name: "compose_draft_reply",
        label: "Compose a HILUX-style draft",
        blurb:
          "\"Draft a reply to Sarah, lean enthusiastic.\" — generates a reply in your HILUX voice without sending. Review then call send_reply if you like it.",
        Icon: Pencil,
      },
      {
        name: "regenerate_last_hilux_reply",
        label: "Regenerate HILUX's last reply",
        blurb:
          "\"That last HILUX message was off — try again.\" — rewrites in place. Only while it's still the latest message.",
        Icon: RefreshCw,
      },
    ],
  },
];

const PROMPT_CATALOG: PromptInfo[] = [
  {
    name: "morning_recap",
    label: "Morning recap",
    blurb:
      "Overnight HILUX activity, hot leads, escalations, and what to address first.",
    Icon: Sunrise,
  },
  {
    name: "draft_for_thread",
    label: "Draft a reply for a thread",
    blurb:
      "Generate a HILUX-voice draft for a specific thread, then review before sending.",
    Icon: Pencil,
  },
  {
    name: "score_hot_leads",
    label: "Review hot leads",
    blurb:
      "List every hot-scored inquiry with one-line summaries + next-action proposal.",
    Icon: Flame,
  },
  {
    name: "audit_settings",
    label: "Audit HILUX settings",
    blurb:
      "Walk current toggles, flag anything contradictory, suggest 3 changes.",
    Icon: Settings2,
  },
  {
    name: "weekly_review",
    label: "Weekly review",
    blurb:
      "7-day activity rollup + tuning recommendations for next week's toggles.",
    Icon: CalendarDays,
  },
];

export function VendoraForClaudePanel() {
  const { user } = useAuth();
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTokenName, setNewTokenName] = useState("");
  const [newTokenScope, setNewTokenScope] = useState<"read_only" | "read_write">("read_write");
  // null = "all my listings". A specific id binds the token to that
  // single vendor — useful when a vendor wants Claude to operate on
  // only one of their listings.
  const [newTokenVendorId, setNewTokenVendorId] = useState<string | null>(null);
  const [listings, setListings] = useState<VendorListing[]>([]);
  const [justMinted, setJustMinted] = useState<{ id: string; token: string } | null>(
    null,
  );
  const [showSecret, setShowSecret] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    // vendor_access_tokens isn't in the regenerated supabase types
    // yet (the type-gen MCP is offline this session). The table
    // exists; the cast is just to let supabase-js pass it through.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("vendor_access_tokens")
      .select("id, token_prefix, name, scope, vendor_id, last_used_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[VendoraForClaude] load tokens", error);
      setTokens([]);
      return;
    }
    setTokens((data ?? []) as TokenRow[]);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Load the vendor's own listings so the mint UI can offer a
  // per-listing scope picker. Empty until the user is loaded.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("vendor_profiles")
        .select("id, business_name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      setListings(((data as VendorListing[] | null) ?? []));
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1500);
    } catch (err) {
      console.error("[VendoraForClaude] copy", err);
      toast.error("Couldn't copy.");
    }
  };

  const mintToken = async () => {
    if (!user?.id) return;
    setCreating(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc(
      "create_vendor_access_token",
      {
        p_name: newTokenName.trim() || null,
        p_scope: newTokenScope,
        p_vendor_id: newTokenVendorId,
      },
    );
    setCreating(false);
    if (error) {
      console.error("[VendoraForClaude] mint", error);
      toast.error("Couldn't generate token.");
      return;
    }
    // RPC returns `setof (id uuid, token text)` — supabase-js may
    // surface this as either an array of rows or a single row.
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.token) {
      toast.error("Token generated but plaintext missing — try again.");
      return;
    }
    setJustMinted({ id: row.id, token: row.token });
    setNewTokenName("");
    setShowSecret(false);
    load();
    toast.success("Token created. Copy it now — you won't see it again.");
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this token? Any Claude client using it will lose access.")) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_access_tokens")
      .delete()
      .eq("id", id);
    if (error) {
      console.error("[VendoraForClaude] revoke", error);
      toast.error("Couldn't revoke.");
      return;
    }
    setTokens((prev) => prev?.filter((t) => t.id !== id) ?? prev);
    if (justMinted?.id === id) setJustMinted(null);
    toast.success("Token revoked.");
  };

  if (!user) return null;

  return (
    <div className="relative z-10 px-6 md:px-10 pt-24 md:pt-28 pb-12">
      <div className="max-w-3xl mx-auto rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_8px_40px_-12px_rgba(0,0,0,0.4)] p-6 md:p-8 space-y-7">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl overflow-hidden shrink-0 ring-1 ring-black/5">
            <VendoraForClaudeLogo className="w-full h-full block" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.2em] text-black/55 mb-1">
              Vendora for Claude · MCP connector
            </p>
            <h3 className="font-editorial text-2xl md:text-3xl text-black leading-tight">
              Bring your whole vendor account into Claude.
            </h3>
            <p className="text-sm text-black/65 mt-2 leading-relaxed">
              Connect Vendora to Claude.ai or Claude Code via the Model
              Context Protocol. Ask Claude things like "what hot leads do I
              have?" or "summarize the conversation with Sarah" and it'll
              call right into your inbox, no copy-paste.
            </p>
          </div>
        </div>

        {/* Connector URL */}
        <div className="rounded-xl bg-white/55 border border-black/5 p-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-black/55 mb-2">
            Connector URL
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate text-xs text-black bg-white/80 rounded-md px-2.5 py-2 font-mono">
              {MCP_URL}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copy("url", MCP_URL)}
              className="shrink-0 bg-white/70"
            >
              {copiedKey === "url" ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>
        </div>

        {/* Token management */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Key className="w-3.5 h-3.5 text-black/55" />
            <p className="text-[11px] uppercase tracking-[0.2em] text-black/55">
              Personal access tokens
            </p>
          </div>

          {justMinted ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 mb-3">
              <p className="text-xs font-medium text-amber-900 mb-2">
                Copy this token now — you won't see it again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate text-xs text-black bg-white rounded-md px-2.5 py-2 font-mono">
                  {showSecret
                    ? justMinted.token
                    : "•".repeat(Math.min(justMinted.token.length, 40))}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowSecret((v) => !v)}
                  className="shrink-0 bg-white"
                >
                  {showSecret ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </Button>
                <Button
                  size="sm"
                  onClick={() => copy("token", justMinted.token)}
                  className="shrink-0 bg-amber-700 hover:bg-amber-800 text-white"
                >
                  {copiedKey === "token" ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </Button>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setJustMinted(null);
                  setShowSecret(false);
                }}
                className="mt-2 text-amber-900/70 hover:text-amber-900"
              >
                I've saved it — dismiss
              </Button>
            </div>
          ) : null}

          {tokens === null ? (
            <div className="flex items-center gap-2 text-sm text-black/50 py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading tokens…
            </div>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-black/55 italic mb-3">
              No tokens yet. Generate one and paste it into your Claude client
              when it asks for an API key.
            </p>
          ) : (
            <ul className="space-y-1.5 mb-3">
              {tokens.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-3 rounded-lg bg-white/55 border border-black/5 px-3 py-2.5"
                >
                  <code className="text-xs text-black/70 font-mono shrink-0">
                    {t.token_prefix}…
                  </code>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm text-black/85 truncate">
                        {t.name ?? "Unnamed token"}
                      </p>
                      <span
                        className="inline-flex items-center text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded-full"
                        style={
                          (t.scope ?? "read_write") === "read_only"
                            ? { background: "rgba(0,0,0,0.06)", color: "rgba(0,0,0,0.6)" }
                            : { background: "rgba(16,185,129,0.12)", color: "#047857" }
                        }
                      >
                        {(t.scope ?? "read_write") === "read_only" ? "Read only" : "Read + Write"}
                      </span>
                      {t.vendor_id ? (
                        <span
                          className="inline-flex items-center text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded-full bg-black/8 text-black/65 max-w-[140px] truncate"
                          title={
                            listings.find((l) => l.id === t.vendor_id)?.business_name ?? t.vendor_id
                          }
                        >
                          {(listings.find((l) => l.id === t.vendor_id)?.business_name ??
                            "1 listing").slice(0, 22)}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[10px] text-black/45">
                      Created {new Date(t.created_at).toLocaleDateString()}
                      {t.last_used_at
                        ? ` · last used ${new Date(t.last_used_at).toLocaleDateString()}`
                        : " · never used"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => revoke(t.id)}
                    aria-label="Revoke token"
                    className="text-black/40 hover:text-rose-600 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-2">
            <Input
              value={newTokenName}
              onChange={(e) => setNewTokenName(e.target.value.slice(0, 80))}
              placeholder="Name (e.g. 'Claude on my laptop')"
              className="bg-white/70 text-black text-sm"
              maxLength={80}
            />
            <div className="grid grid-cols-2 gap-1 rounded-md bg-white/70 p-0.5 shrink-0">
              {(["read_write", "read_only"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setNewTokenScope(s)}
                  className={`text-[11px] font-medium px-2 py-1 rounded transition-colors ${
                    newTokenScope === s
                      ? "bg-black text-white"
                      : "text-black/65 hover:bg-white"
                  }`}
                >
                  {s === "read_write" ? "Read + Write" : "Read only"}
                </button>
              ))}
            </div>
            <Button
              onClick={mintToken}
              disabled={creating}
              size="sm"
              className="bg-black text-white hover:bg-black/85 shrink-0"
            >
              {creating ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5 mr-1.5" />
              )}
              Generate token
            </Button>
          </div>
          {listings.length > 1 ? (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] uppercase tracking-wider text-black/55 font-medium">
                Scope to listing
              </span>
              <button
                type="button"
                onClick={() => setNewTokenVendorId(null)}
                className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                  newTokenVendorId === null
                    ? "border-black bg-black text-white"
                    : "border-black/15 bg-white/60 text-black/65 hover:bg-white"
                }`}
              >
                All my listings
              </button>
              {listings.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setNewTokenVendorId(l.id)}
                  className={`text-[11px] px-2 py-1 rounded-full border transition-colors max-w-[160px] truncate ${
                    newTokenVendorId === l.id
                      ? "border-black bg-black text-white"
                      : "border-black/15 bg-white/60 text-black/65 hover:bg-white"
                  }`}
                  title={l.business_name ?? ""}
                >
                  {l.business_name || "Unnamed listing"}
                </button>
              ))}
            </div>
          ) : null}
          <p className="text-[11px] text-black/45 mt-1.5">
            Read-only tokens let Claude inspect your inbox + settings but can't send replies, mark inquiries, or change HILUX config.
            {listings.length > 1
              ? " Listing-scoped tokens only see one of your vendor profiles — useful when you want Claude to focus on a single listing."
              : ""}
          </p>
        </div>

        {/* Install instructions */}
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-black/55 mb-2">
            Install in your Claude client
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/55 border border-black/5 p-4">
              <p className="text-sm font-medium text-black mb-1">
                Claude.ai{" "}
                <span className="inline-flex items-center text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 align-middle">
                  OAuth
                </span>
              </p>
              <p className="text-xs text-black/60 leading-relaxed">
                Settings → Connectors → Add custom connector. Paste the URL
                above and click Add — Claude will open a Vendora approval
                screen, you click Approve, and the connection is live. No
                token to copy.
              </p>
            </div>
            <div className="rounded-xl bg-white/55 border border-black/5 p-4">
              <p className="text-sm font-medium text-black mb-1">Claude Code</p>
              <p className="text-xs text-black/60 leading-relaxed">
                <code className="bg-white/80 rounded px-1 py-0.5">
                  claude mcp add vendora --transport http
                </code>{" "}
                — paste the URL when prompted. If your client supports OAuth
                it'll open the browser; otherwise generate a token below and
                pass it via{" "}
                <code className="bg-white/80 rounded px-1 py-0.5">
                  --header "Authorization: Bearer …"
                </code>
                .
              </p>
            </div>
          </div>
        </div>

        {/* Live activity log — what Claude has done via this MCP. */}
        <McpCallLog />

        {/* Prompts — slash-menu shortcuts in Claude.ai. */}
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-black/55 mb-2">
            Quick prompts (Claude.ai slash menu)
          </p>
          <ul className="divide-y divide-black/10 rounded-xl bg-white/45 border border-black/5">
            {PROMPT_CATALOG.map((p) => (
              <li key={p.name} className="flex items-start gap-3 px-4 py-3">
                <p.Icon className="w-4 h-4 text-black/55 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-black leading-tight">
                    {p.label}
                  </p>
                  <p className="text-[11px] text-black/55 mt-0.5 leading-snug">
                    {p.blurb}
                  </p>
                </div>
                <code className="text-[10px] text-black/45 font-mono mt-0.5 shrink-0">
                  /{p.name}
                </code>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-black/45 italic mt-2">
            In Claude.ai, type <code className="bg-white/80 rounded px-1 py-0.5">/</code> to see these as autocomplete options once the connector is live.
          </p>
        </div>

        {/* Tool catalog */}
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-black/55 mb-2">
            What Claude can do via this connector
          </p>
          <div className="space-y-3">
            {TOOL_GROUPS.map((group) => (
              <div key={group.title}>
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  <span className="text-[11px] uppercase tracking-wider font-medium text-black/65">
                    {group.title}
                  </span>
                  <span className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-md bg-black/10 text-[10px] font-medium text-black/65 tabular-nums">
                    {group.tools.length}
                  </span>
                </div>
                <ul className="divide-y divide-black/10 rounded-xl bg-white/45 border border-black/5">
                  {group.tools.map((t) => {
                    const { Icon } = t;
                    return (
                      <li key={t.name} className="flex items-start gap-3 px-4 py-3">
                        <Icon className="w-4 h-4 text-black/55 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-black leading-tight">
                            {t.label}
                          </p>
                          <p className="text-[11px] text-black/55 mt-0.5 leading-snug">
                            {t.blurb}
                          </p>
                        </div>
                        <code className="text-[10px] text-black/45 font-mono mt-0.5 shrink-0">
                          {t.name}
                        </code>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-black/45 italic mt-2 inline-flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            13 tools live + 3 static resources (vendora://settings, vendora://activity, vendora://listings) and 2 templates (vendora://inquiry/&lcub;id&rcub;, vendora://thread/&lcub;id&rcub;). Claude can read your inbox + take action on your behalf with your approval (Claude clients prompt before any write).
          </p>
        </div>
      </div>
    </div>
  );
}
