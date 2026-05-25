// My Space tool toggles — the right-hand control panel on
// /vendor/ai-superagents. Each toggle gates a specific behavior the
// AI is allowed to do when answering host inquiries on the vendor's
// behalf (formerly branded HILUX; the toggles still write to the same
// hilux_action_* columns on profiles).
//
// The chatbox on the left is a separate surface — these toggles only
// affect the auto-reply behavior in the inbox, not what the chatbox
// itself can do.

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  Bot,
  Calendar,
  ChevronRight,
  Flame,
  Frown,
  Gauge,
  Loader2,
  Phone,
  RotateCcw,
  Search as SearchIcon,
  ShieldOff,
  Sunrise,
  UserCircle2,
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

type ActionKey =
  | "hilux_action_use_calendar"
  | "hilux_action_use_first_name"
  | "hilux_action_detect_frustration"
  | "hilux_action_decline_negotiation"
  | "hilux_action_offer_call"
  | "hilux_action_notify_on_reply"
  | "hilux_action_notify_on_hot_lead"
  | "hilux_action_daily_summary"
  | "hilux_action_cap_replies_per_inquiry";

type ProfileRow = {
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
      {
        key: "hilux_action_use_calendar",
        label: "Use my calendar for date answers",
        blurb:
          'Read live availability so My Space can answer "are you free on Sept 12?" directly.',
        Icon: Calendar,
      },
      {
        key: "hilux_action_use_first_name",
        label: "Address host by first name",
        blurb:
          "Open the reply with the host's first name when it's on their profile (e.g. \"Hi Jessica —\").",
        Icon: UserCircle2,
      },
      {
        key: "hilux_action_decline_negotiation",
        label: "Decline price negotiation",
        blurb: "If the host asks for a discount, politely decline. No haggling.",
        Icon: ShieldOff,
      },
      {
        key: "hilux_action_offer_call",
        label: "Offer to schedule a call",
        blurb:
          "Once the lead warms up, offer a quick call to walk through details.",
        Icon: Phone,
      },
    ],
  },
  {
    title: "Escalation",
    actions: [
      {
        key: "hilux_action_detect_frustration",
        label: "Escalate frustrated hosts",
        blurb:
          "If the host sounds upset, hand off to you instead of trying to smooth it over.",
        Icon: Frown,
      },
    ],
  },
  {
    title: "Operations",
    actions: [
      {
        key: "hilux_action_notify_on_hot_lead",
        label: "Notify me when a lead turns hot",
        blurb:
          "Push notification the first time My Space flags a conversation as a hot lead.",
        Icon: Flame,
      },
      {
        key: "hilux_action_notify_on_reply",
        label: "Notify me on every reply",
        blurb:
          "Push notification whenever My Space sends a message on your behalf. Can get noisy.",
        Icon: Bell,
      },
      {
        key: "hilux_action_daily_summary",
        label: "Send me a 9am daily summary",
        blurb:
          "Get a single push + email at 9am each morning with yesterday's activity (replies, escalations, hot leads).",
        Icon: Sunrise,
      },
      {
        key: "hilux_action_cap_replies_per_inquiry",
        label: "Cap My Space at 6 replies per inquiry",
        blurb:
          "After 6 replies in a single conversation, My Space backs off and defers to you for the rest.",
        Icon: Gauge,
      },
    ],
  },
];

const DEFAULTS: Record<ActionKey, boolean> = {
  hilux_action_use_calendar: true,
  hilux_action_use_first_name: true,
  hilux_action_detect_frustration: true,
  hilux_action_decline_negotiation: true,
  hilux_action_offer_call: true,
  hilux_action_notify_on_reply: false,
  hilux_action_notify_on_hot_lead: true,
  hilux_action_daily_summary: false,
  hilux_action_cap_replies_per_inquiry: false,
};

