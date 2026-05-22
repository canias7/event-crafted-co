// Axion 9.1 — the listing-photo agent. Three-step flow: upload a
// photo, write a prompt (or tap a quick preset), and Axion (OpenAI
// gpt-image-1) returns restyled variants. Variants can be downloaded
// or saved into the vendor's gallery ("Axion" album).
//
// Chrome (card + header) mirrors the HILUX panel.

import { useRef, useState } from "react";
import { Check, Download, Loader2, Sparkles, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// Quick-fill prompt presets — tapping one drops editable text into
// the prompt box. The vendor can tweak it or write their own.
const QUICK_PROMPTS = [
  {
    label: "Editorial",
    text: "Polish this into an editorial, magazine-quality photo — elevate the lighting, colour, and sharpness while keeping it natural.",
  },
  {
    label: "Bright & airy",
    text: "Make this bright and airy — lift the exposure, soften the shadows, clean and fresh.",
  },
  {
    label: "Warm",
    text: "Give this warm, inviting golden tones and a cozy ambiance.",
  },
  {
    label: "Clean background",
    text: "Tidy and neutralize the background into a clean, professional studio backdrop.",
  },
];

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

function StepLabel({ n, children }: { n: number; children: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-black/45 mb-2">
      <span className="text-black/30">{n} · </span>
      {children}
    </p>
  );
}

export function AxionVendorControls() {
  const { user } = useAuth();
  const [sourceDataUrl, setSourceDataUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [variants, setVariants] = useState<string[]>([]);
  const [saved, setSaved] = useState<Record<number, "saving" | "saved">>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const onPick = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Pick an image file.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("Image is too large — keep it under 15MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSourceDataUrl(typeof reader.result === "string" ? reader.result : null);
      setVariants([]);
      setSaved({});
    };
    reader.readAsDataURL(file);
  };

  const generate = async () => {
    if (!sourceDataUrl || !prompt.trim()) return;
    setGenerating(true);
    setVariants([]);
    setSaved({});
    try {
      const { data, error } = await supabase.functions.invoke("axion-generate", {
        body: { image: sourceDataUrl, prompt: prompt.trim() },
      });
      if (error) throw error;
      const v = (data?.variants ?? []) as string[];
      if (v.length === 0) throw new Error("no_variants");
      setVariants(v);
    } catch (err) {
      console.error("[Axion] generate failed", err);
      toast.error("Couldn't generate variants. Try again in a moment.");
    } finally {
      setGenerating(false);
    }
  };

  // Find the vendor's "Axion" gallery album, creating it on first save.
  const ensureAxionAlbum = async (): Promise<string | null> => {
    if (!user?.id) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
      .from("vendor_gallery_albums")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", "Axion")
      .limit(1)
      .maybeSingle();
    if (existing?.id) return existing.id as string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: created, error } = await (supabase as any)
      .from("vendor_gallery_albums")
      .insert({ user_id: user.id, name: "Axion" })
      .select("id")
      .single();
    if (error) {
      console.error("[Axion] album create failed", error);
      return null;
    }
    return (created?.id as string) ?? null;
  };

  const saveToGallery = async (dataUrl: string, index: number) => {
    if (!user?.id || saved[index]) return;
    setSaved((s) => ({ ...s, [index]: "saving" }));
    try {
      const albumId = await ensureAxionAlbum();
      if (!albumId) throw new Error("no_album");
      const blob = await (await fetch(dataUrl)).blob();
      const path = `${user.id}/axion-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.png`;
      const up = await supabase.storage
        .from("vendor-gallery")
        .upload(path, blob, { contentType: "image/png", upsert: false });
      if (up.error) throw up.error;
      const { data: pub } = supabase.storage
        .from("vendor-gallery")
        .getPublicUrl(path);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insErr } = await (supabase as any)
        .from("vendor_gallery_images")
        .insert({
          user_id: user.id,
          image_url: pub.publicUrl,
          album_id: albumId,
          width: 1024,
          height: 1024,
          file_size_bytes: blob.size,
        });
      if (insErr) throw insErr;
      setSaved((s) => ({ ...s, [index]: "saved" }));
      toast.success("Saved to your gallery — “Axion” album.");
    } catch (err) {
      console.error("[Axion] save failed", err);
      setSaved((s) => {
        const next = { ...s };
        delete next[index];
        return next;
      });
      toast.error("Couldn't save to gallery. Try again.");
    }
  };

  const canGenerate = !!sourceDataUrl && !!prompt.trim() && !generating;

  return (
    <div className="relative z-10 px-6 md:px-10 pt-6 pb-24">
      <div className="max-w-3xl mx-auto rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_8px_40px_-12px_rgba(0,0,0,0.4)] overflow-hidden">
        {/* Header — mirrors the HILUX panel */}
        <div className="flex items-center gap-4 p-5 md:p-6">
          <div className="w-12 h-12 rounded-2xl overflow-hidden ring-1 ring-black/5 shrink-0">
            <img
              src="/agents/axion-logo.jpg"
              alt="Axion"
              className="w-full h-full object-cover block"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-editorial text-2xl md:text-3xl text-black leading-tight">
              AXION 9.1
            </h3>
            <p className="text-xs text-black/55 mt-0.5">
              Turn a listing photo into editorial-grade shots.
            </p>
          </div>
        </div>

        {/* Body — three steps: photo → prompt → result */}
        <div className="border-t border-black/10 p-5 md:p-6 space-y-6 bg-white/30">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />

          {/* 1 — Your photo */}
          <div>
            <StepLabel n={1}>Your photo</StepLabel>
            {sourceDataUrl ? (
              <div className="relative rounded-xl overflow-hidden">
                <img
                  src={sourceDataUrl}
                  alt="Upload to restyle"
                  className="w-full max-h-72 object-contain bg-black/5"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="absolute top-2 right-2 text-[11px] bg-black/70 text-white px-2 py-1 rounded-md"
                >
                  Replace
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full rounded-xl border border-dashed border-black/20 py-10 flex flex-col items-center gap-2 text-black/50 hover:text-black/70 hover:border-black/30 transition-colors"
              >
                <Upload className="w-5 h-5" />
                <span className="text-sm">Upload a listing photo</span>
                <span className="text-[11px]">JPG or PNG, up to 15MB</span>
              </button>
            )}
          </div>

          {/* 2 — Prompt */}
          <div>
            <StepLabel n={2}>What should Axion do?</StepLabel>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => setPrompt(q.text)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    prompt === q.text
                      ? "bg-foreground text-background border-foreground"
                      : "border-black/15 text-black/60 hover:text-black/80"
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Describe the look you want — e.g. brighter, natural lighting; clean studio background; warmer tones…"
              className="w-full rounded-xl border border-black/15 bg-white/70 p-3 text-sm text-black placeholder:text-black/35 resize-none focus:outline-none focus:ring-2 focus:ring-black/10"
            />
            <button
              type="button"
              onClick={generate}
              disabled={!canGenerate}
              className="w-full mt-2 rounded-xl bg-foreground text-background text-sm font-medium py-2.5 flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating… (~30s)
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate variants
                </>
              )}
            </button>
          </div>

          {/* 3 — Result */}
          <div>
            <StepLabel n={3}>Result</StepLabel>
            {generating ? (
              <div className="rounded-xl border border-dashed border-black/20 py-12 flex flex-col items-center gap-2 text-black/45">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-xs">Axion is restyling your photo…</span>
              </div>
            ) : variants.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {variants.map((v, i) => {
                  const state = saved[i];
                  return (
                    <div
                      key={i}
                      className="rounded-xl overflow-hidden border border-black/10 bg-white"
                    >
                      <img src={v} alt={`Variant ${i + 1}`} className="w-full" />
                      <div className="flex items-center gap-1.5 p-1.5">
                        <button
                          type="button"
                          onClick={() => saveToGallery(v, i)}
                          disabled={!!state}
                          className={`flex-1 text-[11px] rounded-md py-1.5 flex items-center justify-center gap-1 transition-colors ${
                            state === "saved"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-foreground text-background disabled:opacity-60"
                          }`}
                        >
                          {state === "saving" ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : state === "saved" ? (
                            <>
                              <Check className="w-3 h-3" /> Saved
                            </>
                          ) : (
                            "Save to gallery"
                          )}
                        </button>
                        <a
                          href={v}
                          download={`axion-variant-${i + 1}.png`}
                          className="text-black/55 hover:text-black p-1.5 rounded-md hover:bg-black/5"
                          aria-label={`Download variant ${i + 1}`}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-black/20 py-12 flex items-center justify-center text-xs text-black/40">
                Your restyled variants will appear here.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
