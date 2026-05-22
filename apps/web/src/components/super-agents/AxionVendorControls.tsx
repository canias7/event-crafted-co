// Axion 9.1 — the listing-photo agent. Vendor uploads a photo,
// picks a style, and Axion (OpenAI gpt-image-1) returns restyled
// editorial-grade variants to download. Stateless for v1: results
// live in the panel until the page reloads.

import { useRef, useState } from "react";
import { Download, ImagePlus, Loader2, Sparkles, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const STYLES = [
  { key: "editorial", label: "Editorial" },
  { key: "bright", label: "Bright & airy" },
  { key: "warm", label: "Warm" },
  { key: "studio", label: "Studio" },
];

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export function AxionVendorControls() {
  const [sourceDataUrl, setSourceDataUrl] = useState<string | null>(null);
  const [style, setStyle] = useState("editorial");
  const [generating, setGenerating] = useState(false);
  const [variants, setVariants] = useState<string[]>([]);
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
    };
    reader.readAsDataURL(file);
  };

  const generate = async () => {
    if (!sourceDataUrl) return;
    setGenerating(true);
    setVariants([]);
    try {
      const { data, error } = await supabase.functions.invoke("axion-generate", {
        body: { image: sourceDataUrl, style },
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

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-12">
      <div
        className="rounded-2xl p-5"
        style={{
          background: "rgba(255,253,250,0.7)",
          border: "0.5px solid rgba(0,0,0,0.08)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(208,102,255,0.14)" }}
          >
            <ImagePlus className="w-5 h-5" style={{ color: "#b13bdb" }} />
          </div>
          <div>
            <h3 className="font-editorial text-xl leading-none">AXION 9.1</h3>
            <p className="text-xs text-black/55 mt-1">
              Turn a listing photo into editorial-grade shots.
            </p>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />

        {sourceDataUrl ? (
          <div className="relative rounded-xl overflow-hidden mb-3">
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
            className="w-full rounded-xl border border-dashed border-black/20 py-10 flex flex-col items-center gap-2 text-black/50 hover:text-black/70 hover:border-black/30 transition-colors mb-3"
          >
            <Upload className="w-5 h-5" />
            <span className="text-sm">Upload a listing photo</span>
            <span className="text-[11px]">JPG or PNG, up to 15MB</span>
          </button>
        )}

        <div className="flex flex-wrap gap-1.5 mb-3">
          {STYLES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStyle(s.key)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                style === s.key
                  ? "bg-foreground text-background border-foreground"
                  : "border-black/15 text-black/60 hover:text-black/80"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={generate}
          disabled={!sourceDataUrl || generating}
          className="w-full rounded-xl bg-foreground text-background text-sm font-medium py-2.5 flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity"
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

        {variants.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 mt-4">
            {variants.map((v, i) => (
              <div
                key={i}
                className="relative rounded-xl overflow-hidden border border-black/10"
              >
                <img src={v} alt={`Variant ${i + 1}`} className="w-full" />
                <a
                  href={v}
                  download={`axion-${style}-${i + 1}.png`}
                  className="absolute bottom-2 right-2 bg-black/70 text-white p-1.5 rounded-md"
                  aria-label={`Download variant ${i + 1}`}
                >
                  <Download className="w-3.5 h-3.5" />
                </a>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
