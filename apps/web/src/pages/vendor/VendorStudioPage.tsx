import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Bot,
  ImageIcon,
  Images,
  Loader2,
  Package,
  Sparkles,
  Upload,
  Wand2,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { vendorNavItems as navItems } from "@/data/navItems";
import ImageEditorDemo from "@/components/vendor/ImageEditorDemo";
import { PortfolioUploader } from "@/components/vendor/PortfolioUploader";
import { PackageManager } from "@/components/vendor/PackageManager";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

// Studio — vendor-side workshop. Four tabs across the top:
//   - AI Agent (placeholder for now)
//   - Image Editor (the existing prompt-driven photo editor)
//   - Photo Gallery (vendor portfolio uploads)
//   - Packages (pricing tiers)
//
// The actual model call inside the Image Editor is still a stub —
// when the image-edit endpoint goes live, swap the stubbed `run`
// implementation for a real fetch.

type StudioTab = "ai" | "image" | "gallery" | "packages";

const TABS: Array<{ id: StudioTab; label: string; icon: LucideIcon }> = [
  { id: "ai", label: "AI Agent", icon: Bot },
  { id: "image", label: "Image Editor", icon: Wand2 },
  { id: "gallery", label: "Photo Gallery", icon: Images },
  { id: "packages", label: "Packages", icon: Package },
];

export default function VendorStudioPage() {
  const { user } = useAuth();
  const [studioTab, setStudioTab] = useState<StudioTab>("ai");
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [vendorIdLoading, setVendorIdLoading] = useState(true);

  // Fetch the vendor profile id directly off user_id so this page
  // works even if vendorMemberships is stale (which we hit on freshly
  // signed-up vendors before the team-membership row gets written).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setVendorIdLoading(true);
    (async () => {
      const { data } = await supabase
        .from("vendor_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setVendorId((data as { id: string } | null)?.id ?? null);
      setVendorIdLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <h1 className="font-display text-xl">Studio</h1>
          <p className="text-sm text-muted-foreground">
            Tools for tuning your listing — content, imagery, and pricing.
          </p>
        </div>

        {/* Tab strip — flat segmented bar across the top of the page. */}
        <div className="border-b border-border bg-card px-2 md:px-8 sticky top-[73px] z-30">
          <div className="max-w-5xl mx-auto flex overflow-x-auto scrollbar-hide">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = studioTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStudioTab(tab.id)}
                  className={`flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                    active
                      ? "text-foreground border-b-2 border-foreground"
                      : "text-muted-foreground hover:text-foreground border-b-2 border-transparent"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 md:p-8 max-w-6xl mx-auto">
          {studioTab === "ai" && <AiAgentPanel />}
          {studioTab === "image" && <ImageEditorPanel />}
          {studioTab === "gallery" && (
            <GalleryPanel
              vendorId={vendorId}
              loading={vendorIdLoading}
            />
          )}
          {studioTab === "packages" && (
            <PackagesPanel
              vendorId={vendorId}
              loading={vendorIdLoading}
            />
          )}
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}

function AiAgentPanel() {
  return (
    <div className="rounded-md border border-dashed border-border bg-card/40 p-12 text-center max-w-xl mx-auto">
      <div className="w-12 h-12 rounded-full bg-secondary/60 flex items-center justify-center mx-auto mb-4">
        <Bot className="w-5 h-5 text-foreground" />
      </div>
      <h2 className="font-display text-xl mb-2">AI Agent — coming soon</h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Auto-reply to inquiries, qualify leads, and draft proposals from
        your inbox. We're wiring the model + your listing context now.
      </p>
    </div>
  );
}

function GalleryPanel({
  vendorId,
  loading,
}: {
  vendorId: string | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Loading your gallery…</p>
    );
  }
  if (!vendorId) {
    return (
      <div className="rounded-md border border-border bg-card p-8 text-center max-w-md mx-auto">
        <p className="text-sm text-muted-foreground">
          Set up your business profile first — gallery uploads attach to
          your vendor listing.
        </p>
      </div>
    );
  }
  return <PortfolioUploader vendorId={vendorId} />;
}

function PackagesPanel({
  vendorId,
  loading,
}: {
  vendorId: string | null;
  loading: boolean;
}) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading packages…</p>;
  }
  if (!vendorId) {
    return (
      <div className="rounded-md border border-border bg-card p-8 text-center max-w-md mx-auto">
        <p className="text-sm text-muted-foreground">
          Set up your business profile first — packages attach to your
          vendor listing.
        </p>
      </div>
    );
  }
  return <PackageManager vendorId={vendorId} canEdit />;
}

// ---------- Image editor (the original Studio surface) ----------

function ImageEditorPanel() {
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
    await new Promise((r) => setTimeout(r, 900));
    setRunning(false);
    toast.error(t("studio.not_wired"));
  }

  const canRun = Boolean(sourceFile) && prompt.trim().length > 0 && !running;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-md bg-accent/10 text-accent flex items-center justify-center shrink-0">
          <Wand2 className="w-4 h-4" />
        </div>
        <div>
          <h2 className="font-display text-lg leading-tight">Image editor</h2>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Upload a photo, describe the edit, and the result lands on the
            right. Watch the demo to see it end-to-end.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_240px_1fr] gap-3 items-stretch">
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
                <span className="text-sm font-medium">{t("studio.upload")}</span>
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

        <div className="xl:sticky xl:top-32">
          <ImageEditorDemo />
        </div>
      </div>
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
