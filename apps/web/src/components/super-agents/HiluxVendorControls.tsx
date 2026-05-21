// HILUX controls — single profile-scoped agent card. Click the card
// header to expand the action list, custom instructions, and voice
// training sub-panel. All config saves go to `profiles` (HILUX is
// one agent per user, not per listing).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  Calendar,
  ChevronDown,
  ChevronRight,
  Globe2,
  Loader2,
  Mic,
  Pencil,
  Plus,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { HiluxLogo } from "./AgentLogos";

interface HiluxProfileRow {
  hilux_enabled: boolean;
  hilux_instructions: string | null;
  hilux_voice_samples: string[];
  hilux_action_follow_up: boolean;
  hilux_action_match_language: boolean;
  hilux_action_use_calendar: boolean;
  hilux_action_escalate: boolean;
}

type ActionKey =
  | "hilux_action_follow_up"
  | "hilux_action_match_language"
  | "hilux_action_use_calendar"
  | "hilux_action_escalate";

interface ActionDef {
  key: ActionKey;
  label: string;
  blurb: string;
  Icon: typeof Bot;
}

const ACTIONS: ActionDef[] = [
  {
    key: "hilux_action_follow_up",
    label: "Send follow-up nudges",
    blurb:
      "If a host goes silent for 2-3 days after a HILUX reply, send one gentle follow-up.",
    Icon: Send,
  },
  {
    key: "hilux_action_match_language",
    label: "Match the host's language",
    blurb:
      "Detect the host's language from their last message and reply in the same language.",
    Icon: Globe2,
  },
  {
    key: "hilux_action_use_calendar",
    label: "Use my calendar for date answers",
    blurb:
      "Read live availability so HILUX can answer \"are you free on Sept 12?\" directly.",
    Icon: Calendar,
  },
  {
    key: "hilux_action_escalate",
    label: "Escalate when uncertain",
    blurb:
      "If HILUX can't confidently answer, route it to your inbox instead of guessing.",
    Icon: ShieldAlert,
  },
];

const INSTRUCTIONS_PLACEHOLDER = `Examples:
• Our tone is warm and casual — no corporate language.
• Always ask about budget before sharing prices.
• We don't do Sunday weddings. If asked, say we're closed Sundays.`;

const MAX_SAMPLES = 5;
const MAX_SAMPLE_LEN = 1500;

const TONE_PRESETS: Array<{ label: string; text: string }> = [
  {
    label: "Warm & casual",
    text:
      "Tone: warm, friendly, conversational. Use first names if the host shares theirs. Skip corporate phrases like 'thank you for reaching out.'",
  },
  {
    label: "Professional",
    text:
      "Tone: polished and professional. Use complete sentences, no slang. Sign off the substance, not the bubble — keep it crisp.",
  },
  {
    label: "Playful",
    text:
      "Tone: playful and a little witty. Light humour is welcome when it lands; never at the host's expense. Keep replies under 3 sentences.",
  },
  {
    label: "Luxury",
    text:
      "Tone: refined, understated luxury. Lead with curiosity about their vision before pricing. Never lead with a price tag; lead with experience.",
  },
];

