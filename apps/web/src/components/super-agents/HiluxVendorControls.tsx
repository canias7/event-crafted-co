// HILUX controls — single profile-scoped agent card. Click the card
// header to expand the action list, custom instructions, and voice
// training sub-panel. All config saves go to `profiles` (HILUX is
// one agent per user, not per listing).

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  Bot,
  Calendar,
  ChevronDown,
  ChevronRight,
  Flame,
  Frown,
  Gauge,
  Sunrise,
  Loader2,
  Phone,
  RotateCcw,
  Search as SearchIcon,
  ShieldOff,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { HiluxLogo } from "./AgentLogos";

type ActionKey =
  | "hilux_action_use_calendar"
  | "hilux_action_detect_frustration"
  | "hilux_action_decline_negotiation"
  | "hilux_action_offer_call"
  | "hilux_action_notify_on_reply"
  | "hilux_action_notify_on_hot_lead"
  | "hilux_action_daily_summary"
  | "hilux_action_cap_replies_per_inquiry";

type HiluxProfileRow = {
  hilux_enabled: boolean;
} & Record<ActionKey, boolean>;

interface ActionDef {
  key: ActionKey;
  label: string;
  blurb: string;
  Icon: typeof Bot;
}

interface ActionGroup {
  title: string;
  actions: ActionDef[];
}

const ACTION_GROUPS: ActionGroup[] = [
  {
    title: "Conversation",
    actions: [
      { key: "hilux_action_use_calendar", label: "Use my calendar for date answers", blurb: "Read live availability so HILUX can answer \"are you free on Sept 12?\" directly.", Icon: Calendar },
      { key: "hilux_action_decline_negotiation", label: "Decline price negotiation", blurb: "If the host asks for a discount, politely decline. No haggling.", Icon: ShieldOff },
      { key: "hilux_action_offer_call", label: "Offer to schedule a call", blurb: "Once the lead warms up, offer a quick call to walk through details.", Icon: Phone },
    ],
  },
  {
    title: "Escalation",
    actions: [
      { key: "hilux_action_detect_frustration", label: "Escalate frustrated hosts", blurb: "If the host sounds upset, hand off to you instead of trying to smooth it over.", Icon: Frown },
    ],
  },
  {
    title: "Operations",
    actions: [
      { key: "hilux_action_notify_on_hot_lead", label: "Notify me when a lead turns hot", blurb: "Push notification the first time HILUX flags a conversation as a hot lead.", Icon: Flame },
      { key: "hilux_action_notify_on_reply", label: "Notify me on every HILUX reply", blurb: "Push notification whenever HILUX sends a message on your behalf. Can get noisy.", Icon: Bell },
      { key: "hilux_action_daily_summary", label: "Send me a 9am daily summary", blurb: "Get a single push + email at 9am each morning with yesterday's HILUX activity (replies, escalations, hot leads).", Icon: Sunrise },
      { key: "hilux_action_cap_replies_per_inquiry", label: "Cap HILUX at 6 replies per inquiry", blurb: "After 6 HILUX replies in a single conversation, HILUX backs off and defers to you for the rest.", Icon: Gauge },
    ],
  },
];

const ALL_ACTIONS: ActionDef[] = ACTION_GROUPS.flatMap((g) => g.actions);


