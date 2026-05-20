// Vendor gallery — account-level media library.
//
// Round-2 features layered on round 1:
//   • calendar view — third view mode alongside grid + list, groups
//     images by year-month
//   • EXIF capture on upload + sanitized panel in the lightbox
//   • blurhash placeholder while real image streams in
//   • soft-delete trash with 30-day lazy auto-purge
//   • zip download for bulk-selected images
//   • in-app edit (rotate / flip) via the Lightbox's Edit button
//   • public share link via the Lightbox's Share button

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CalendarDays,
  Check,
  CheckSquare,
  Download,
  FolderPlus,
  Grid2x2,
  Grid3x3,
  Image as ImageIcon,
  ImagePlus,
  LayoutGrid,
  List,
  Loader2,
  MoveRight,
  Pencil,
  RotateCcw,
  Search,
  Square,
  Star as StarIcon,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";
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
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BlurhashImage } from "@/components/gallery/BlurhashImage";
import { Lightbox } from "@/components/gallery/Lightbox";
import { vendorNavItems } from "@/data/navItems";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  computeBlurhash,
  parseExif,
  type SanitizedExif,
} from "@/lib/galleryImage";

interface GalleryRow {
  id: string;
  image_url: string;
  caption: string | null;
  album_id: string | null;
  display_order: number;
  created_at: string;
  deleted_at: string | null;
  width: number | null;
  height: number | null;
  exif: SanitizedExif | null;
  blurhash: string | null;
}

interface Album {
  id: string;
  name: string;
  display_order: number;
  cover_image_id: string | null;
}

type SortMode = "newest" | "oldest" | "name_asc" | "name_desc";
type AspectFilter = "all" | "portrait" | "landscape" | "square";
type FormatFilter = "all" | "jpg" | "png" | "webp" | "gif";
type Density = "compact" | "medium" | "large";
type ViewMode = "grid" | "list" | "calendar";

const ALL_TAB = "__all__";
const UNCATEGORIZED_TAB = "__none__";
const SMART_RECENT_7 = "__smart_recent_7__";
const SMART_RECENT_30 = "__smart_recent_30__";
const SMART_PORTRAITS = "__smart_portraits__";
const SMART_LANDSCAPES = "__smart_landscapes__";
const TRASH_TAB = "__trash__";

const PAGE_SIZE = 60;
const TRASH_GRACE_MS = 30 * 86400_000;

function filenameOf(url: string): string {
  const noQuery = url.split("?")[0];
  const slash = noQuery.lastIndexOf("/");
  return slash >= 0 ? noQuery.slice(slash + 1) : noQuery;
}