export function HiluxVendorControls() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<HiluxProfileRow | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [draftInstructions, setDraftInstructions] = useState("");
  const [draftSample, setDraftSample] = useState("");
  const instructionsSaveTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "hilux_enabled, hilux_instructions, hilux_voice_samples, hilux_action_follow_up, hilux_action_match_language, hilux_action_use_calendar, hilux_action_escalate",
      )
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      console.error("[HiluxVendorControls] load failed", error);
      toast.error("Couldn't load HILUX settings.");
      return;
    }
    const row = (data as HiluxProfileRow | null) ?? {
      hilux_enabled: false,
      hilux_instructions: null,
      hilux_voice_samples: [],
      hilux_action_follow_up: true,
      hilux_action_match_language: true,
      hilux_action_use_calendar: true,
      hilux_action_escalate: true,
    };
    setProfile(row);
    setDraftInstructions(row.hilux_instructions ?? "");
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

  const onInstructionsChange = (value: string) => {
    setDraftInstructions(value);
    if (instructionsSaveTimer.current)
      window.clearTimeout(instructionsSaveTimer.current);
    instructionsSaveTimer.current = window.setTimeout(() => {
      const trimmed = value.trim();
      persist(
        { hilux_instructions: trimmed.length === 0 ? null : trimmed },
        "instructions",
      );
    }, 700);
  };

  const applyTonePreset = (preset: { text: string }) => {
    const current = (draftInstructions ?? "").trim();
    const next = current.length === 0 ? preset.text : `${current}\n\n${preset.text}`;
    onInstructionsChange(next.slice(0, 4000));
  };

  const addSample = async () => {
    if (!profile) return;
    const trimmed = draftSample.trim();
    if (!trimmed) return;
    if ((profile.hilux_voice_samples ?? []).length >= MAX_SAMPLES) return;
    const next = [...(profile.hilux_voice_samples ?? []), trimmed].slice(
      0,
      MAX_SAMPLES,
    );
    const ok = await persist({ hilux_voice_samples: next }, "voice");
    if (ok) {
      setDraftSample("");
      toast.success("Sample added.");
    }
  };

  const removeSample = async (idx: number) => {
    if (!profile) return;
    const next = (profile.hilux_voice_samples ?? []).filter((_, i) => i !== idx);
    await persist({ hilux_voice_samples: next }, "voice");
  };

  if (!user) return null;

  const enabled = profile?.hilux_enabled === true;
  const samples = profile?.hilux_voice_samples ?? [];
  const atSampleCap = samples.length >= MAX_SAMPLES;

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
            {/* Tool permissions — connector-style. Header + subtitle
                like Sentry/Stripe connector panels, then a
                collapsible "Actions" group with a count chip. Each
                row is a tool HILUX can use, with an on/off toggle. */}
            <div>
              <p className="text-sm font-medium text-black mb-0.5">
                Tool permissions
              </p>
              <p className="text-xs text-black/55 mb-3">
                Choose when HILUX is allowed to use these.
              </p>
              <Collapsible defaultOpen>
                <CollapsibleTrigger className="group flex items-center justify-between w-full py-2.5 rounded-md hover:bg-white/40 transition-colors">
                  <div className="flex items-center gap-2">
                    <ChevronRight className="w-3.5 h-3.5 text-black/55 transition-transform group-data-[state=open]:rotate-90" />
                    <span className="text-sm font-medium text-black">
                      Actions
                    </span>
                    <span className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-md bg-black/10 text-[10px] font-medium text-black/65 tabular-nums">
                      {ACTIONS.length}
                    </span>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="divide-y divide-black/10">
                    {ACTIONS.map((action) => {
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
                            onCheckedChange={(v) => toggleAction(action.key, v)}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
              {!enabled ? (
                <p className="mt-2 text-[11px] text-black/45 italic">
                  Flip HILUX on above to use these.
                </p>
              ) : null}
            </div>

            {/* Custom instructions */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Pencil className="w-3.5 h-3.5 text-black/55" />
                <p className="text-[11px] uppercase tracking-[0.2em] text-black/55">
                  Custom instructions
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                <span className="text-[11px] uppercase tracking-wider text-black/45 mr-1">
                  Quick tone:
                </span>
                {TONE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyTonePreset(p)}
                    className="text-[11px] px-2.5 py-1 rounded-full border border-black/15 bg-white/70 text-black/75 hover:bg-white hover:border-black/30 transition-colors"
                  >
                    + {p.label}
                  </button>
                ))}
              </div>
              <Textarea
                value={draftInstructions}
                onChange={(e) => onInstructionsChange(e.target.value)}
                placeholder={INSTRUCTIONS_PLACEHOLDER}
                className="min-h-[140px] resize-y bg-white/70 text-sm font-mono text-black"
                maxLength={4000}
              />
              <div className="flex items-center justify-between text-[11px] text-black/45 mt-1">
                <span>
                  HILUX always reads each listing's bio, packages, and FAQs.
                  Use this box for tone, rules, or anything else.
                </span>
                <span className="shrink-0 pl-3 tabular-nums">
                  {draftInstructions.length} / 4000
                </span>
              </div>
            </div>

            {/* Voice training */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Mic className="w-3.5 h-3.5 text-black/55" />
                <p className="text-[11px] uppercase tracking-[0.2em] text-black/55">
                  Voice training · {samples.length}/{MAX_SAMPLES}
                </p>
              </div>
              <p className="text-xs text-black/55 mb-2">
                Paste 3–5 messages you've actually sent to past inquiries.
                HILUX learns your cadence and vocab.
              </p>
              {samples.length > 0 ? (
                <ul className="space-y-2 mb-3">
                  {samples.map((sample, i) => (
                    <li
                      key={i}
                      className="group flex items-start gap-2 rounded-xl bg-white/65 border border-black/5 p-3"
                    >
                      <span className="text-[10px] font-medium uppercase tracking-wider text-black/40 mt-0.5 shrink-0">
                        #{i + 1}
                      </span>
                      <p className="text-sm text-black/85 whitespace-pre-wrap flex-1 leading-snug">
                        {sample}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeSample(i)}
                        disabled={savingKey === "voice"}
                        aria-label="Remove sample"
                        className="opacity-30 group-hover:opacity-100 hover:text-rose-600 transition-opacity shrink-0 mt-0.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="space-y-1.5">
                <Textarea
                  value={draftSample}
                  onChange={(e) => setDraftSample(e.target.value.slice(0, MAX_SAMPLE_LEN))}
                  placeholder={
                    atSampleCap
                      ? `You've hit the ${MAX_SAMPLES} sample cap — remove one to add a new one.`
                      : `Paste a real reply you've sent...`
                  }
                  disabled={atSampleCap || savingKey === "voice"}
                  className="min-h-[100px] resize-y bg-white text-sm text-black"
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] text-black/45 tabular-nums">
                    {draftSample.length} / {MAX_SAMPLE_LEN}
                  </span>
                  <Button
                    onClick={addSample}
                    disabled={!draftSample.trim() || savingKey === "voice" || atSampleCap}
                    size="sm"
                    className="bg-black text-white hover:bg-black/85"
                  >
                    {savingKey === "voice" ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Add sample
                  </Button>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-black/45 italic flex items-center gap-1.5 pt-1">
              <Sparkles className="w-3 h-3" />
              HILUX uses these settings across all your listings.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
