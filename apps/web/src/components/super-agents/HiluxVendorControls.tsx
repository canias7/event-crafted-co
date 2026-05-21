// HILUX controls — single profile-scoped agent card. Click the card
// header to expand the action list, custom instructions, and voice
// training sub-panel. All config saves go to `profiles` (HILUX is
// one agent per user, not per listing).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  Bell,
  BellRing,
  Bot,
  Calendar,
  CalendarOff,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Eye,
  EyeOff,
  Flame,
  Frown,
  Mail,
  HandHeart,
  HelpCircle,
  Image as ImageIcon,
  Inbox,
  Lock,
  Loader2,
  Moon,
  Phone,
  Quote,
  RotateCcw,
  Ruler,
  Search as SearchIcon,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Smile,
  Tag,
  UserX,
  Workflow,
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
  | "hilux_action_follow_up"
  | "hilux_action_quiet_hours"
  | "hilux_action_pause_weekends"
  | "hilux_action_skip_when_active"
  | "hilux_action_use_calendar"
  | "hilux_action_escalate"
  | "hilux_action_detect_frustration"
  | "hilux_action_mention_starting_price"
  | "hilux_action_suggest_package"
  | "hilux_action_decline_negotiation"
  | "hilux_action_avoid_competitors"
  | "hilux_action_send_portfolio_link"
  | "hilux_action_offer_call"
  | "hilux_action_share_booking_process"
  | "hilux_action_echo_question"
  | "hilux_action_acknowledge_emotion"
  | "hilux_action_lead_with_question"
  | "hilux_action_refuse_legal"
  | "hilux_action_refuse_competitor_pricing"
  | "hilux_action_no_other_clients"
  | "hilux_action_redact_contact"
  | "hilux_action_auto_mark_replied"
  | "hilux_action_notify_on_reply"
  | "hilux_action_update_inquiry_fields"
  | "hilux_action_notify_on_escalation"
  | "hilux_action_notify_on_hot_lead"
  | "hilux_action_email_reply_copies"
  | "hilux_action_auto_archive_cold";

export type HiluxReplyLength = "short" | "medium" | "long";

