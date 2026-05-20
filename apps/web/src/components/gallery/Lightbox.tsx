// Gallery lightbox with side panel showing sanitized EXIF + the
// row's caption + actions: Edit (rotate/flip), Share (create token
// link), Download. Arrow keys + Esc navigate / close.

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  Link2,
  Loader2,
  Pencil,
  Star,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EditModal } from "@/components/gallery/EditModal";
import { ShareModal } from "@/components/gallery/ShareModal";
import type { SanitizedExif } from "@/lib/galleryImage";
import { downloadCrossOrigin } from "@/lib/downloadImage";

interface Img {
  id: string;
  image_url: string;
  caption: string | null;
  exif: SanitizedExif | null;
  width: number | null;
  height: number | null;
  file_size_bytes: number | null;
  created_at: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatCoord(value: number, posLabel: string, negLabel: string): string {
  const abs = Math.abs(value);
  return `${abs.toFixed(4)}° ${value >= 0 ? posLabel : negLabel}`;
}

interface Props {
  rows: Img[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onChange: () => void; // refresh after edit
  /** When set, the lightbox shows a "Set as album cover" button —
   *  used to give mobile users access to the right-click-only
   *  cover-setting action on the grid. */
  onSetAsCover?: () => void;
  isAlbumCover?: boolean;
}

export function Lightbox({
  rows,
  index,
  onClose,
  onPrev,
  onNext,
  onChange,
  onSetAsCover,
  isAlbumCover,
}: Props) {
  const row = rows[index];
  const [panelOpen, setPanelOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editOpen || shareOpen) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext, editOpen, shareOpen]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch bg-black/90"
      onClick={onClose}
    >
      {/* Main viewer area */}
      <div className="relative flex-1 flex items-center justify-center p-4">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          aria-label="Previous"
          disabled={index === 0}
          className="absolute left-4 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          aria-label="Next"
          disabled={index === rows.length - 1}
          className="absolute right-4 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        <img
          src={row.image_url}
          alt={row.caption ?? "Gallery image"}
          className="max-h-[90vh] max-w-full object-contain rounded-md"
          onClick={(e) => e.stopPropagation()}
        />

        {/* Top action bar */}
        <div
          className="absolute top-4 left-4 right-4 flex items-center justify-between gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-xs text-white/70 tnum">
            {index + 1} / {rows.length}
          </p>
          <div className="flex items-center gap-1">
            {onSetAsCover ? (
              <ActionButton
                onClick={onSetAsCover}
                label={isAlbumCover ? "Album cover" : "Set as album cover"}
                active={isAlbumCover}
              >
                <Star className={`w-4 h-4 ${isAlbumCover ? "fill-current" : ""}`} />
              </ActionButton>
            ) : null}
            <ActionButton onClick={() => setEditOpen(true)} label="Edit">
              <Pencil className="w-4 h-4" />
            </ActionButton>
            <ActionButton onClick={() => setShareOpen(true)} label="Share">
              <Link2 className="w-4 h-4" />
            </ActionButton>
            <ActionButton
              onClick={async () => {
                if (downloading) return;
                setDownloading(true);
                try {
                  await downloadCrossOrigin(row.image_url);
                } catch (err) {
                  const msg = err instanceof Error ? err.message : "Couldn't download.";
                  toast.error(msg);
                } finally {
                  setDownloading(false);
                }
              }}
              label={downloading ? "Downloading…" : "Download"}
              disabled={downloading}
            >
              {downloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
            </ActionButton>
            <ActionButton
              onClick={() => setPanelOpen((p) => !p)}
              label="Image info"
              active={panelOpen}
            >
              <Info className="w-4 h-4" />
            </ActionButton>
            <ActionButton onClick={onClose} label="Close">
              <X className="w-4 h-4" />
            </ActionButton>
          </div>
        </div>
      </div>

      {/* EXIF panel */}
      {panelOpen ? (
        <aside
          className="w-80 shrink-0 bg-background text-foreground border-l border-border overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 space-y-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                File
              </p>
              <ExifRow label="Dimensions">
                {row.width && row.height ? `${row.width} × ${row.height}` : "—"}
              </ExifRow>
              {row.file_size_bytes ? (
                <ExifRow label="Size">{formatFileSize(row.file_size_bytes)}</ExifRow>
              ) : null}
              <ExifRow label="Uploaded">
                {new Date(row.created_at).toLocaleString()}
              </ExifRow>
            </div>
            {row.exif ? (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Camera
                </p>
                {row.exif.camera_make || row.exif.camera_model ? (
                  <ExifRow label="Body">
                    {[row.exif.camera_make, row.exif.camera_model]
                      .filter(Boolean)
                      .join(" ")}
                  </ExifRow>
                ) : null}
                {row.exif.lens ? (
                  <ExifRow label="Lens">{row.exif.lens}</ExifRow>
                ) : null}
                {row.exif.date_taken ? (
                  <ExifRow label="Captured">
                    {new Date(row.exif.date_taken).toLocaleString()}
                  </ExifRow>
                ) : null}
                {row.exif.iso ? (
                  <ExifRow label="ISO">{String(row.exif.iso)}</ExifRow>
                ) : null}
                {row.exif.aperture ? (
                  <ExifRow label="Aperture">
                    f/{row.exif.aperture}
                  </ExifRow>
                ) : null}
                {row.exif.shutter ? (
                  <ExifRow label="Shutter">{row.exif.shutter}</ExifRow>
                ) : null}
                {row.exif.focal_length ? (
                  <ExifRow label="Focal length">
                    {row.exif.focal_length}mm
                  </ExifRow>
                ) : null}
                {row.exif.gps_lat !== undefined &&
                row.exif.gps_lon !== undefined ? (
                  <ExifRow label="GPS">
                    <a
                      href={`https://www.google.com/maps?q=${row.exif.gps_lat},${row.exif.gps_lon}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent hover:underline"
                    >
                      {formatCoord(row.exif.gps_lat, "N", "S")},{" "}
                      {formatCoord(row.exif.gps_lon, "E", "W")}
                    </a>
                  </ExifRow>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No camera metadata.
              </p>
            )}
            {row.caption ? (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Caption
                </p>
                <p className="text-sm text-foreground/90 leading-relaxed">
                  {row.caption}
                </p>
              </div>
            ) : null}
          </div>
        </aside>
      ) : null}

      <EditModal
        open={editOpen}
        onOpenChange={setEditOpen}
        imageId={row.id}
        imageUrl={row.image_url}
        onSaved={onChange}
      />
      <ShareModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        imageId={row.id}
        targetLabel={row.caption ?? "this image"}
      />
    </div>
  );
}

function ActionButton({
  onClick,
  label,
  active,
  disabled,
  children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`inline-flex items-center justify-center w-10 h-10 rounded-full transition-colors ${
        disabled
          ? "bg-white/10 text-white/50 cursor-not-allowed"
          : active
            ? "bg-white text-black"
            : "bg-white/10 hover:bg-white/20 text-white"
      }`}
    >
      {children}
    </button>
  );
}

function ExifRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground text-right">{children}</span>
    </div>
  );
}
