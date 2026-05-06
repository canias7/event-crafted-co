import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  ImageIcon,
  Loader2,
  Sparkles,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { vendorNavItems as navItems } from "@/data/navItems";
import ImageEditorDemo from "@/components/vendor/ImageEditorDemo";

// Studio — image-editing surface. Two square canvases with a prompt
// in between: left = user-uploaded source image, right = the model's
// edited output, prompt = natural-language instruction
// ("remove background", "warm the tones", "make it look golden hour").
//
// The actual model call is a stub for now — it surfaces a clear toast
// when the image-edit endpoint isn't wired up yet so the UI stays
// honest about what's connected and what's coming.

export default function VendorStudioPage() {
  const { t } = useTranslation();
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [outputPreview, setOutputPreview] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function pickFile(file: File | null) {
    if (!file) {
      setSourceFile(null);
      setSourcePreview(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Pick an image file (PNG, JPG, WebP).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image is over 10 MB. Please pick a smaller file.");
      return;
    }
    if (sourcePreview) URL.revokeObjectURL(sourcePreview);
    setSourceFile(file);
    setSourcePreview(URL.createObjectURL(file));
    setOutputPreview(null);
  }

  function clearSource() {
    if (sourcePreview) URL.revokeObjectURL(sourcePreview);
    setSourceFile(null);
    setSourcePreview(null);
    setOutputPreview(null);
  }

  async function run() {
    if (!sourceFile || !prompt.trim()) return;
    setRunning(true);
    // Image-edit endpoint isn't wired yet — when it is, swap this
    // for a fetch to /functions/v1/image-edit with the file + prompt
    // and set outputPreview to the returned URL or data: payload.
    await new Promise((r) => setTimeout(r, 900));
    setRunning(false);
    toast.error(t("studio.not_wired"));
  }

  const canRun = Boolean(sourceFile) && prompt.trim().length > 0 && !running;

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <h1 className="font-display text-xl">{t("studio.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("studio.subtitle")}
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-6xl space-y-6">
          {/* Image editor section header — anchors the page so the
              vendor knows what surface they're on; matches the
              section-header pattern the rest of the listing builder
              uses. */}
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-md bg-accent/10 text-accent flex items-center justify-center shrink-0">
              <Wand2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-lg leading-tight">
                Image editor
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Upload a photo, describe the edit, and the result lands on
                the right. Watch the demo video to see it end-to-end.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_240px_1fr] gap-3 items-stretch">
            {/* Source — left square */}
            <ImagePanel
              eyebrow={t("studio.source_label")}
              empty={
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={t("studio.upload")}
                >
                  <div className="w-10 h-10 rounded-full bg-secondary/60 flex items-center justify-center">
                    <Upload className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-medium">
                    {t("studio.upload")}
                  </span>
                  <span className="text-[11px] text-muted-foreground/80">
                    {t("studio.upload_hint")}
                  </span>
                </button>
              }
            >
              {sourcePreview && (
                <>
                  <img
                    src={sourcePreview}
                    alt="Source"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={clearSource}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-foreground/80 text-background hover:bg-foreground transition-colors flex items-center justify-center"
                    aria-label="Remove image"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                className="sr-only"
              />
            </ImagePanel>

            {/* Prompt + run — middle column */}
            <div className="rounded-sm border border-border bg-card p-4 flex flex-col">
              <p className="font-label text-muted-foreground inline-flex items-center gap-1.5 mb-3">
                <Sparkles className="w-3 h-3" />
                {t("studio.edit_prompt")}
              </p>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t("studio.prompt_placeholder")}
                rows={6}
                className="resize-none flex-1 min-h-[120px] text-sm"
              />
              <div className="mt-3 space-y-2">
                <PresetChip
                  label={t("studio.preset_remove_bg")}
                  onClick={() => setPrompt(t("studio.preset_remove_bg"))}
                />
                <PresetChip
                  label={t("studio.preset_golden_hour")}
                  onClick={() => setPrompt(t("studio.preset_golden_hour"))}
                />
                <PresetChip
                  label={t("studio.preset_cinematic")}
                  onClick={() => setPrompt(t("studio.preset_cinematic"))}
                />
              </div>
              <Button
                type="button"
                onClick={run}
                disabled={!canRun}
                className="mt-3 rounded-full bg-foreground text-background hover:bg-foreground/90 w-full"
              >
                {running ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    {t("studio.generating")}
                  </>
                ) : (
                  <>
                    {t("studio.generate")}
                    <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </>
                )}
              </Button>
            </div>

            {/* Output — right square */}
            <ImagePanel
              eyebrow={t("studio.result_label")}
              empty={
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <div className="w-10 h-10 rounded-full bg-secondary/60 flex items-center justify-center">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-medium">
                    {t("studio.no_result")}
                  </span>
                  <span className="text-[11px] text-muted-foreground/80 max-w-[200px] text-center leading-relaxed">
                    {t("studio.no_result_hint")}
                  </span>
                </div>
              }
            >
              {running && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {outputPreview && (
                <img
                  src={outputPreview}
                  alt="Result"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
            </ImagePanel>
            </div>

            {/* Right column at xl, stacks below the editor on
                everything narrower. Animated walkthrough shows the
                end-to-end flow before the vendor commits a real
                photo. The demo's own internal 3-col grid stays
                readable at common phone widths. */}
            <div className="xl:sticky xl:top-20">
              <ImageEditorDemo />
            </div>
          </div>
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}

function ImagePanel({
  eyebrow,
  empty,
  children,
}: {
  eyebrow: string;
  empty: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-sm border border-border bg-card overflow-hidden flex flex-col">
      <div className="px-4 py-2 border-b border-border bg-card/50">
        <p className="font-label text-muted-foreground">{eyebrow}</p>
      </div>
      <div className="relative aspect-[4/3] bg-secondary/30">
        {empty}
        {children}
      </div>
    </div>
  );
}

function PresetChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left text-xs px-3 py-1.5 rounded-full bg-secondary/40 hover:bg-secondary/70 text-muted-foreground hover:text-foreground transition-colors"
    >
      {label}
    </button>
  );
}