type HiluxProfileRow = {
  hilux_enabled: boolean;
  hilux_instructions: string | null;
  hilux_greeting_line: string | null;
  hilux_reply_length: HiluxReplyLength;
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
      { key: "hilux_action_escalate", label: "Escalate when uncertain", blurb: "If HILUX can't confidently answer, route it to your inbox instead of guessing.", Icon: ShieldAlert },
      { key: "hilux_action_detect_frustration", label: "Escalate frustrated hosts", blurb: "If the host sounds upset, hand off to you instead of trying to smooth it over.", Icon: Frown },
      { key: "hilux_action_mention_starting_price", label: "Mention starting price upfront", blurb: "When the host asks about cost, lead with the starting price right away.", Icon: CircleDollarSign },
      { key: "hilux_action_suggest_package", label: "Suggest the right package", blurb: "When the host's ask matches a package, recommend it by name.", Icon: Tag },
      { key: "hilux_action_decline_negotiation", label: "Decline price negotiation", blurb: "If the host asks for a discount, politely decline. No haggling.", Icon: ShieldOff },
      { key: "hilux_action_avoid_competitors", label: "Don't discuss competitors", blurb: "Redirect any competitor talk back to what makes the listing distinctive.", Icon: Shield },
      { key: "hilux_action_send_portfolio_link", label: "Mention portfolio in first reply", blurb: "Point new hosts at the public profile to see more recent work.", Icon: ImageIcon },
      { key: "hilux_action_offer_call", label: "Offer to schedule a call", blurb: "Once the lead warms up, offer a quick call to walk through details.", Icon: Phone },
      { key: "hilux_action_share_booking_process", label: "Explain the next step", blurb: "When the host expresses booking intent, briefly outline what's next.", Icon: Workflow },
      { key: "hilux_action_echo_question", label: "Echo back the question", blurb: "Restate what the host asked before answering, to prove HILUX understood.", Icon: Quote },
      { key: "hilux_action_acknowledge_emotion", label: "Acknowledge their excitement", blurb: "When the host expresses excitement, warmly acknowledge it before answering.", Icon: Smile },
      { key: "hilux_action_lead_with_question", label: "Open with a question", blurb: "First HILUX reply leads with a question to pull more info instead of answering.", Icon: HelpCircle },
    ],
  },
  {
    title: "Safety & privacy",
    actions: [
      { key: "hilux_action_refuse_legal", label: "Refuse legal / contract talk", blurb: "Redirect contract / cancellation questions until the host is ready to sign.", Icon: Lock },
      { key: "hilux_action_refuse_competitor_pricing", label: "Refuse price-match asks", blurb: "Politely decline any \"can you match X's price\" question.", Icon: ShieldCheck },
      { key: "hilux_action_no_other_clients", label: "Never reference other clients", blurb: "Don't drop names, even anonymously (\"we just did a wedding for...\").", Icon: UserX },
      { key: "hilux_action_redact_contact", label: "Strip contact info from replies", blurb: "Belt-and-suspenders: never write phone, email, or URL — even if echoing.", Icon: EyeOff },
    ],
  },
  {
    title: "Pacing",
    actions: [
      { key: "hilux_action_follow_up", label: "Send follow-up nudges", blurb: "If a host goes silent 2-3 days after a reply, send one gentle nudge.", Icon: Send },
      { key: "hilux_action_quiet_hours", label: "Quiet hours overnight", blurb: "Pause auto-replies from late evening to early morning so the host doesn't get a 3am reply.", Icon: Moon },
      { key: "hilux_action_pause_weekends", label: "Pause on weekends", blurb: "Skip auto-replies on Saturdays and Sundays. Vendor handles weekend inboxes.", Icon: CalendarOff },
      { key: "hilux_action_skip_when_active", label: "Defer when I'm in the thread", blurb: "If you sent a manual reply in this thread within the last 30 min, HILUX backs off.", Icon: Eye },
    ],
  },
  {
    title: "Operations",
    actions: [
      { key: "hilux_action_auto_mark_replied", label: "Auto-mark inquiry as 'replied'", blurb: "Once HILUX answers, flip the inquiry status from new to replied so it leaves the new bucket.", Icon: Inbox },
      { key: "hilux_action_notify_on_escalation", label: "Notify me when HILUX escalates", blurb: "Push notification when HILUX can't answer and routes the conversation to you.", Icon: BellRing },
      { key: "hilux_action_notify_on_hot_lead", label: "Notify me when a lead turns hot", blurb: "Push notification the first time HILUX flags a conversation as a hot lead.", Icon: Flame },
      { key: "hilux_action_notify_on_reply", label: "Notify me on every HILUX reply", blurb: "Push notification whenever HILUX sends a message on your behalf. Can get noisy.", Icon: Bell },
      { key: "hilux_action_email_reply_copies", label: "Email me a copy of every HILUX reply", blurb: "Receive an email each time HILUX answers, with the host's question and HILUX's reply.", Icon: Mail },
      { key: "hilux_action_update_inquiry_fields", label: "Update inquiry fields from chat", blurb: "When the host mentions an event date, guest count, or budget in conversation, write it back to the inquiry record automatically.", Icon: ClipboardList },
      { key: "hilux_action_auto_archive_cold", label: "Auto-archive cold leads after 14 days", blurb: "Mark inquiries as lost when HILUX has scored them cold and the host hasn't replied in 14 days.", Icon: Archive },
    ],
  },
];

const ALL_ACTIONS: ActionDef[] = ACTION_GROUPS.flatMap((g) => g.actions);