export function MySpaceToolToggles() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [resetting, setResetting] = useState(false);
  // System-prompt preview lives in its own collapsible section under
  // the toggles. Lazy-fetched the first time the vendor opens it so
  // the panel mount isn't slowed down by a Claude-prompt build for
  // vendors who never look at it.
  const [showPrompt, setShowPrompt] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "hilux_enabled, hilux_action_use_calendar, hilux_action_use_first_name, hilux_action_detect_frustration, hilux_action_decline_negotiation, hilux_action_offer_call, hilux_action_notify_on_reply, hilux_action_notify_on_hot_lead, hilux_action_daily_summary, hilux_action_cap_replies_per_inquiry",
      )
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      console.error("[MySpaceToolToggles] load failed", error);
      toast.error("Couldn't load settings.");
      return;
    }
    const row =
      (data as ProfileRow | null) ??
      ({ hilux_enabled: false, ...DEFAULTS } satisfies ProfileRow);
    setProfile(row);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Fetch the live system prompt the first time the vendor opens the
  // preview, and re-fetch when toggles change since they change the
  // prompt text. 400ms debounce so rapid toggle flips don't fire one
  // preview-prompt request per click.
  useEffect(() => {
    if (!showPrompt || !user?.id) return;
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      setPromptLoading(true);
      setPromptError(null);
      (async () => {
        const { data, error } = await supabase.functions.invoke(
          "hilux-preview-prompt",
          { body: {} },
        );
        if (cancelled) return;
        if (error) {
          setPromptError(error.message ?? "Couldn't load prompt.");
          setPrompt(null);
        } else {
          const text = (data as { prompt?: string } | null)?.prompt ?? null;
          setPrompt(text);
        }
        setPromptLoading(false);
      })();
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [
    showPrompt,
    user?.id,
    profile?.hilux_action_use_calendar,
    profile?.hilux_action_use_first_name,
    profile?.hilux_action_detect_frustration,
    profile?.hilux_action_decline_negotiation,
    profile?.hilux_action_offer_call,
  ]);

  const persist = async (patch: Partial<ProfileRow>, key: string) => {
    if (!user?.id) return false;
    setSavingKey(key);
    const { error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", user.id);
    setSavingKey(null);
    if (error) {
      console.error("[MySpaceToolToggles] save failed", error);
      toast.error("Couldn't save.");
      return false;
    }
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
    return true;
  };

  const toggleEnabled = async (next: boolean) => {
    const ok = await persist({ hilux_enabled: next }, "enabled");
    if (ok) {
      toast.success(
        next
          ? "Inbox auto-reply is on. My Space will answer host messages."
          : "Inbox auto-reply paused.",
      );
    }
  };

  const toggleAction = async (key: ActionKey, next: boolean) => {
    await persist({ [key]: next } as Partial<ProfileRow>, key);
  };

  const resetToDefaults = async () => {
    if (!user?.id) return;
    if (!confirm("Reset all action toggles to defaults?")) return;
    setResetting(true);
    const { error } = await supabase
      .from("profiles")
      .update(DEFAULTS)
      .eq("id", user.id);
    setResetting(false);
    if (error) {
      console.error("[MySpaceToolToggles] reset failed", error);
      toast.error("Couldn't reset.");
      return;
    }
    setProfile(
      (prev) => (prev ? ({ ...prev, ...DEFAULTS } as ProfileRow) : prev),
    );
    toast.success("Reset to defaults.");
  };

  const enabled = profile?.hilux_enabled === true;

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{
        background: "rgba(255,253,250,0.7)",
        border: "0.5px solid rgba(255,138,76,0.22)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      {/* Master switch — enables the inbox auto-reply. The chatbox on
          the left works regardless of this toggle. */}
      <div
        className="flex items-center gap-3 p-4 border-b"
        style={{ borderColor: "rgba(255,138,76,0.18)" }}
      >
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">Inbox auto-reply</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Let My Space answer host inquiries on your behalf.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {savingKey === "enabled" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          ) : null}
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider ${
              enabled ? "text-muted-foreground" : "text-foreground"
            }`}
          >
            Off
          </span>
          <Switch
            checked={enabled}
            disabled={savingKey === "enabled" || !profile}
            onCheckedChange={toggleEnabled}
          />
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider ${
              enabled ? "text-[#c4541e]" : "text-muted-foreground"
            }`}
          >
            On
          </span>
        </div>
      </div>

      {/* Tool permissions list */}
      <div className="p-4 flex-1 overflow-y-auto">
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <div>
            <p className="text-sm font-medium text-foreground mb-0.5">
              Tool permissions
            </p>
            <p className="text-xs text-muted-foreground">
              Choose what My Space is allowed to do.
            </p>
          </div>
          <button
            type="button"
            onClick={resetToDefaults}
            disabled={resetting}
            className="shrink-0 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
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
          <SearchIcon
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find an action…"
            aria-label="Search tool permissions"
            className="pl-8 h-8 text-sm"
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
                <CollapsibleTrigger className="group flex items-center justify-between w-full py-2.5 rounded-md hover:bg-secondary/40 transition-colors">
                  <div className="flex items-center gap-2">
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                    <span className="text-sm font-medium text-foreground">
                      {group.title}
                    </span>
                    <span className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-md bg-secondary/60 text-[10px] font-medium text-muted-foreground tabular-nums">
                      {visible.length}
                      {q && visible.length !== group.actions.length
                        ? `/${group.actions.length}`
                        : ""}
                    </span>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="divide-y pl-5" style={{ borderColor: "rgba(255,138,76,0.12)" }}>
                    {visible.map((action) => {
                      const { Icon } = action;
                      const value = profile?.[action.key] !== false;
                      const isSaving = savingKey === action.key;
                      return (
                        <li
                          key={action.key}
                          className="flex items-center gap-3 py-3"
                          style={{ borderColor: "rgba(255,138,76,0.12)" }}
                        >
                          <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground leading-tight">
                              {action.label}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                              {action.blurb}
                            </p>
                          </div>
                          {isSaving ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
                          ) : null}
                          <Switch
                            checked={value}
                            disabled={!enabled || isSaving}
                            onCheckedChange={(v) => toggleAction(action.key, v)}
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
          <p className="mt-3 text-[11px] text-muted-foreground italic">
            Flip the auto-reply on above to use these.
          </p>
        ) : null}
      </div>

      {/* Prompt preview — shows the exact system prompt the AI sees
          before replying on the vendor's behalf, built from their
          listing context + the toggle state above. Collapsed by
          default so the panel mounts fast. */}
      <div
        className="border-t p-4"
        style={{ borderColor: "rgba(255,138,76,0.18)" }}
      >
        <button
          type="button"
          onClick={() => setShowPrompt((v) => !v)}
          className="flex items-center justify-between w-full text-left"
          aria-expanded={showPrompt}
        >
          <div>
            <p className="text-sm font-medium text-foreground">
              What My Space is told
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              The exact system prompt — updates with your toggles above.
            </p>
          </div>
          <ChevronRight
            className={`w-4 h-4 text-muted-foreground transition-transform ${
              showPrompt ? "rotate-90" : ""
            }`}
            aria-hidden
          />
        </button>
        {showPrompt ? (
          <div
            className="mt-3 rounded-lg border overflow-hidden max-h-[420px] flex flex-col"
            style={{ borderColor: "rgba(255,138,76,0.18)", background: "rgba(255,255,255,0.7)" }}
          >
            {promptLoading && !prompt ? (
              <div className="flex-1 flex items-center justify-center gap-2 text-[11px] text-muted-foreground py-8">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading prompt…
              </div>
            ) : promptError ? (
              <div className="flex-1 flex items-center justify-center text-[11px] text-red-600 p-4 text-center">
                {promptError}
              </div>
            ) : !prompt ? (
              <div className="flex-1 flex items-center justify-center text-[11px] text-muted-foreground p-4 text-center">
                No listing yet — the prompt will appear once you publish one.
              </div>
            ) : (
              <pre className="flex-1 overflow-auto p-3 text-[11px] leading-relaxed text-foreground/80 font-mono whitespace-pre-wrap">{prompt}</pre>
            )}
          </div>
        ) : null}
        {showPrompt && prompt ? (
          <p className="mt-2 text-[10px] text-muted-foreground">
            {prompt.length.toLocaleString()} chars · cached as the system prompt on every reply
          </p>
        ) : null}
      </div>
    </div>
  );
}