function extensionOf(url: string): string {
  const name = filenameOf(url);
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function thumbUrl(url: string, width: number): string {
  if (!url.includes("/storage/v1/object/public/")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}width=${width}&quality=75`;
}

export default function VendorGalleryPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<GalleryRow[] | null>(null);
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [activeTab, setActiveTab] = useState<string>(ALL_TAB);

  // Toolbar state
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [aspectFilter, setAspectFilter] = useState<AspectFilter>("all");
  const [formatFilter, setFormatFilter] = useState<FormatFilter>("all");
  const [density, setDensity] = useState<Density>("medium");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Selection + upload
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zipping, setZipping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isTrashView = activeTab === TRASH_TAB;

  // Lazy 30-day auto-purge of soft-deleted rows on first mount.
  // Files clean up automatically via the existing storage cleanup
  // trigger when the row is hard-deleted.
  useEffect(() => {
    if (!user?.id) return;
    const cutoff = new Date(Date.now() - TRASH_GRACE_MS).toISOString();
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("vendor_gallery_images")
        .delete()
        .eq("user_id", user.id)
        .lt("deleted_at", cutoff);
    })();
  }, [user?.id]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [imgRes, albRes] = await Promise.all([
      (supabase as any)
        .from("vendor_gallery_images")
        .select(
          "id, image_url, caption, album_id, display_order, created_at, deleted_at, width, height, exif, blurhash",
        )
        .eq("user_id", user.id)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("vendor_gallery_albums")
        .select("id, name, display_order, cover_image_id")
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

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeTab, query, sortMode, aspectFilter, formatFilter]);

  // Filtering pipeline.
  // Trash tab is mutually exclusive with all other tabs/smart filters
  // — it shows rows where deleted_at IS NOT NULL. Every other tab
  // hides those.
  const filteredRows = useMemo(() => {
    if (!rows) return [];
    let out = rows;

    if (isTrashView) {
      out = out.filter((r) => r.deleted_at !== null);
    } else {
      out = out.filter((r) => r.deleted_at === null);
    }

    const now = Date.now();
    if (activeTab === ALL_TAB || isTrashView) {
      // no extra tab filter
    } else if (activeTab === UNCATEGORIZED_TAB) {
      out = out.filter((r) => r.album_id === null);
    } else if (activeTab === SMART_RECENT_7) {
      out = out.filter(
        (r) => now - new Date(r.created_at).getTime() < 7 * 86400_000,
      );
    } else if (activeTab === SMART_RECENT_30) {
      out = out.filter(
        (r) => now - new Date(r.created_at).getTime() < 30 * 86400_000,
      );
    } else if (activeTab === SMART_PORTRAITS) {
      out = out.filter((r) =>
        r.width && r.height ? r.height / r.width > 1.05 : false,
      );
    } else if (activeTab === SMART_LANDSCAPES) {
      out = out.filter((r) =>
        r.width && r.height ? r.width / r.height > 1.05 : false,
      );
    } else {
      out = out.filter((r) => r.album_id === activeTab);
    }

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter((r) => {
        const caption = (r.caption ?? "").toLowerCase();
        const filename = filenameOf(r.image_url).toLowerCase();
        return caption.includes(q) || filename.includes(q);
      });
    }

    if (aspectFilter !== "all") {
      out = out.filter((r) => {
        if (!r.width || !r.height) return false;
        const ratio = r.width / r.height;
        if (aspectFilter === "portrait") return ratio < 0.95;
        if (aspectFilter === "landscape") return ratio > 1.05;
        if (aspectFilter === "square") return ratio >= 0.95 && ratio <= 1.05;
        return true;
      });
    }

    if (formatFilter !== "all") {
      out = out.filter((r) => {
        const ext = extensionOf(r.image_url);
        if (formatFilter === "jpg") return ext === "jpg" || ext === "jpeg";
        return ext === formatFilter;
      });
    }

    const sorted = [...out];
    if (sortMode === "newest") {
      sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    } else if (sortMode === "oldest") {
      sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
    } else if (sortMode === "name_asc") {
      sorted.sort((a, b) =>
        filenameOf(a.image_url).localeCompare(filenameOf(b.image_url)),
      );
    } else if (sortMode === "name_desc") {
      sorted.sort((a, b) =>
        filenameOf(b.image_url).localeCompare(filenameOf(a.image_url)),
      );
    }

    return sorted;
  }, [rows, activeTab, query, sortMode, aspectFilter, formatFilter, isTrashView]);

  const visibleRows = useMemo(
    () => filteredRows.slice(0, visibleCount),
    [filteredRows, visibleCount],
  );

  const selectedVisible = useMemo(
    () => visibleRows.filter((r) => selected.has(r.id)),
    [visibleRows, selected],
  );

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((c) =>
            c < filteredRows.length ? Math.min(c + PAGE_SIZE, filteredRows.length) : c,
          );
        }
      },
      { rootMargin: "400px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [filteredRows.length]);

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

    const targetAlbumId =
      activeTab !== ALL_TAB &&
      activeTab !== UNCATEGORIZED_TAB &&
      activeTab !== TRASH_TAB &&
      !activeTab.startsWith("__smart")
        ? activeTab
        : null;

    setUploading(true);
    setUploadProgress({ done: 0, total: list.length });
    let failed = 0;
    for (const file of list) {
      // Best-effort metadata extraction — done first so we can store
      // it on the row at insert time. Both are non-blocking; if
      // either fails we still upload the image.
      const [exif, info] = await Promise.all([
        parseExif(file),
        computeBlurhash(file),
      ]);

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
          width: info?.width ?? null,
          height: info?.height ?? null,
          exif: exif ?? null,
          blurhash: info?.blurhash ?? null,
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

  // Soft-delete from anywhere except Trash, hard-delete from Trash.
  async function removeOne(id: string) {
    if (isTrashView) {
      if (!window.confirm("Delete permanently? Can't be undone.")) return;
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
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("vendor_gallery_images")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Moved to Trash. 30 days to restore.");
    }
    load();
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    if (isTrashView) {
      if (!window.confirm(`Delete ${ids.length} permanently? Can't be undone.`)) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("vendor_gallery_images")
        .delete()
        .in("id", ids);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(`${ids.length} permanently deleted.`);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("vendor_gallery_images")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", ids);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(`${ids.length} moved to Trash.`);
    }
    exitSelectMode();
    load();
  }

  async function bulkRestore() {
    if (selected.size === 0 || !isTrashView) return;
    const ids = Array.from(selected);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_gallery_images")
      .update({ deleted_at: null })
      .in("id", ids);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${ids.length} restored.`);
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

  async function bulkDownloadZip() {
    if (selected.size === 0 || zipping) return;
    const ids = Array.from(selected);
    const rowsToZip = (rows ?? []).filter((r) => ids.includes(r.id));
    setZipping(true);
    try {
      const zip = new JSZip();
      const seenNames = new Set<string>();
      for (const r of rowsToZip) {
        const res = await fetch(r.image_url);
        const blob = await res.blob();
        let name = filenameOf(r.image_url);
        // Defensive: dedupe filenames in case the bucket happens to
        // have two files with the same slug (shouldn't, but).
        let suffix = 1;
        const base = name;
        while (seenNames.has(name)) {
          const dot = base.lastIndexOf(".");
          name =
            dot > 0
              ? `${base.slice(0, dot)}-${suffix}${base.slice(dot)}`
              : `${base}-${suffix}`;
          suffix += 1;
        }
        seenNames.add(name);
        zip.file(name, blob);
      }
      const out = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(out);
      a.download = `gallery-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast.success(`Downloaded ${rowsToZip.length} images.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't build zip.";
      toast.error(msg);
    } finally {
      setZipping(false);
    }
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
    if (!isCustomAlbumActive) return;
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
    if (!isCustomAlbumActive) return;
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

  async function setAlbumCover(imageId: string) {
    if (!isCustomAlbumActive) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_gallery_albums")
      .update({ cover_image_id: imageId })
      .eq("id", activeTab);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Cover updated.");
    load();
  }

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

  const isCustomAlbumActive =
    activeTab !== ALL_TAB &&
    activeTab !== UNCATEGORIZED_TAB &&
    activeTab !== TRASH_TAB &&
    !activeTab.startsWith("__smart");

  const reorderEnabled = sortMode === "newest" && !isTrashView;

  const imageById = useMemo(() => {
    const m: Record<string, GalleryRow> = {};
    for (const r of rows ?? []) m[r.id] = r;
    return m;
  }, [rows]);

  const trashCount = useMemo(
    () => (rows ?? []).filter((r) => r.deleted_at !== null).length,
    [rows],
  );

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

        <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-5">
          {/* Album tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <AlbumTab
              label="All"
              active={activeTab === ALL_TAB}
              count={rows?.filter((r) => r.deleted_at === null).length}
              onClick={() => {
                setActiveTab(ALL_TAB);
                exitSelectMode();
              }}
            />
            <AlbumTab
              label="Uncategorized"
              active={activeTab === UNCATEGORIZED_TAB}
              count={
                rows?.filter(
                  (r) => r.album_id === null && r.deleted_at === null,
                ).length
              }
              onClick={() => {
                setActiveTab(UNCATEGORIZED_TAB);
                exitSelectMode();
              }}
            />
            {(albums ?? []).map((a) => {
              const cover =
                a.cover_image_id && imageById[a.cover_image_id]
                  ? imageById[a.cover_image_id]
                  : rows?.find(
                      (r) => r.album_id === a.id && r.deleted_at === null,
                    ) ?? null;
              return (
                <AlbumTab
                  key={a.id}
                  label={a.name}
                  active={activeTab === a.id}
                  count={
                    rows?.filter(
                      (r) => r.album_id === a.id && r.deleted_at === null,
                    ).length
                  }
                  coverUrl={cover ? thumbUrl(cover.image_url, 60) : null}
                  onClick={() => {
                    setActiveTab(a.id);
                    exitSelectMode();
                  }}
                />
              );
            })}
            <button
              type="button"
              onClick={createAlbum}
              className="inline-flex items-center gap-1.5 shrink-0 rounded-full border border-dashed border-border bg-card/40 px-3 py-1.5 text-xs text-muted-foreground hover:bg-card/60 hover:text-foreground transition-colors"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              New album
            </button>
          </div>

          {/* Smart + Trash row */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0 mr-1">
              Smart
            </span>
            <AlbumTab
              label="Last 7 days"
              active={activeTab === SMART_RECENT_7}
              onClick={() => {
                setActiveTab(SMART_RECENT_7);
                exitSelectMode();
              }}
            />
            <AlbumTab
              label="Last 30 days"
              active={activeTab === SMART_RECENT_30}
              onClick={() => {
                setActiveTab(SMART_RECENT_30);
                exitSelectMode();
              }}
            />
            <AlbumTab
              label="Portraits"
              active={activeTab === SMART_PORTRAITS}
              onClick={() => {
                setActiveTab(SMART_PORTRAITS);
                exitSelectMode();
              }}
            />
            <AlbumTab
              label="Landscapes"
              active={activeTab === SMART_LANDSCAPES}
              onClick={() => {
                setActiveTab(SMART_LANDSCAPES);
                exitSelectMode();
              }}
            />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0 mx-1">
              ·
            </span>
            <AlbumTab
              label="Trash"
              active={isTrashView}
              count={trashCount}
              onClick={() => {
                setActiveTab(TRASH_TAB);
                exitSelectMode();
              }}
            />
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search caption or filename"
                className="pl-9 h-9 rounded-full"
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-full">
                  Sort: {sortLabel(sortMode)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(
                  [
                    ["newest", "Newest first"],
                    ["oldest", "Oldest first"],
                    ["name_asc", "Name A→Z"],
                    ["name_desc", "Name Z→A"],
                  ] as const
                ).map(([k, label]) => (
                  <DropdownMenuItem key={k} onClick={() => setSortMode(k)}>
                    {sortMode === k ? (
                      <Check className="w-3.5 h-3.5 mr-2" />
                    ) : (
                      <span className="w-3.5 h-3.5 mr-2 inline-block" />
                    )}
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-full">
                  Shape: {aspectLabel(aspectFilter)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(
                  [
                    ["all", "Any shape"],
                    ["portrait", "Portrait"],
                    ["landscape", "Landscape"],
                    ["square", "Square"],
                  ] as const
                ).map(([k, label]) => (
                  <DropdownMenuItem key={k} onClick={() => setAspectFilter(k)}>
                    {aspectFilter === k ? (
                      <Check className="w-3.5 h-3.5 mr-2" />
                    ) : (
                      <span className="w-3.5 h-3.5 mr-2 inline-block" />
                    )}
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-full">
                  Format: {formatFilter === "all" ? "Any" : formatFilter.toUpperCase()}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(
                  [
                    ["all", "Any format"],
                    ["jpg", "JPG / JPEG"],
                    ["png", "PNG"],
                    ["webp", "WebP"],
                    ["gif", "GIF"],
                  ] as const
                ).map(([k, label]) => (
                  <DropdownMenuItem key={k} onClick={() => setFormatFilter(k)}>
                    {formatFilter === k ? (
                      <Check className="w-3.5 h-3.5 mr-2" />
                    ) : (
                      <span className="w-3.5 h-3.5 mr-2 inline-block" />
                    )}
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {viewMode === "grid" ? (
              <div className="inline-flex rounded-full border border-border overflow-hidden">
                <ViewBtn
                  active={density === "compact"}
                  label="Compact"
                  onClick={() => setDensity("compact")}
                  icon={<Grid3x3 className="w-3.5 h-3.5" />}
                />
                <ViewBtn
                  active={density === "medium"}
                  label="Medium"
                  onClick={() => setDensity("medium")}
                  icon={<Grid2x2 className="w-3.5 h-3.5" />}
                />
                <ViewBtn
                  active={density === "large"}
                  label="Large"
                  onClick={() => setDensity("large")}
                  icon={<LayoutGrid className="w-3.5 h-3.5" />}
                />
              </div>
            ) : null}

            <div className="inline-flex rounded-full border border-border overflow-hidden">
              <ViewBtn
                active={viewMode === "grid"}
                label="Grid view"
                onClick={() => setViewMode("grid")}
                icon={<LayoutGrid className="w-3.5 h-3.5" />}
              />
              <ViewBtn
                active={viewMode === "list"}
                label="List view"
                onClick={() => setViewMode("list")}
                icon={<List className="w-3.5 h-3.5" />}
              />
              <ViewBtn
                active={viewMode === "calendar"}
                label="Calendar view"
                onClick={() => setViewMode("calendar")}
                icon={<CalendarDays className="w-3.5 h-3.5" />}
              />
            </div>

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
            {!isTrashView ? (
              <Button onClick={openPicker} disabled={uploading} className="rounded-full">
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    {uploadProgress.done}/{uploadProgress.total}
                  </>
                ) : (
                  <>
                    <ImagePlus className="h-4 w-4 mr-1.5" />
                    Upload
                  </>
                )}
              </Button>
            ) : null}
          </div>

          {/* Status / album actions row */}
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground">
              {rows === null
                ? "Loading…"
                : filteredRows.length === 0
                  ? isTrashView
                    ? "Trash is empty"
                    : "No matches"
                  : `${filteredRows.length} image${filteredRows.length === 1 ? "" : "s"}${visibleCount < filteredRows.length ? ` · showing ${visibleCount}` : ""}`}
              {isTrashView && filteredRows.length > 0 ? (
                <span className="ml-2 text-xs">
                  · Items auto-delete after 30 days
                </span>
              ) : null}
            </p>
            {isCustomAlbumActive ? (
              <div className="flex items-center gap-2">
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
              </div>
            ) : null}
          </div>

          {/* Bulk action bar */}
          {selecting && selectedVisible.length > 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-full bg-foreground text-background px-4 py-2">
              <p className="text-sm">
                <CheckSquare className="inline w-4 h-4 mr-1.5 -mt-0.5" />
                {selectedVisible.length} selected
              </p>
              <div className="flex items-center gap-2">
                {isTrashView ? (
                  <button
                    type="button"
                    onClick={bulkRestore}
                    className="inline-flex items-center gap-1.5 rounded-full bg-background/15 hover:bg-background/25 text-background text-xs px-3 py-1.5"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    Restore
                  </button>
                ) : (
                  <>
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
                      onClick={bulkDownloadZip}
                      disabled={zipping}
                      className="inline-flex items-center gap-1.5 rounded-full bg-background/15 hover:bg-background/25 text-background text-xs px-3 py-1.5 disabled:opacity-60"
                    >
                      {zipping ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      {zipping ? "Zipping…" : "Download zip"}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={bulkDelete}
                  className="inline-flex items-center gap-1.5 rounded-full bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs px-3 py-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {isTrashView ? "Delete forever" : "Delete"}
                </button>
              </div>
            </div>
          ) : null}

          {/* Body */}
          {rows === null ? (
            <div className={gridCols(density)}>
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-md" />
              ))}
            </div>
          ) : filteredRows.length === 0 ? (
            isTrashView ? (
              <div className="w-full rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
                <Trash2 className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium text-foreground">Trash is empty</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Deleted images appear here for 30 days before they're purged.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={openPicker}
                disabled={uploading}
                className="w-full rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center hover:bg-card/60 transition-colors disabled:opacity-60"
              >
                <ImagePlus className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium text-foreground">
                  {query || aspectFilter !== "all" || formatFilter !== "all"
                    ? "No images match your filters"
                    : "Drop images here or tap to upload"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  JPG, PNG, WebP. Up to 20 MB each.
                </p>
              </button>
            )
          ) : viewMode === "list" ? (
            <ListView
              rows={visibleRows}
              albums={albums ?? []}
              selecting={selecting}
              selected={selected}
              isTrashView={isTrashView}
              onToggleSelect={toggleSelect}
              onOpen={(idx) => setLightboxIdx(idx)}
              onDelete={removeOne}
            />
          ) : viewMode === "calendar" ? (
            <CalendarView
              rows={visibleRows}
              density={density}
              selecting={selecting}
              selected={selected}
              isTrashView={isTrashView}
              onToggleSelect={toggleSelect}
              onOpen={(id) => {
                const idx = visibleRows.findIndex((r) => r.id === id);
                if (idx >= 0) setLightboxIdx(idx);
              }}
              onDelete={removeOne}
            />
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={reorderEnabled ? handleDragEnd : () => {}}
            >
              <SortableContext
                items={visibleRows.map((r) => r.id)}
                strategy={rectSortingStrategy}
              >
                <div className={gridCols(density)}>
                  {visibleRows.map((r, i) => (
                    <SortableTile
                      key={r.id}
                      row={r}
                      density={density}
                      selecting={selecting}
                      selected={selected.has(r.id)}
                      reorderEnabled={reorderEnabled}
                      coverFor={isCustomAlbumActive ? activeTab : null}
                      isAlbumCover={
                        isCustomAlbumActive &&
                        albums?.find((a) => a.id === activeTab)?.cover_image_id === r.id
                      }
                      isTrashView={isTrashView}
                      onToggleSelect={() => toggleSelect(r.id)}
                      onOpenLightbox={() => setLightboxIdx(i)}
                      onDelete={() => removeOne(r.id)}
                      onSetCover={() => setAlbumCover(r.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />
        </div>
      </main>
      <MobileNav items={vendorNavItems} />

      {lightboxIdx !== null && visibleRows[lightboxIdx] ? (
        <Lightbox
          rows={visibleRows.map((r) => ({
            id: r.id,
            image_url: r.image_url,
            caption: r.caption,
            exif: r.exif,
            width: r.width,
            height: r.height,
            created_at: r.created_at,
          }))}
          index={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onPrev={() => setLightboxIdx((i) => (i === null ? null : Math.max(0, i - 1)))}
          onNext={() =>
            setLightboxIdx((i) =>
              i === null ? null : Math.min(visibleRows.length - 1, i + 1),
            )
          }
          onChange={() => load()}
        />
      ) : null}
    </div>
  );
}

function sortLabel(m: SortMode): string {
  return m === "newest"
    ? "Newest"
    : m === "oldest"
      ? "Oldest"
      : m === "name_asc"
        ? "A→Z"
        : "Z→A";
}

function aspectLabel(a: AspectFilter): string {
  return a === "all"
    ? "Any"
    : a === "portrait"
      ? "Portrait"
      : a === "landscape"
        ? "Landscape"
        : "Square";
}

function gridCols(d: Density): string {
  if (d === "compact")
    return "grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-2";
  if (d === "large")
    return "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4";
  return "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3";
}

function AlbumTab({
  label,
  active,
  count,
  coverUrl,
  onClick,
}: {
  label: string;
  active: boolean;
  count?: number;
  coverUrl?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1.5 rounded-full pl-1 pr-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-foreground text-background"
          : "bg-white/40 border border-white/55 text-muted-foreground hover:bg-white/70 hover:text-foreground"
      }`}
    >
      {coverUrl ? (
        <img
          src={coverUrl}
          alt=""
          className="w-6 h-6 rounded-full object-cover shrink-0"
        />
      ) : (
        <span
          className={`w-6 h-6 rounded-full inline-flex items-center justify-center shrink-0 ${
            active ? "bg-background/20" : "bg-foreground/10"
          }`}
          aria-hidden
        >
          <ImageIcon className="w-3 h-3" />
        </span>
      )}
      {label}
      {count !== undefined && count > 0 ? (
        <span className={`tnum text-[10px] ${active ? "opacity-70" : "opacity-60"}`}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

function ViewBtn({
  active,
  label,
  onClick,
  icon,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`px-2.5 h-9 inline-flex items-center justify-center transition-colors ${
        active
          ? "bg-foreground text-background"
          : "bg-card text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
    </button>
  );
}

function SortableTile({
  row,
  density,
  selecting,
  selected,
  reorderEnabled,
  coverFor,
  isAlbumCover,
  isTrashView,
  onToggleSelect,
  onOpenLightbox,
  onDelete,
  onSetCover,
}: {
  row: GalleryRow;
  density: Density;
  selecting: boolean;
  selected: boolean;
  reorderEnabled: boolean;
  coverFor: string | null;
  isAlbumCover: boolean;
  isTrashView: boolean;
  onToggleSelect: () => void;
  onOpenLightbox: () => void;
  onDelete: () => void;
  onSetCover: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id, disabled: !reorderEnabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const thumbWidth = density === "compact" ? 240 : density === "large" ? 800 : 400;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group"
      onContextMenu={(e) => {
        if (coverFor) {
          e.preventDefault();
          onSetCover();
        }
      }}
    >
      <button
        type="button"
        onClick={selecting ? onToggleSelect : onOpenLightbox}
        {...(reorderEnabled ? attributes : {})}
        {...(reorderEnabled ? listeners : {})}
        className="block w-full text-left"
      >
        <BlurhashImage
          src={thumbUrl(row.image_url, thumbWidth)}
          blurhash={row.blurhash}
          alt={row.caption ?? "Gallery image"}
          draggable={false}
          className={`aspect-square rounded-md bg-secondary/40 ${
            selected
              ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
              : ""
          }`}
        />
      </button>

      {isAlbumCover ? (
        <span
          aria-label="Album cover"
          title="Album cover"
          className="absolute bottom-2 left-2 inline-flex items-center justify-center w-7 h-7 rounded-full bg-foreground text-background"
        >
          <StarIcon className="w-3.5 h-3.5 fill-current" aria-hidden />
        </span>
      ) : null}

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
          aria-label={isTrashView ? "Delete permanently" : "Move to trash"}
          className="absolute top-2 right-2 inline-flex items-center justify-center w-7 h-7 rounded-full bg-black/55 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          <Trash2 className="w-3.5 h-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

function ListView({
  rows,
  albums,
  selecting,
  selected,
  isTrashView,
  onToggleSelect,
  onOpen,
  onDelete,
}: {
  rows: GalleryRow[];
  albums: Album[];
  selecting: boolean;
  selected: Set<string>;
  isTrashView: boolean;
  onToggleSelect: (id: string) => void;
  onOpen: (idx: number) => void;
  onDelete: (id: string) => void;
}) {
  const albumById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of albums) m[a.id] = a.name;
    return m;
  }, [albums]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="grid grid-cols-[40px_64px_1fr_120px_120px_100px_40px] items-center gap-3 px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground bg-secondary/40">
        <span></span>
        <span></span>
        <span>Filename</span>
        <span className="hidden md:inline">Album</span>
        <span>Uploaded</span>
        <span className="hidden md:inline">Size</span>
        <span></span>
      </div>
      <div className="divide-y divide-border">
        {rows.map((r, i) => {
          const ext = extensionOf(r.image_url).toUpperCase();
          return (
            <div
              key={r.id}
              className="grid grid-cols-[40px_64px_1fr_120px_120px_100px_40px] items-center gap-3 px-3 py-2 hover:bg-secondary/30"
            >
              <button
                type="button"
                onClick={() => onToggleSelect(r.id)}
                aria-label={selected.has(r.id) ? "Deselect" : "Select"}
                className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-border"
              >
                {selected.has(r.id) ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Square className="w-3.5 h-3.5 opacity-50" />
                )}
              </button>
              <button
                type="button"
                onClick={() => onOpen(i)}
                className="block w-14 h-14 rounded-md overflow-hidden bg-secondary/40"
              >
                <BlurhashImage
                  src={thumbUrl(r.image_url, 120)}
                  blurhash={r.blurhash}
                  alt={r.caption ?? "Gallery image"}
                  draggable={false}
                  className="w-full h-full"
                />
              </button>
              <button
                type="button"
                onClick={() => (selecting ? onToggleSelect(r.id) : onOpen(i))}
                className="text-left min-w-0"
              >
                <p className="text-sm font-medium text-foreground truncate">
                  {filenameOf(r.image_url)}
                </p>
                {r.caption ? (
                  <p className="text-xs text-muted-foreground truncate">
                    {r.caption}
                  </p>
                ) : null}
              </button>
              <span className="text-xs text-muted-foreground truncate hidden md:inline">
                {r.album_id ? albumById[r.album_id] ?? "—" : "Uncategorized"}
              </span>
              <span className="text-xs text-muted-foreground tnum">
                {new Date(r.created_at).toLocaleDateString()}
              </span>
              <span className="text-xs text-muted-foreground hidden md:inline">
                {ext}
                {r.width && r.height ? ` · ${r.width}×${r.height}` : ""}
              </span>
              <button
                type="button"
                onClick={() => onDelete(r.id)}
                aria-label={isTrashView ? "Delete permanently" : "Move to trash"}
                className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-destructive"
              >
                {isTrashView ? (
                  <Trash2 className="w-3.5 h-3.5" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarView({
  rows,
  density,
  selecting,
  selected,
  isTrashView,
  onToggleSelect,
  onOpen,
  onDelete,
}: {
  rows: GalleryRow[];
  density: Density;
  selecting: boolean;
  selected: Set<string>;
  isTrashView: boolean;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const groups = useMemo(() => {
    const m = new Map<string, GalleryRow[]>();
    for (const r of rows) {
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const list = m.get(key) ?? [];
      list.push(r);
      m.set(key, list);
    }
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  return (
    <div className="space-y-6">
      {groups.map(([key, items]) => {
        const [year, month] = key.split("-");
        const label = new Date(Number(year), Number(month) - 1).toLocaleDateString(
          undefined,
          { month: "long", year: "numeric" },
        );
        return (
          <div key={key}>
            <h3 className="font-editorial text-xl mb-3 sticky top-0 bg-background/80 backdrop-blur-sm py-1 z-10">
              {label}{" "}
              <span className="text-xs font-sans text-muted-foreground tnum">
                · {items.length}
              </span>
            </h3>
            <div className={gridCols(density)}>
              {items.map((r) => {
                const thumbW =
                  density === "compact" ? 240 : density === "large" ? 800 : 400;
                return (
                  <div key={r.id} className="relative group">
                    <button
                      type="button"
                      onClick={() => (selecting ? onToggleSelect(r.id) : onOpen(r.id))}
                      className="block w-full text-left"
                    >
                      <BlurhashImage
                        src={thumbUrl(r.image_url, thumbW)}
                        blurhash={r.blurhash}
                        alt={r.caption ?? "Gallery image"}
                        className={`aspect-square rounded-md bg-secondary/40 ${
                          selected.has(r.id)
                            ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                            : ""
                        }`}
                      />
                    </button>
                    {selecting ? (
                      <button
                        type="button"
                        onClick={() => onToggleSelect(r.id)}
                        aria-label={selected.has(r.id) ? "Deselect" : "Select"}
                        className="absolute top-2 left-2 inline-flex items-center justify-center w-7 h-7 rounded-full bg-background/85 backdrop-blur-sm text-foreground shadow-sm"
                      >
                        {selected.has(r.id) ? (
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
                          onDelete(r.id);
                        }}
                        aria-label={isTrashView ? "Delete permanently" : "Move to trash"}
                        className="absolute top-2 right-2 inline-flex items-center justify-center w-7 h-7 rounded-full bg-black/55 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      >
                        {isTrashView ? (
                          <RotateCcw className="w-3.5 h-3.5" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
