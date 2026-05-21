// HILUX controls — vendor-only card on /vendor/super-agents that lets
// the vendor enable HILUX per listing AND give it free-form custom
// instructions (ChatGPT-style "Custom Instructions"). When enabled,
// the DB trigger on direct_messages calls hilux-respond, which appends
// these instructions to the system prompt so replies sound the way
// the vendor wants them to sound.
//
// One row per listing the vendor owns: an Enable switch, plus a
// collapsible "Customize HILUX" textarea. Saves debounce on blur.

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Loader2, Pencil } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface HiluxListingRow {
  id: string;
  business_name: string | null;
  category: string | null;
  application_status: string | null;
  hilux_enabled: boolean;
  hilux_instructions: string | null;
}

const PLACEHOLDER = `Examples:
• Always ask about budget before sharing prices.
• Our tone is warm and casual — no corporate language.
• We don't do Sunday weddings. If asked, say we're closed Sundays.
• If they mention "small wedding", recommend our Intimate package.`;

// Quick-start tone presets the vendor can drop into the instructions
// textarea. Picking one appends a stub paragraph they can edit; we
// don't replace the existing text so iterative tweaking is safe.
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
  const [listings, setListings] = useState<HiluxListingRow[] | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Local edit buffer so typing doesn't fight the saved value.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const saveTimers = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from("vendor_profiles")
      .select(
        "id, business_name, category, application_status, hilux_enabled, hilux_instructions",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[HiluxVendorControls] load failed", error);
      toast.error("Couldn't load your listings.");
      setListings([]);
      return;
    }
    const rows = (data ?? []) as HiluxListingRow[];
    setListings(rows);
    setDrafts((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        if (!(row.id in next)) next[row.id] = row.hilux_instructions ?? "";
      }
      return next;
    });
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (row: HiluxListingRow, next: boolean) => {
    setSavingId(row.id);
    const { error } = await supabase
      .from("vendor_profiles")
      .update({ hilux_enabled: next })
      .eq("id", row.id);
    setSavingId(null);
    if (error) {
      console.error("[HiluxVendorControls] update failed", error);
      toast.error("Couldn't save the change.");
      return;
    }
    setListings((prev) =>
      prev
        ? prev.map((r) => (r.id === row.id ? { ...r, hilux_enabled: next } : r))
        : prev,
    );
    toast.success(
      next
        ? `HILUX is now answering on ${row.business_name ?? "this listing"}`
        : `HILUX paused on ${row.business_name ?? "this listing"}`,
    );
  };

  const saveInstructions = async (row: HiluxListingRow, value: string) => {
    setSavingId(row.id);
    const trimmed = value.trim();
    const { error } = await supabase
      .from("vendor_profiles")
      .update({ hilux_instructions: trimmed.length === 0 ? null : trimmed })
      .eq("id", row.id);
    setSavingId(null);
    if (error) {
      console.error("[HiluxVendorControls] instructions save failed", error);
      toast.error("Couldn't save your HILUX instructions.");
      return;
    }
    setListings((prev) =>
      prev
        ? prev.map((r) =>
            r.id === row.id
              ? { ...r, hilux_instructions: trimmed.length === 0 ? null : trimmed }
              : r,
          )
        : prev,
    );
  };

  const onInstructionsChange = (row: HiluxListingRow, value: string) => {
    setDrafts((prev) => ({ ...prev, [row.id]: value }));
    // Debounced save 700ms after the last keystroke. Beats blur-save
    // because the textarea stays focused while the user thinks.
    const existing = saveTimers.current[row.id];
    if (existing) window.clearTimeout(existing);
    saveTimers.current[row.id] = window.setTimeout(() => {
      saveInstructions(row, value);
    }, 700);
  };

  const applyTonePreset = (row: HiluxListingRow, preset: { text: string }) => {
    const current = (drafts[row.id] ?? row.hilux_instructions ?? "").trim();
    const next = current.length === 0 ? preset.text : `${current}\n\n${preset.text}`;
    onInstructionsChange(row, next.slice(0, 4000));
  };

  if (!user) return null;

  return (
    <div className="relative z-10 px-6 md:px-10 pt-24 md:pt-28">
      <div className="max-w-3xl mx-auto rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 md:p-7 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.4)]">
        <div className="flex items-start gap-3 mb-5">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "rgba(255, 138, 76, 0.15)" }}
          >
            <Bot className="w-5 h-5" style={{ color: "#ff8a4c" }} />
          </div>
          <div className="min-w-0">
            <p
              className="text-[11px] uppercase tracking-[0.2em] mb-1"
              style={{ color: "rgba(255, 138, 76, 0.85)" }}
            >
              HILUX 2.7 · Always On
            </p>
            <h3 className="font-editorial text-2xl md:text-3xl text-black leading-tight">
              Turn HILUX on, then teach it how to sound like you.
            </h3>
            <p className="text-sm text-black/60 mt-1.5">
              HILUX reads your bio, packages, and FAQs by default. Add
              custom instructions to shape its tone and rules — just like
              ChatGPT's Custom Instructions.
            </p>
          </div>
        </div>

        {listings === null ? (
          <div className="flex items-center gap-2 text-sm text-black/50 py-6">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading your listings…
          </div>
        ) : listings.length === 0 ? (
          <p className="text-sm text-black/60 py-6">
            You don't have any listings yet. Create one in My Profile, then
            come back to flip HILUX on.
          </p>
        ) : (
          <div className="divide-y divide-black/10">
            {listings.map((row) => {
              const isSaving = savingId === row.id;
              const isExpanded = expandedId === row.id;
              const draft = drafts[row.id] ?? row.hilux_instructions ?? "";
              const name = row.business_name ?? "Untitled listing";
              const category = row.category ?? "—";
              const charCount = draft.length;
              return (
                <div key={row.id} className="py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId((cur) => (cur === row.id ? null : row.id))
                      }
                      className="min-w-0 text-left flex-1 hover:opacity-80 transition-opacity"
                    >
                      <p className="text-sm font-medium text-black truncate">
                        {name}
                      </p>
                      <p className="text-xs text-black/55 truncate flex items-center gap-1.5">
                        <span>{category}</span>
                        {row.application_status &&
                        row.application_status !== "approved" ? (
                          <span>· {row.application_status}</span>
                        ) : null}
                        {row.hilux_instructions ? (
                          <>
                            <span>·</span>
                            <Pencil className="w-3 h-3" />
                            <span>Custom instructions set</span>
                          </>
                        ) : null}
                      </p>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      {isSaving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-black/40" />
                      ) : null}
                      <Switch
                        checked={row.hilux_enabled}
                        disabled={isSaving}
                        onCheckedChange={(v) => toggle(row, v)}
                      />
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="mt-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] uppercase tracking-wider text-black/45 mr-1">
                          Quick tone:
                        </span>
                        {TONE_PRESETS.map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => applyTonePreset(row, preset)}
                            className="text-[11px] px-2.5 py-1 rounded-full border border-black/15 bg-white/70 text-black/75 hover:bg-white hover:border-black/30 transition-colors"
                          >
                            + {preset.label}
                          </button>
                        ))}
                      </div>
                      <Textarea
                        value={draft}
                        onChange={(e) => onInstructionsChange(row, e.target.value)}
                        placeholder={PLACEHOLDER}
                        className="min-h-[140px] resize-y bg-white/70 text-sm font-mono text-black"
                        maxLength={4000}
                      />
                      <div className="flex items-center justify-between text-[11px] text-black/45">
                        <span>
                          HILUX always reads your listing bio, packages, and
                          FAQs. Use this box for tone, rules, or anything
                          specific to how you want it to reply.
                        </span>
                        <span className="shrink-0 pl-3 tabular-nums">
                          {charCount} / 4000
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
