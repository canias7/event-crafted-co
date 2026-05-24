// Axion 9.1 — the listing-photo agent. Two modes:
//   Generate — text-to-image: a prompt becomes brand-new photos.
//   Edit     — image-to-image: upload a photo, restyle it.
// Both end in a Result zone; variants download or save into the
// vendor's gallery ("Axion" album). Chrome mirrors the HILUX panel.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Download, Loader2, Sparkles, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { handleInsufficientCredits } from "@/lib/credits";
import { ensureGalleryCapacity } from "@/lib/galleryStorage";
import { toast } from "sonner";

type Mode = "generate" | "edit";

const MODES: { key: Mode; label: string }[] = [
  { key: "generate", label: "Generate" },
  { key: "edit", label: "Edit" },
];

// Quick-fill prompt presets per mode — neither mode ships any
// chips now. Vendors describe what they want in the prompt box.
// Kept as an empty record (typed against Mode) so the chip-row
// guard at the render site stays a one-liner.
const QUICK_PROMPTS: Record<Mode, { label: string; text: string }[]> = {
  generate: [],
  edit: [],
};

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

function StepLabel({ n, children }: { n: number; children: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-black/45 mb-2">
      <span className="text-black/30">{n} · </span>
      {children}
    </p>
  );
}

// SessionStorage key for hydrating generated variants across tab
// switches + sidebar navigation. Variants persist until the vendor
// explicitly dismisses one via the × button or starts a new
// generation. Cleared per-user via key suffix so two accounts on
// the same browser don't see each other's last batch.
const AXION_VARIANTS_KEY = "vendora.axion.variants";

