// 360° Tour — first cut. The vendor uploads an equirectangular 360°
// photo and previews it in the navigable Pannellum viewer. This is
// the viewer-validation step: no persistence yet — storage + showing
// the tour on the public listing come next.

import { useRef, useState } from "react";
import { ChevronLeft, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { vendorNavItems } from "@/data/navItems";
import { Panorama360 } from "@/components/shared/Panorama360";
import { toast } from "sonner";

export default function Vendor360TourPage() {
  const navigate = useNavigate();
  const [src, setSrc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onPick = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Pick an image file.");
      return;
    }
    setSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  return (
    <div className="flex min-h-screen" style={{ background: "#fafafa" }}>
      <DashboardSidebar
        items={vendorNavItems}
        title="Vendor Portal"
        backPath="/vendor/me"
      />
      <main className="flex-1 pb-24 md:pb-0">
        <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto">
          <button
            type="button"
            onClick={() => navigate("/vendor/me")}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ChevronLeft className="w-3 h-3" />
            Vendor Portal
          </button>
          <h1 className="font-editorial text-3xl">360° Tour</h1>
          <p className="text-sm text-muted-foreground mb-5">
            Upload a 360° (equirectangular) photo to preview the walkthrough
            viewer. A normal flat photo won't display correctly — it has to be
            a true 360° capture.
          </p>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />

          {src ? (
            <div className="space-y-3">
              <Panorama360 src={src} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Upload a different photo
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full rounded-xl border border-dashed border-black/20 py-16 flex flex-col items-center gap-2 text-black/50 hover:text-black/70 hover:border-black/30 transition-colors"
            >
              <Upload className="w-6 h-6" />
              <span className="text-sm">Upload a 360° photo</span>
              <span className="text-[11px]">Equirectangular JPG or PNG</span>
            </button>
          )}
        </div>
      </main>
      <MobileNav items={vendorNavItems} />
    </div>
  );
}
