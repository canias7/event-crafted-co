// Vendor gallery — account-level media library. Multi-file upload to
// the vendor-gallery storage bucket, grid of thumbnails with bulk
// select + delete + move-to-album, drag-to-reorder via dnd-kit, and
// a lightbox on click. Distinct from per-listing portfolio
// (vendor_portfolio_images).

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  CheckSquare,
  FolderPlus,
  ImagePlus,
  Loader2,
  MoveRight,
  Pencil,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { vendorNavItems } from "@/data/navItems";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface GalleryRow {
  id: string;
  image_url: string;
  caption: string | null;
  album_id: string | null;
  display_order: number;
  created_at: string;
}

interface Album {
  id: string;
  name: string;
  display_order: number;
}

// Sentinel for the "All" / "Uncategorized" virtual album tabs.
// Album.id is always a uuid; these are not.
const ALL_TAB = "__all__";
const UNCATEGORIZED_TAB = "__none__";

export default function VendorGalleryPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<GalleryRow[] | null>(null);
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [activeTab, setActiveTab] = useState<string>(ALL_TAB);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [imgRes, albRes] = await Promise.all([
      (supabase as any)
        .from("vendor_gallery_images")
        .select("id, image_url, caption, album_id, display_order, created_at")
        .eq("user_id", user.id)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("vendor_gallery_albums")
        .select("id, name, display_order")
        .eq("user_id", user.id)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false }),
    ]);
    if (imgRes.error) toast.error(imgRes.error.message);
    if (albRes.error) toast.error(albRes.error.message);
    setRows((imgRes.data as GalleryRow[] | null) ?? []);
    setAlbums((albRes.data as Album[] | null) ?? []);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Filtered rows for the current tab. The selected set is keyed by
  // image id so it survives a tab switch without weird ghost
  // selections — but we only display checkmarks for items in view.
  const visibleRows = useMemo(() => {
    if (!rows) return [];
    if (activeTab === ALL_TAB) return rows;
    if (activeTab === UNCATEGORIZED_TAB)
      return rows.filter((r) => r.album_id === null);
    return rows.filter((r) => r.album_id === activeTab);
  }, [rows, activeTab]);

  const selectedVisible = useMemo(
    () => visibleRows.filter((r) => selected.has(r.id)),
    [visibleRows, selected],
  );

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelecting(false);
    setSelected(new Set());
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !user?.id || uploading) return;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) {
      toast.error("Pick image files only.");
      return;
    }
    const TOO_BIG = list.find((f) => f.size > 20 * 1024 * 1024);
    if (TOO_BIG) {
      toast.error(`"${TOO_BIG.name}" is over 20 MB. Try a smaller version.`);
      return;
    }

    // If we're inside a specific album tab, new uploads land in that
    // album. From All / Uncategorized, album_id stays null.
    const targetAlbumId =
      activeTab !== ALL_TAB && activeTab !== UNCATEGORIZED_TAB
        ? activeTab
        : null;

    setUploading(true);
    setUploadProgress({ done: 0, total: list.length });
    let failed = 0;
    for (const file of list) {
      const ext =
        file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "jpg";
      const filename = `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      const path = `${user.id}/${filename}`;

      const upload = await supabase.storage
        .from("vendor-gallery")
        .upload(path, file, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });
      if (upload.error) {
        failed += 1;
        console.error("[gallery] upload failed", file.name, upload.error);
        setUploadProgress((p) => ({ ...p, done: p.done + 1 }));
        continue;
      }

      const { data: pub } = supabase.storage
        .from("vendor-gallery")
        .getPublicUrl(path);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insErr } = await (supabase as any)
        .from("vendor_gallery_images")
        .insert({
          user_id: user.id,
          image_url: pub.publicUrl,
          caption: null,
          album_id: targetAlbumId,
        });
      if (insErr) {
        failed += 1;
        supabase.storage
          .from("vendor-gallery")
          .remove([path])
          .then(({ error: rmErr }) => {
            if (rmErr) {
              console.error("[gallery] failed to clean up orphan upload", path, rmErr);
            }
          });
      }
      setUploadProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setUploading(false);
    if (failed > 0) {
      toast.error(
        `${list.length - failed} uploaded, ${failed} failed. Check console.`,
      );
    } else {
      toast.success(`${list.length} image${list.length === 1 ? "" : "s"} added.`);
    }
    await load();
  }

  async function removeOne(id: string) {
    if (!window.confirm("Delete this image? Can't be undone.")) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_gallery_images")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deleted.");
    load();
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} images? Can't be undone.`)) return;
    const ids = Array.from(selected);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_gallery_images")
      .delete()
      .in("id", ids);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${ids.length} deleted.`);
    exitSelectMode();
    load();
  }

  async function bulkMoveToAlbum(albumId: string | null) {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_gallery_images")
      .update({ album_id: albumId })
      .in("id", ids);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      `${ids.length} moved to ${albumId ? "album" : "Uncategorized"}.`,
    );
    exitSelectMode();
    load();
  }

  async function createAlbum() {
    const name = window.prompt("New album name");
    if (!name || !name.trim() || !user?.id) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("vendor_gallery_albums")
      .insert({ user_id: user.id, name: name.trim() })
      .select("id")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Album created.");
    await load();
    if (data?.id) setActiveTab(data.id as string);
  }

  async function renameActiveAlbum() {
    if (activeTab === ALL_TAB || activeTab === UNCATEGORIZED_TAB) return;
    const current = albums?.find((a) => a.id === activeTab);
    if (!current) return;
    const name = window.prompt("Rename album", current.name);
    if (!name || !name.trim() || name.trim() === current.name) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_gallery_albums")
      .update({ name: name.trim() })
      .eq("id", activeTab);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Renamed.");
    load();
  }

  async function deleteActiveAlbum() {
    if (activeTab === ALL_TAB || activeTab === UNCATEGORIZED_TAB) return;
    const current = albums?.find((a) => a.id === activeTab);
    if (!current) return;
    if (
      !window.confirm(
        `Delete album "${current.name}"? The images stay — they move to Uncategorized.`,
      )
    )
      return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_gallery_albums")
      .delete()
      .eq("id", activeTab);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Album deleted.");
    setActiveTab(ALL_TAB);
    load();
  }

  // Drag-to-reorder. Reorders within the currently visible set; writes
  // sequential display_order values to the DB so the new order
  // survives a refresh. PointerSensor with a small activation distance
  // so a click-to-open-lightbox isn't accidentally a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
  );

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = visibleRows.findIndex((r) => r.id === active.id);
    const newIdx = visibleRows.findIndex((r) => r.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;

    const reorderedVisible = arrayMove(visibleRows, oldIdx, newIdx);
    // Optimistic: rebuild rows with the new visible order applied in
    // place. Items outside the visible filter keep their order.
    const visibleIds = new Set(visibleRows.map((r) => r.id));
    const newRows: GalleryRow[] = [];
    let visibleCursor = 0;
    for (const r of rows ?? []) {
      if (visibleIds.has(r.id)) {
        newRows.push(reorderedVisible[visibleCursor++]);
      } else {
        newRows.push(r);
      }
    }
    setRows(newRows);

    // Persist: assign sequential display_order values to the
    // visible-set items. Other items keep whatever they had. Single
    // upsert with the affected ids.
    const updates = reorderedVisible.map((r, i) => ({
      id: r.id,
      display_order: i,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_gallery_images")
      .upsert(updates, { onConflict: "id" });
    if (error) {
      toast.error(`Reorder failed: ${error.message}`);
      load();
    }
  }

  function openPicker() {
    fileInputRef.current?.click();
  }

  const isCustomAlbum =
    activeTab !== ALL_TAB && activeTab !== UNCATEGORIZED_TAB;

  return (
    <div className="min-h-screen vendor-canvas flex">
      <DashboardSidebar
        items={vendorNavItems}
        title="Vendor Portal"
        backPath="/vendor/me"
      />
      <main className="flex-1 pb-24 md:pb-0">
        <div className="backdrop-blur-sm px-4 md:px-8 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-editorial text-3xl">Gallery</h1>
              <p className="text-sm text-muted-foreground">
                Your media library. Upload once, reuse across listings.
              </p>
            </div>
            <NotificationBell variant="light" />
          </div>
        </div>

        <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-5">
          {/* Album tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <AlbumTab
              label="All"
              active={activeTab === ALL_TAB}
              count={rows?.length}
              onClick={() => {
                setActiveTab(ALL_TAB);
                exitSelectMode();
              }}
            />
            <AlbumTab
              label="Uncategorized"
              active={activeTab === UNCATEGORIZED_TAB}
              count={rows?.filter((r) => r.album_id === null).length}
              onClick={() => {
                setActiveTab(UNCATEGORIZED_TAB);
                exitSelectMode();
              }}
            />
            {(albums ?? []).map((a) => (
              <AlbumTab
                key={a.id}
                label={a.name}
                active={activeTab === a.id}
                count={rows?.filter((r) => r.album_id === a.id).length}
                onClick={() => {
                  setActiveTab(a.id);
                  exitSelectMode();
                }}
              />
            ))}
            <button
              type="button"
              onClick={createAlbum}
              className="inline-flex items-center gap-1.5 shrink-0 rounded-full border border-dashed border-border bg-card/40 px-3 py-1.5 text-xs text-muted-foreground hover:bg-card/60 hover:text-foreground transition-colors"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              New album
            </button>
          </div>

          {/* Header toolbar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                {rows === null
                  ? "Loading…"
                  : visibleRows.length === 0
                    ? "No images here"
                    : `${visibleRows.length} image${visibleRows.length === 1 ? "" : "s"}`}
              </p>
              {isCustomAlbum ? (
                <>
                  <button
                    type="button"
                    onClick={renameActiveAlbum}
                    className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    <Pencil className="w-3 h-3" />
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={deleteActiveAlbum}
                    className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete album
                  </button>
                </>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                onClick={() => {
                  if (selecting) exitSelectMode();
                  else setSelecting(true);
                }}
                className="rounded-full"
                size="sm"
                disabled={!rows || rows.length === 0}
              >
                {selecting ? "Cancel" : "Select"}
              </Button>
              <Button onClick={openPicker} disabled={uploading} className="rounded-full">
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Uploading {uploadProgress.done}/{uploadProgress.total}
                  </>
                ) : (
                  <>
                    <ImagePlus className="h-4 w-4 mr-1.5" />
                    Upload images
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Bulk action bar — appears when one or more items selected */}
          {selecting && selectedVisible.length > 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-full bg-foreground text-background px-4 py-2">
              <p className="text-sm">
                <CheckSquare className="inline w-4 h-4 mr-1.5 -mt-0.5" />
                {selectedVisible.length} selected
              </p>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-full bg-background/15 hover:bg-background/25 text-background text-xs px-3 py-1.5"
                    >
                      <MoveRight className="w-3.5 h-3.5" />
                      Move to
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel className="text-xs">Move to</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => bulkMoveToAlbum(null)}>
                      Uncategorized
                    </DropdownMenuItem>
                    {(albums ?? []).length > 0 ? <DropdownMenuSeparator /> : null}
                    {(albums ?? []).map((a) => (
                      <DropdownMenuItem
                        key={a.id}
                        onClick={() => bulkMoveToAlbum(a.id)}
                        disabled={a.id === activeTab}
                      >
                        {a.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <button
                  type="button"
                  onClick={bulkDelete}
                  className="inline-flex items-center gap-1.5 rounded-full bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs px-3 py-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            </div>
          ) : null}

          {rows === null ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-md" />
              ))}
            </div>
          ) : visibleRows.length === 0 ? (
            <button
              type="button"
              onClick={openPicker}
              disabled={uploading}
              className="w-full rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center hover:bg-card/60 transition-colors disabled:opacity-60"
            >
              <ImagePlus className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground">
                Drop images here or tap to upload
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                JPG, PNG, WebP. Up to 20 MB each.
              </p>
            </button>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={visibleRows.map((r) => r.id)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {visibleRows.map((r, i) => (
                    <SortableTile
                      key={r.id}
                      row={r}
                      selecting={selecting}
                      selected={selected.has(r.id)}
                      onToggleSelect={() => toggleSelect(r.id)}
                      onOpenLightbox={() => setLightboxIdx(i)}
                      onDelete={() => removeOne(r.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </main>
      <MobileNav items={vendorNavItems} />

      {lightboxIdx !== null && visibleRows[lightboxIdx] ? (
        <Lightbox
          rows={visibleRows}
          index={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onPrev={() => setLightboxIdx((i) => (i === null ? null : Math.max(0, i - 1)))}
          onNext={() =>
            setLightboxIdx((i) =>
              i === null ? null : Math.min(visibleRows.length - 1, i + 1),
            )
          }
        />
      ) : null}
    </div>
  );
}

function AlbumTab({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count: number | undefined;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-foreground text-background"
          : "bg-white/40 border border-white/55 text-muted-foreground hover:bg-white/70 hover:text-foreground"
      }`}
    >
      {label}
      {count !== undefined && count > 0 ? (
        <span
          className={`tnum text-[10px] ${
            active ? "opacity-70" : "opacity-60"
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function SortableTile({
  row,
  selecting,
  selected,
  onToggleSelect,
  onOpenLightbox,
  onDelete,
}: {
  row: GalleryRow;
  selecting: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onOpenLightbox: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <button
        type="button"
        onClick={selecting ? onToggleSelect : onOpenLightbox}
        // Spread dnd-kit listeners onto the main tile so the whole tile
        // is the drag handle. Pointer-distance constraint above stops a
        // tap from being interpreted as a drag.
        {...attributes}
        {...listeners}
        className="block w-full text-left"
      >
        <div
          className={`aspect-square overflow-hidden rounded-md bg-secondary/40 ${
            selected ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""
          }`}
        >
          <img
            src={row.image_url}
            alt={row.caption ?? "Gallery image"}
            loading="lazy"
            draggable={false}
            className="w-full h-full object-cover transition group-hover:scale-[1.02]"
          />
        </div>
      </button>

      {/* Select-mode checkbox overlay */}
      {selecting ? (
        <button
          type="button"
          onClick={onToggleSelect}
          aria-label={selected ? "Deselect" : "Select"}
          className="absolute top-2 left-2 inline-flex items-center justify-center w-7 h-7 rounded-full bg-background/85 backdrop-blur-sm text-foreground shadow-sm"
        >
          {selected ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Square className="w-3.5 h-3.5 opacity-60" />
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label="Delete image"
          className="absolute top-2 right-2 inline-flex items-center justify-center w-7 h-7 rounded-full bg-black/55 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          <Trash2 className="w-3.5 h-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

function Lightbox({
  rows,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  rows: GalleryRow[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const row = rows[index];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X className="w-5 h-5" />
      </button>
      <img
        src={row.image_url}
        alt={row.caption ?? "Gallery image"}
        className="max-h-[90vh] max-w-[90vw] object-contain rounded-md"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
