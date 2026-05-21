// HILUX voice training — vendor pastes 3-5 of their real past replies,
// HILUX uses them as style examples in the system prompt so its replies
// match the vendor's voice (cadence, vocab, punctuation, tone).
//
// One pane per listing the vendor owns: a list of saved samples with
// delete buttons + a textarea to add a new one. Max 5 per listing,
// 1500 chars each (~8000 total budget for the prompt section).

import { useCallback, useEffect, useState } from "react";
import { Loader2, Mic, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ListingRow {
  id: string;
  business_name: string | null;
  hilux_voice_samples: string[];
}

const MAX_SAMPLES = 5;
const MAX_SAMPLE_LEN = 1500;

export function HiluxVoiceTraining() {
  const { user } = useAuth();
  const [listings, setListings] = useState<ListingRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from("vendor_profiles")
      .select("id, business_name, hilux_voice_samples")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[HiluxVoiceTraining] load", error);
      toast.error("Couldn't load your listings.");
      setListings([]);
      return;
    }
    const rows = (data ?? []) as ListingRow[];
    setListings(rows);
    if (rows.length > 0 && !selectedId) setSelectedId(rows[0].id);
  }, [user?.id, selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = listings?.find((l) => l.id === selectedId) ?? null;
  const samples = selected?.hilux_voice_samples ?? [];
  const atCap = samples.length >= MAX_SAMPLES;

  const persist = async (next: string[]) => {
    if (!selected) return;
    setSaving(true);
    const { error } = await supabase
      .from("vendor_profiles")
      .update({ hilux_voice_samples: next })
      .eq("id", selected.id);
    setSaving(false);
    if (error) {
      console.error("[HiluxVoiceTraining] save", error);
      toast.error("Couldn't save voice sample.");
      return false;
    }
    setListings((prev) =>
      prev
        ? prev.map((r) =>
            r.id === selected.id ? { ...r, hilux_voice_samples: next } : r,
          )
        : prev,
    );
    return true;
  };

  const addSample = async () => {
    const trimmed = draft.trim();
    if (!trimmed || !selected || atCap) return;
    const next = [...samples, trimmed].slice(0, MAX_SAMPLES);
    const ok = await persist(next);
    if (ok) {
      setDraft("");
      toast.success("Sample added. HILUX is learning your voice.");
    }
  };

  const removeSample = async (idx: number) => {
    if (!selected) return;
    const next = samples.filter((_, i) => i !== idx);
    await persist(next);
  };

  if (!user) return null;

  return (
    <div className="relative z-10 px-6 md:px-10 mt-4">
      <div className="max-w-3xl mx-auto rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 md:p-7 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.4)]">
        <div className="flex items-start gap-3 mb-5">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "rgba(255, 138, 76, 0.15)" }}
          >
            <Mic className="w-5 h-5" style={{ color: "#ff8a4c" }} />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-[11px] uppercase tracking-[0.2em] mb-1"
              style={{ color: "rgba(255, 138, 76, 0.85)" }}
            >
              Voice training · Up to {MAX_SAMPLES} examples
            </p>
            <h3 className="font-editorial text-2xl text-black leading-tight">
              Teach HILUX how you write.
            </h3>
            <p className="text-sm text-black/60 mt-1">
              Paste 3–5 messages you've actually sent to past inquiries. HILUX
              will match your cadence, word choice, and tone — not a generic
              chatbot voice.
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
            Add a listing first to train HILUX on its voice.
          </p>
        ) : (
          <div className="space-y-4">
            <Select
              value={selectedId ?? undefined}
              onValueChange={(v) => setSelectedId(v)}
            >
              <SelectTrigger className="w-full bg-white/70 text-black">
                <SelectValue placeholder="Pick a listing" />
              </SelectTrigger>
              <SelectContent>
                {listings.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.business_name ?? "Untitled listing"} ·{" "}
                    {l.hilux_voice_samples.length} sample
                    {l.hilux_voice_samples.length === 1 ? "" : "s"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {samples.length === 0 ? (
              <p className="text-sm text-black/50 italic px-1">
                No samples yet. Paste a real reply you've sent below.
              </p>
            ) : (
              <ul className="space-y-2">
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
                      disabled={saving}
                      aria-label="Remove sample"
                      className="opacity-30 group-hover:opacity-100 hover:text-rose-600 transition-opacity shrink-0 mt-0.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-1.5">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, MAX_SAMPLE_LEN))}
                placeholder={
                  atCap
                    ? `You've hit the ${MAX_SAMPLES} sample cap — remove one to add a new one.`
                    : `Paste a real reply you've sent before — for example:\n\n"Hey Sarah! We're free on Sept 12 and would love to talk through what you have in mind. Our Heirloom package is the most popular for 50-guest weddings; want me to send the details?"`
                }
                disabled={atCap || saving}
                className="min-h-[120px] resize-y bg-white text-sm text-black"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-black/45 tabular-nums">
                  {draft.length} / {MAX_SAMPLE_LEN} · {samples.length} of{" "}
                  {MAX_SAMPLES} samples
                </span>
                <Button
                  onClick={addSample}
                  disabled={!draft.trim() || saving || atCap}
                  size="sm"
                  className="bg-black text-white hover:bg-black/85"
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Add sample
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