export function HiluxVendorControls() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<HiluxProfileRow | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [resetting, setResetting] = useState(false);
  // Live HILUX system prompt for the vendor's primary listing.
  // Lazy-fetched the first time the panel expands so the page load
  // stays light when vendors don't open the panel.
  const [hiluxPrompt, setHiluxPrompt] = useState<string | null>(null);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "hilux_enabled, hilux_action_use_calendar, hilux_action_detect_frustration, hilux_action_decline_negotiation, hilux_action_offer_call, hilux_action_notify_on_reply, hilux_action_notify_on_hot_lead, hilux_action_daily_summary, hilux_action_cap_replies_per_inquiry",
      )
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      console.error("[HiluxVendorControls] load failed", error);
      toast.error("Couldn't load HILUX settings.");
      return;
    }
    const row = (data as HiluxProfileRow | null) ?? ({
      hilux_enabled: false,
      hilux_action_use_calendar: true,
      hilux_action_detect_frustration: true,
      hilux_action_decline_negotiation: true,
      hilux_action_offer_call: true,
      hilux_action_notify_on_reply: false,
      hilux_action_notify_on_hot_lead: true,
      hilux_action_daily_summary: false,
      hilux_action_cap_replies_per_inquiry: false,
    } satisfies HiluxProfileRow);
    setProfile(row);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Fetch the live system prompt on first expand. Re-fetches when
  // toggles change since several rules in the prompt are gated by
  // actions.detectFrustration / declineNegotiation / etc.
  useEffect(() => {
    if (!expanded || !user?.id) return;
    let cancelled = false;
    setPromptLoading(true);
    setPromptError(null);
    (async () => {
      const { data, error } = await supabase.functions.invoke("hilux-preview-prompt", {
        body: {},
      });
      if (cancelled) return;
      if (error) {
        setPromptError(error.message ?? "Couldn't load prompt.");
        setHiluxPrompt(null);
      } else {
        const text = (data as { prompt?: string } | null)?.prompt ?? null;
        setHiluxPrompt(text);
      }
      setPromptLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // Re-run when toggles or listing change so the preview stays
    // in sync with the live prompt HILUX would actually send.
  }, [expanded, user?.id, profile?.hilux_action_use_calendar, profile?.hilux_action_detect_frustration, profile?.hilux_action_decline_negotiation, profile?.hilux_action_offer_call]);

  const persist = async (patch: Partial<HiluxProfileRow>, key: string) => {
    if (!user?.id) return;
    setSavingKey(key);
    const { error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", user.id);
    setSavingKey(null);
    if (error) {
      console.error("[HiluxVendorControls] save failed", error);
      toast.error("Couldn't save.");
      return false;
    }
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
    return true;
  };

  const toggleEnabled = async (next: boolean) => {
    const ok = await persist({ hilux_enabled: next }, "enabled");
    if (ok) {
      toast.success(next ? "HILUX is on. It'll answer host messages." : "HILUX paused.");
      if (next && !expanded) setExpanded(true);
    }
  };

  const toggleAction = async (key: ActionKey, next: boolean) => {
    await persist({ [key]: next } as Partial<HiluxProfileRow>, key);
  };

  // Reset all action toggles to defaults.
  const resetToDefaults = async () => {
    if (!user?.id) return;
    if (!confirm("Reset all action toggles to defaults?")) return;
    setResetting(true);
    const patch: Partial<HiluxProfileRow> = {
      hilux_action_use_calendar: true,
      hilux_action_detect_frustration: true,
      hilux_action_decline_negotiation: true,
      hilux_action_offer_call: true,
      hilux_action_notify_on_reply: false,
      hilux_action_notify_on_hot_lead: true,
      hilux_action_daily_summary: false,
      hilux_action_cap_replies_per_inquiry: false,
    };
    const { error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", user.id);
    setResetting(false);
    if (error) {
      console.error("[HiluxVendorControls] reset failed", error);
      toast.error("Couldn't reset.");
      return;
    }
    setProfile((prev) => (prev ? { ...prev, ...patch } as HiluxProfileRow : prev));
    toast.success("Reset to defaults.");
  };

  if (!user) return null;

  const enabled = profile?.hilux_enabled === true;

  return (
    <div className="relative z-10 px-6 md:px-10 pt-24 md:pt-28">
      <div className="max-w-6xl mx-auto rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_8px_40px_-12px_rgba(0,0,0,0.4)] overflow-hidden">
        {/* Header — click to expand. Master toggle on the right. */}
        <div className="flex items-center gap-4 p-5 md:p-6">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-4 min-w-0 flex-1 text-left hover:opacity-90 transition-opacity"
            aria-expanded={expanded}
          >
            <div className="w-12 h-12 rounded-2xl overflow-hidden shrink-0 ring-1 ring-black/5">
              <HiluxLogo className="w-full h-full block" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-editorial text-2xl md:text-3xl text-black leading-tight truncate">
                HILUX 2.7
              </h3>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-black/50 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>
          <div className="flex items-center gap-2 shrink-0">
            {savingKey === "enabled" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-black/40" />
            ) : null}
            {/* OFF / ON labels flank the switch so it's unambiguous
                which side is which. Active side is emphasized. */}
            <span
              className={`text-[10px] font-semibold uppercase tracking-wider ${
                enabled ? "text-black/30" : "text-black/70"
              }`}
            >
              Off
            </span>
            <Switch
              checked={enabled}
              disabled={savingKey === "enabled" || !profile}
              onCheckedChange={toggleEnabled}
              onClick={(e) => e.stopPropagation()}
            />
            <span
              className={`text-[10px] font-semibold uppercase tracking-wider ${
                enabled ? "text-[#c4541e]" : "text-black/30"
              }`}
            >
              On
            </span>
          </div>
        </div>

        {expanded ? (
          <div className="border-t border-black/10 p-5 md:p-6 bg-white/30 grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
            {/* LEFT COLUMN — tool permissions toggle stack. */}
            <div className="space-y-6">
            {/* Tool permissions — connector-style. Header + subtitle
                like Sentry/Stripe connector panels, then sub-groups
                with a count chip and a search field above. */}
            <div>
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <div>
                  <p className="text-sm font-medium text-black mb-0.5">
                    Tool permissions
                  </p>
                  <p className="text-xs text-black/55">
                    Choose when HILUX is allowed to use these.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetToDefaults}
                  disabled={resetting}
                  className="shrink-0 inline-flex items-center gap-1 text-[11px] text-black/55 hover:text-black/85 transition-colors"
                  title="Reset all toggles to defaults"
                >
                  {resetting ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3 h-3" />
                  )}
                  Reset
                </button>
              </div>
              <div className="relative mb-3">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-black/40" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find an action…"
                  className="pl-8 h-8 bg-white/70 text-sm text-black"
                />
              </div>
              <div className="space-y-1">
                {ACTION_GROUPS.map((group) => {
                  const q = query.trim().toLowerCase();
                  const visible = q
                    ? group.actions.filter(
                        (a) =>
                          a.label.toLowerCase().includes(q) ||
                          a.blurb.toLowerCase().includes(q),
                      )
                    : group.actions;
                  if (visible.length === 0) return null;
                  return (
                    <Collapsible
                      key={group.title}
                      defaultOpen={
                        group.title === "Conversation" ||
                        group.title === "Operations" ||
                        q.length > 0
                      }
                    >
                      <CollapsibleTrigger className="group flex items-center justify-between w-full py-2.5 rounded-md hover:bg-white/40 transition-colors">
                        <div className="flex items-center gap-2">
                          <ChevronRight className="w-3.5 h-3.5 text-black/55 transition-transform group-data-[state=open]:rotate-90" />
                          <span className="text-sm font-medium text-black">
                            {group.title}
                          </span>
                          <span className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-md bg-black/10 text-[10px] font-medium text-black/65 tabular-nums">
                            {visible.length}
                            {q && visible.length !== group.actions.length
                              ? `/${group.actions.length}`
                              : ""}
                          </span>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <ul className="divide-y divide-black/10 pl-5">
                          {visible.map((action) => {
                            const { Icon } = action;
                            const value = profile?.[action.key] !== false;
                            const isSaving = savingKey === action.key;
                            return (
                              <li
                                key={action.key}
                                className="flex items-center gap-3 py-3"
                              >
                                <Icon className="w-4 h-4 text-black/55 shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-black leading-tight">
                                    {action.label}
                                  </p>
                                  <p className="text-[11px] text-black/55 mt-0.5 leading-snug">
                                    {action.blurb}
                                  </p>
                                </div>
                                {isSaving ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-black/40 shrink-0" />
                                ) : null}
                                <Switch
                                  checked={value}
                                  disabled={!enabled || isSaving}
                                  onCheckedChange={(v) =>
                                    toggleAction(action.key, v)
                                  }
                                />
                              </li>
                            );
                          })}
                        </ul>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
              {!enabled ? (
                <p className="mt-2 text-[11px] text-black/45 italic">
                  Flip HILUX on above to use these.
                </p>
              ) : null}
            </div>
            </div>
            {/* RIGHT COLUMN — live system prompt preview. Shows the
                exact text HILUX is told before every reply, built
                from the vendor's listing context + toggle state.
                Re-fetches when toggles change. */}
            <div className="lg:border-l lg:border-black/10 lg:pl-6 flex flex-col min-h-0">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <div>
                  <p className="text-sm font-medium text-black mb-0.5">
                    What HILUX is told
                  </p>
                  <p className="text-xs text-black/55">
                    The exact system prompt used to reply on your behalf — updates with your toggles.
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-black/10 bg-white/70 overflow-hidden flex-1 min-h-[280px] max-h-[640px] flex flex-col">
                {promptLoading && !hiluxPrompt ? (
                  <div className="flex-1 flex items-center justify-center gap-2 text-[11px] text-black/45">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading prompt…
                  </div>
                ) : promptError ? (
                  <div className="flex-1 flex items-center justify-center text-[11px] text-red-600 p-4 text-center">
                    {promptError}
                  </div>
                ) : !hiluxPrompt ? (
                  <div className="flex-1 flex items-center justify-center text-[11px] text-black/40 p-4 text-center">
                    No listing yet — the prompt will appear once you publish one.
                  </div>
                ) : (
                  <pre className="flex-1 overflow-auto p-3 text-[11px] leading-relaxed text-black/80 font-mono whitespace-pre-wrap">{hiluxPrompt}</pre>
                )}
              </div>
              <p className="mt-2 text-[10px] text-black/40">
                {hiluxPrompt ? `${hiluxPrompt.length.toLocaleString()} chars · sent as a cached system prompt on every reply` : " "}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