export function HiluxVendorControls() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<HiluxProfileRow | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [draftGreeting, setDraftGreeting] = useState("");
  const [query, setQuery] = useState("");
  const [resetting, setResetting] = useState(false);
  const greetingSaveTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "hilux_enabled, hilux_instructions, hilux_greeting_line, hilux_reply_length, hilux_action_follow_up, hilux_action_quiet_hours, hilux_action_pause_weekends, hilux_action_skip_when_active, hilux_action_use_calendar, hilux_action_escalate, hilux_action_detect_frustration, hilux_action_mention_starting_price, hilux_action_suggest_package, hilux_action_decline_negotiation, hilux_action_avoid_competitors, hilux_action_send_portfolio_link, hilux_action_offer_call, hilux_action_share_booking_process, hilux_action_echo_question, hilux_action_acknowledge_emotion, hilux_action_lead_with_question, hilux_action_refuse_legal, hilux_action_refuse_competitor_pricing, hilux_action_no_other_clients, hilux_action_redact_contact, hilux_action_auto_mark_replied, hilux_action_notify_on_reply, hilux_action_update_inquiry_fields, hilux_action_notify_on_escalation, hilux_action_notify_on_hot_lead, hilux_action_email_reply_copies, hilux_action_auto_archive_cold",
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
      hilux_instructions: null,
      hilux_greeting_line: null,
      hilux_reply_length: "medium",
      hilux_action_follow_up: true,
      hilux_action_quiet_hours: false,
      hilux_action_pause_weekends: false,
      hilux_action_skip_when_active: true,
      hilux_action_use_calendar: true,
      hilux_action_escalate: true,
      hilux_action_detect_frustration: true,
      hilux_action_mention_starting_price: false,
      hilux_action_suggest_package: true,
      hilux_action_decline_negotiation: true,
      hilux_action_avoid_competitors: true,
      hilux_action_send_portfolio_link: false,
      hilux_action_offer_call: true,
      hilux_action_share_booking_process: true,
      hilux_action_echo_question: false,
      hilux_action_acknowledge_emotion: true,
      hilux_action_lead_with_question: false,
      hilux_action_refuse_legal: true,
      hilux_action_refuse_competitor_pricing: true,
      hilux_action_no_other_clients: true,
      hilux_action_redact_contact: true,
      hilux_action_auto_mark_replied: true,
      hilux_action_notify_on_reply: false,
      hilux_action_update_inquiry_fields: false,
      hilux_action_notify_on_escalation: true,
      hilux_action_notify_on_hot_lead: true,
      hilux_action_email_reply_copies: false,
      hilux_action_auto_archive_cold: false,
    } satisfies HiluxProfileRow);
    setProfile(row);
    setDraftGreeting(row.hilux_greeting_line ?? "");
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

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

  const onGreetingChange = (value: string) => {
    setDraftGreeting(value);
    if (greetingSaveTimer.current) window.clearTimeout(greetingSaveTimer.current);
    greetingSaveTimer.current = window.setTimeout(() => {
      const trimmed = value.trim();
      persist(
        { hilux_greeting_line: trimmed.length === 0 ? null : trimmed },
        "greeting",
      );
    }, 700);
  };

  const setReplyLength = async (next: HiluxReplyLength) => {
    await persist({ hilux_reply_length: next }, "reply_length");
  };

  // Reset toggles + reply length + greeting to defaults. Custom
  // instructions stay (those are the vendor's own writing; resetting
  // them would feel destructive).
  const resetToDefaults = async () => {
    if (!user?.id) return;
    if (!confirm("Reset all action toggles and length/greeting to defaults? Your custom instructions stay.")) return;
    setResetting(true);
    const patch: Partial<HiluxProfileRow> = {
      hilux_greeting_line: null,
      hilux_reply_length: "medium",
      hilux_action_follow_up: true,
      hilux_action_quiet_hours: false,
      hilux_action_pause_weekends: false,
      hilux_action_skip_when_active: true,
      hilux_action_use_calendar: true,
      hilux_action_escalate: true,
      hilux_action_detect_frustration: true,
      hilux_action_mention_starting_price: false,
      hilux_action_suggest_package: true,
      hilux_action_decline_negotiation: true,
      hilux_action_avoid_competitors: true,
      hilux_action_send_portfolio_link: false,
      hilux_action_offer_call: true,
      hilux_action_share_booking_process: true,
      hilux_action_echo_question: false,
      hilux_action_acknowledge_emotion: true,
      hilux_action_lead_with_question: false,
      hilux_action_refuse_legal: true,
      hilux_action_refuse_competitor_pricing: true,
      hilux_action_no_other_clients: true,
      hilux_action_redact_contact: true,
      hilux_action_auto_mark_replied: true,
      hilux_action_notify_on_reply: false,
      hilux_action_update_inquiry_fields: false,
      hilux_action_notify_on_escalation: true,
      hilux_action_notify_on_hot_lead: true,
      hilux_action_email_reply_copies: false,
      hilux_action_auto_archive_cold: false,
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
    setDraftGreeting("");
    toast.success("Reset to defaults.");
  };

  if (!user) return null;

  const enabled = profile?.hilux_enabled === true;

  return (
    <div className="relative z-10 px-6 md:px-10 pt-24 md:pt-28">
      <div className="max-w-3xl mx-auto rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_8px_40px_-12px_rgba(0,0,0,0.4)] overflow-hidden">
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
              <div className="flex items-center gap-2">
                <h3 className="font-editorial text-2xl md:text-3xl text-black leading-tight truncate">
                  HILUX 2.7
                </h3>
                <span
                  className="inline-flex items-center text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded-full"
                  style={{
                    background: enabled
                      ? "rgba(255, 138, 76, 0.15)"
                      : "rgba(0, 0, 0, 0.08)",
                    color: enabled ? "#c4541e" : "rgba(0, 0, 0, 0.5)",
                  }}
                >
                  {enabled ? "Always On" : "Off"}
                </span>
              </div>
              <p className="text-xs text-black/60 mt-1 leading-snug">
                Reads each host inquiry, replies in your voice using your
                bio, packages, and FAQs, and hands off to you when it's
                not sure.
              </p>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-black/50 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>
          <div className="flex items-center gap-2 shrink-0">
            {savingKey === "enabled" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-black/40" />
            ) : null}
            <Switch
              checked={enabled}
              disabled={savingKey === "enabled" || !profile}
              onCheckedChange={toggleEnabled}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>

        {expanded ? (
          <div className="border-t border-black/10 p-5 md:p-6 space-y-6 bg-white/30">
            {/* Greeting line + reply length — two compact controls
                that shape every reply HILUX writes. Greeting is a
                free-text opener used on the FIRST reply only;
                replyLength tunes the "X short sentences" target. */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <HandHeart className="w-3.5 h-3.5 text-black/55" />
                  <p className="text-[11px] uppercase tracking-[0.2em] text-black/55">
                    Custom greeting (first reply)
                  </p>
                </div>
                <Input
                  value={draftGreeting}
                  onChange={(e) => onGreetingChange(e.target.value.slice(0, 200))}
                  placeholder="e.g. Hey there! Thanks for reaching out —"
                  className="bg-white/70 text-sm text-black"
                  maxLength={200}
                />
                <p className="text-[11px] text-black/45 mt-1">
                  Used verbatim on the first HILUX reply in a thread. Leave blank for HILUX to write its own opener.
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Ruler className="w-3.5 h-3.5 text-black/55" />
                  <p className="text-[11px] uppercase tracking-[0.2em] text-black/55">
                    Reply length
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-white/55 p-1">
                  {(["short", "medium", "long"] as const).map((opt) => {
                    const active = (profile?.hilux_reply_length ?? "medium") === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setReplyLength(opt)}
                        disabled={savingKey === "reply_length"}
                        className={`text-xs font-medium capitalize py-1.5 rounded-md transition-colors ${
                          active
                            ? "bg-black text-white"
                            : "text-black/70 hover:bg-white/70"
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-black/45 mt-1">
                  Short: 1–2 sentences · Medium: 2–4 · Long: 3–6.
                </p>
              </div>
            </div>

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
                  title="Reset toggles + greeting + length to defaults"
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
        ) : null}
      </div>
    </div>
  );
}