function loadPersistedVariants(userId: string | undefined | null): string[] {
  if (!userId || typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(`${AXION_VARIANTS_KEY}:${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function savePersistedVariants(userId: string | undefined | null, variants: string[]) {
  if (!userId || typeof window === "undefined") return;
  try {
    const key = `${AXION_VARIANTS_KEY}:${userId}`;
    if (variants.length === 0) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(variants));
  } catch {
    // Quota exceeded or storage disabled — silently drop.
  }
}

export function AxionVendorControls() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("generate");
  const [sourceDataUrl, setSourceDataUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [variants, setVariants] = useState<string[]>(() => loadPersistedVariants(user?.id));
  // Audit #8: saved-state map keyed by dataUrl, not array index.
  // The × dismiss button mutates `variants` and reindexes everything;
  // index-keyed state used to mean dismissing variant 0 made the
  // "Saved" badge jump to a different image and let the same image
  // get double-saved. Dataurls survive the shift.
  const [saved, setSaved] = useState<Record<string, "saving" | "saved">>({});
  const [autosave, setAutosave] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Hydrate after user resolves (initial render may have null user).
  useEffect(() => {
    if (!user?.id) return;
    const persisted = loadPersistedVariants(user.id);
    if (persisted.length > 0 && variants.length === 0) {
      setVariants(persisted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Persist every variants change so the panel survives tab switches
  // + sidebar navigation. Cleared on dismiss or new generation.
  useEffect(() => {
    savePersistedVariants(user?.id, variants);
  }, [user?.id, variants]);

  // Load the vendor's Axion settings.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("axion_autosave")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled && data) setAutosave(data.axion_autosave === true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const resetWork = () => {
    setVariants([]);
    setSaved({});
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setPrompt("");
    setSourceDataUrl(null);
    resetWork();
  };

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
      resetWork();
    };
    reader.readAsDataURL(file);
  };

  const toggleAutosave = async (next: boolean) => {
    if (!user?.id) return;
    setAutosave(next);
    const { error } = await supabase
      .from("profiles")
      .update({ axion_autosave: next })
      .eq("id", user.id);
    if (error) {
      console.error("[Axion] autosave setting save failed", error);
      setAutosave(!next);
      toast.error("Couldn't save the setting.");
    }
  };

  const canGenerate =
    !generating &&
    !!prompt.trim() &&
    (mode === "generate" || !!sourceDataUrl);

  const generate = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    resetWork();
    try {
      const body =
        mode === "edit"
          ? { mode, image: sourceDataUrl, prompt: prompt.trim() }
          : { mode, prompt: prompt.trim() };
      const { data, error } = await supabase.functions.invoke("axion-generate", {
        body,
      });
      if (error) throw error;
      const v = (data?.variants ?? []) as string[];
      if (v.length === 0) throw new Error("no_variants");
      setVariants(v);
    } catch (err) {
      console.error("[Axion] generate failed", err);
      if (await handleInsufficientCredits(err, navigate)) return;
      toast.error("Couldn't generate. Try again in a moment.");
    } finally {
      setGenerating(false);
    }
  };

  // Find the vendor's "Axion" gallery album, creating it on first save.
  const ensureAxionAlbum = async (): Promise<string | null> => {
    if (!user?.id) return null;
    const { data: existing } = await supabase
      .from("vendor_gallery_albums")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", "Axion")
      .limit(1)
      .maybeSingle();
    if (existing?.id) return existing.id as string;
    const { data: created, error } = await supabase
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

  const saveToGallery = async (dataUrl: string, _index: number) => {
    if (!user?.id || saved[dataUrl]) return;
    // Per-tier gallery cap pre-check. Without this a Free vendor
    // (cap = 0) saving an Axion image hits the storage RLS reject
    // and gets a cryptic "row violates row-level security policy"
    // toast instead of the friendly upgrade prompt.
    const ok = await ensureGalleryCapacity(user.id, 1);
    if (!ok) return;
    setSaved((s) => ({ ...s, [dataUrl]: "saving" }));
    // Track the uploaded storage path so we can clean it up if the
    // metadata insert later fails — otherwise the PNG is left orphaned
    // in the bucket with no row pointing at it.
    let uploadedPath: string | null = null;
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
      uploadedPath = path;
      const { data: pub } = supabase.storage
        .from("vendor-gallery")
        .getPublicUrl(path);
      const { error: insErr } = await supabase
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
      setSaved((s) => ({ ...s, [dataUrl]: "saved" }));
      toast.success("Saved to your gallery — “Axion” album.");
    } catch (err) {
      console.error("[Axion] save failed", err);
      if (uploadedPath) {
        await supabase.storage
          .from("vendor-gallery")
          .remove([uploadedPath]);
      }
      setSaved((s) => {
        const next = { ...s };
        delete next[dataUrl];
        return next;
      });
      toast.error("Couldn't save to gallery. Try again.");
    }
  };

  // Auto-save freshly generated variants when the setting is on.
  // Keyed off the variants change so `saved` is freshly reset first.
  //
  // Audit H4: pre-check capacity for the WHOLE batch up front so a
  // vendor at cap-1 saving 2 variants either gets both or sees one
  // toast for the batch — never a half-saved set with one orphaned
  // success + one toast for the rejection.
  useEffect(() => {
    if (!autosave || variants.length === 0 || !user?.id) return;
    let cancelled = false;
    (async () => {
      const ok = await ensureGalleryCapacity(user.id, variants.length);
      if (cancelled || !ok) return;
      for (let i = 0; i < variants.length; i++) {
        if (cancelled) break;
        await saveToGallery(variants[i], i);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants, autosave]);

  const promptStep = mode === "edit" ? 2 : 1;
  const resultStep = mode === "edit" ? 3 : 2;

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
              Generate or restyle listing photography on demand.
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="border-t border-black/10 p-5 md:p-6 space-y-6 bg-white/30">
          {/* Mode switcher */}
          <div className="flex rounded-full bg-black/[0.05] p-1">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => switchMode(m.key)}
                className={`flex-1 text-xs font-medium py-1.5 rounded-full transition-colors ${
                  mode === m.key
                    ? "bg-white text-black shadow-sm"
                    : "text-black/50 hover:text-black/75"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />

          {/* Photo step — Edit mode only */}
          {mode === "edit" ? (
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
          ) : null}

          {/* Prompt step */}
          <div>
            <StepLabel n={promptStep}>
              {mode === "edit"
                ? "What should Axion do?"
                : "What should Axion create?"}
            </StepLabel>
            {QUICK_PROMPTS[mode].length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {QUICK_PROMPTS[mode].map((q) => (
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
            )}
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={
                mode === "edit"
                  ? "Describe the look you want — e.g. brighter, natural lighting; clean studio background; warmer tones…"
                  : "Describe the photo to create — e.g. an elegant wedding tablescape with florals and soft window light…"
              }
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
                  Working… (~30s)
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  {mode === "edit" ? "Generate" : "Generate images"}
                </>
              )}
            </button>
          </div>

          {/* Result step */}
          <div>
            <StepLabel n={resultStep}>Result</StepLabel>
            {generating ? (
              <div className="rounded-xl border border-dashed border-black/20 py-12 flex flex-col items-center gap-2 text-black/45">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-xs">
                  Axion is {mode === "edit" ? "restyling your photo" : "creating your images"}…
                </span>
              </div>
            ) : variants.length > 0 ? (
              <div
                className={`grid gap-3 ${
                  variants.length === 1 ? "grid-cols-1" : "grid-cols-2"
                }`}
              >
                {variants.map((v, i) => {
                  const state = saved[v];
                  return (
                    <div
                      key={i}
                      className="relative rounded-xl overflow-hidden border border-black/10 bg-white"
                    >
                      {/* Dismiss button — top-right corner. Removes this
                          variant from the panel (and from sessionStorage
                          via the persistence effect). */}
                      <button
                        type="button"
                        onClick={() =>
                          setVariants((prev) => prev.filter((_, idx) => idx !== i))
                        }
                        aria-label={`Dismiss variant ${i + 1}`}
                        className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center backdrop-blur-sm shadow-md"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
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
                          download={`axion-${i + 1}.png`}
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
                Your images will appear here.
              </div>
            )}
          </div>

          {/* Settings */}
          <div className="border-t border-black/10 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-black/45 mb-3">
              Settings
            </p>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-black">
                  Auto-save to gallery
                </p>
                <p className="text-xs text-black/55">
                  Generated images save straight to your “Axion” gallery album.
                </p>
              </div>
              <Switch checked={autosave} onCheckedChange={toggleAutosave} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
