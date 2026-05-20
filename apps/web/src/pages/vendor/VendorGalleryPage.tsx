// Vendor gallery — account-level media library.
//
// Round-1 features layered on top of the v1 grid:
//   • search by caption + filename
//   • sort: newest / oldest / name A→Z / name Z→A
//   • aspect ratio filter (portrait / landscape / square)
//   • file format filter (jpg / png / webp / gif)
//   • grid density toggle (compact / medium / large)
//   • list view alternative
//   • smart albums (Last 7d / Last 30d / Portraits / Landscapes)
//   • auto-generated thumbnails via Supabase image transforms
//   • infinite scroll (60 at a time via IntersectionObserver)
//   • cover image per album — right-click any tile to set it
//
// Per-image natural dimensions are captured client-side via the
// <img> onLoad callback and cached in a map so subsequent filter
// passes don't need to re-measure.

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
  Grid2x2,
  Grid3x3,
  Image as ImageIcon,
  ImagePlus,
  LayoutGrid,
  List,
  Loader2,
  MoveRight,
  Pencil,
  Search,
  Square,
  Star as StarIcon,
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
import { Input } from "@/components/ui/input";
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
  cover_image_id: string | null;
}

interface Dim {
  width: number;
  height: number;
}

type SortMode = "newest" | "oldest" | "name_asc" | "name_desc";
type AspectFilter = "all" | "portrait" | "landscape" | "square";
type FormatFilter = "all" | "jpg" | "png" | "webp" | "gif";
type Density = "compact" | "medium" | "large";
type ViewMode = "grid" | "list";

const ALL_TAB = "__all__";
const UNCATEGORIZED_TAB = "__none__";
const SMART_RECENT_7 = "__smart_recent_7__";
const SMART_RECENT_30 = "__smart_recent_30__";
const SMART_PORTRAITS = "__smart_portraits__";
const SMART_LANDSCAPES = "__smart_landscapes__";

const PAGE_SIZE = 60;

// Returns the filename portion of a Supabase public URL — the bit
// after the final `/`, ignoring the optional `?transform=...` query
// suffix. Used for sort-by-name + search.
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

// Build a thumbnail URL using Supabase Storage image transforms. The
// `width` param resizes the served image while preserving the URL
// path so RLS + cleanup triggers still work the same way. Falls back
// to the original URL on non-Supabase URLs.
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

  // Per-image natural dimensions, populated as <img> elements load.
  // Stored in a ref + state so filter passes are sync but updates
  // batch into a single re-render via the setState below.
  const dimsRef = useRef<Record<string, Dim>>({});
  const [dimsTick, setDimsTick] = useState(0);
  function recordDim(id: string, d: Dim) {
    if (dimsRef.current[id]) return;
    dimsRef.current[id] = d;
    setDimsTick((t) => t + 1);
  }

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

  // Reset visible window when filters change.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeTab, query, sortMode, aspectFilter, formatFilter]);

  // The filtering pipeline. Order matters:
  //   1. Tab (album / virtual album)
  //   2. Search (caption + filename)
  //   3. Aspect ratio (uses dimsRef; images with unknown dims pass through)
  //   4. File format (extension match)
  //   5. Sort
  // The visible slice for infinite scroll is taken AFTER filtering so
  // the rendered grid is page-sized within the filtered set.
  const filteredRows = useMemo(() => {
    if (!rows) return [];

    let out = rows;

    // Tab filter
    const now = Date.now();
    if (activeTab === ALL_TAB) {
      // no-op
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
      out = out.filter((r) => {
        const d = dimsRef.current[r.id];
        return d ? d.height / d.width > 1.05 : false;
      });
    } else if (activeTab === SMART_LANDSCAPES) {
      out = out.filter((r) => {
        const d = dimsRef.current[r.id];
        return d ? d.width / d.height > 1.05 : false;
      });
    } else {
      out = out.filter((r) => r.album_id === activeTab);
    }

    // Search
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter((r) => {
        const caption = (r.caption ?? "").toLowerCase();
        const filename = filenameOf(r.image_url).toLowerCase();
        return caption.includes(q) || filename.includes(q);
      });
    }

    // Aspect ratio
    if (aspectFilter !== "all") {
      out = out.filter((r) => {
        const d = dimsRef.current[r.id];
        if (!d) return false; // Unknown dims excluded until they load
        const ratio = d.width / d.height;
        if (aspectFilter === "portrait") return ratio < 0.95;
        if (aspectFilter === "landscape") return ratio > 1.05;
        if (aspectFilter === "square") return ratio >= 0.95 && ratio <= 1.05;
        return true;
      });
    }

    // File format
    if (formatFilter !== "all") {
      out = out.filter((r) => {
        const ext = extensionOf(r.image_url);
        if (formatFilter === "jpg") return ext === "jpg" || ext === "jpeg";
        return ext === formatFilter;
      });
    }

    // Sort
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
    // dimsTick reruns this when natural dims load in
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, activeTab, query, sortMode, aspectFilter, formatFilter, dimsTick]);

  const visibleRows = useMemo(
    () => filteredRows.slice(0, visibleCount),
    [filteredRows, visibleCount],
  );

  const selectedVisible = useMemo(
    () => visibleRows.filter((r) => selected.has(r.id)),
    [visibleRows, selected],
  );

  // IntersectionObserver-driven infinite scroll. Sentinel is a 1px
  // div at the bottom of the rendered grid; when it crosses into the
  // viewport, bump visibleCount by PAGE_SIZE.
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
      !activeTab.startsWith("__smart")
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

  // Set the active-album's cover to a specific image. Right-click on
  // a tile dispatches this when the active tab is a custom album.
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

  // Drag-to-reorder. Works within the current FILTERED set, not the
  // full library — so reordering inside "Last 7 days" only rewrites
  // those rows' display_order. Disabled when sort isn't "newest"
  // (manual order is implied by display_order, which is what newest
  // breaks ties on).
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
    !activeTab.startsWith("__smart");

  // Drag-to-reorder only makes sense in newest-sort mode (display_order
  // is the tiebreaker there). In other sort modes, reorder doesn't
  // produce visibly stable output, so we disable it.
  const reorderEnabled = sortMode === "newest";

  // Build a lookup of imageId → image_url for cover thumbnails on
  // album tabs.
  const imageById = useMemo(() => {
    const m: Record<string, GalleryRow> = {};
    for (const r of rows ?? []) m[r.id] = r;
    return m;
  }, [rows]);

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
          {/* Album tabs — custom albums + virtual all/uncategorized/smart */}
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
            {(albums ?? []).map((a) => {
              const cover =
                a.cover_image_id && imageById[a.cover_image_id]
                  ? imageById[a.cover_image_id]
                  : rows?.find((r) => r.album_id === a.id) ?? null;
              return (
                <AlbumTab
                  key={a.id}
                  label={a.name}
                  active={activeTab === a.id}
                  count={rows?.filter((r) => r.album_id === a.id).length}
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

          {/* Smart albums — separated visually from user albums */}
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
          </div>

          {/* Toolbar: search + sort + filters + density + view + upload */}
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

            {/* Density (only relevant in grid view) */}
            {viewMode === "grid" ? (
              <div className="inline-flex rounded-full border border-border overflow-hidden">
                <DensityBtn
                  active={density === "compact"}
                  label="Compact"
                  onClick={() => setDensity("compact")}
                  icon={<Grid3x3 className="w-3.5 h-3.5" />}
                />
                <DensityBtn
                  active={density === "medium"}
                  label="Medium"
                  onClick={() => setDensity("medium")}
                  icon={<Grid2x2 className="w-3.5 h-3.5" />}
                />
                <DensityBtn
                  active={density === "large"}
                  label="Large"
                  onClick={() => setDensity("large")}
                  icon={<LayoutGrid className="w-3.5 h-3.5" />}
                />
              </div>
            ) : null}

            {/* Grid / list toggle */}
            <div className="inline-flex rounded-full border border-border overflow-hidden">
              <DensityBtn
                active={viewMode === "grid"}
                label="Grid view"
                onClick={() => setViewMode("grid")}
                icon={<LayoutGrid className="w-3.5 h-3.5" />}
              />
              <DensityBtn
                active={viewMode === "list"}
                label="List view"
                onClick={() => setViewMode("list")}
                icon={<List className="w-3.5 h-3.5" />}
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
          </div>

          {/* Status / album actions row */}
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground">
              {rows === null
                ? "Loading…"
                : filteredRows.length === 0
                  ? "No matches"
                  : `${filteredRows.length} image${filteredRows.length === 1 ? "" : "s"}${visibleCount < filteredRows.length ? ` · showing ${visibleCount}` : ""}`}
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

          {/* Body */}
          {rows === null ? (
            <div className={gridCols(density)}>
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-md" />
              ))}
            </div>
          ) : filteredRows.length === 0 ? (
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
          ) : viewMode === "list" ? (
            <ListView
              rows={visibleRows}
              dims={dimsRef.current}
              albums={albums ?? []}
              selecting={selecting}
              selected={selected}
              onToggleSelect={toggleSelect}
              onOpen={(idx) => setLightboxIdx(idx)}
              onDelete={removeOne}
              onLoadDim={recordDim}
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
                      onToggleSelect={() => toggleSelect(r.id)}
                      onOpenLightbox={() => setLightboxIdx(i)}
                      onDelete={() => removeOne(r.id)}
                      onSetCover={() => setAlbumCover(r.id)}
                      onLoadDim={(d) => recordDim(r.id, d)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {/* Infinite-scroll sentinel */}
          <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />
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

function DensityBtn({
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
  onToggleSelect,
  onOpenLightbox,
  onDelete,
  onSetCover,
  onLoadDim,
}: {
  row: GalleryRow;
  density: Density;
  selecting: boolean;
  selected: boolean;
  reorderEnabled: boolean;
  coverFor: string | null;
  isAlbumCover: boolean;
  onToggleSelect: () => void;
  onOpenLightbox: () => void;
  onDelete: () => void;
  onSetCover: () => void;
  onLoadDim: (d: Dim) => void;
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
  // Thumb width matches density bucket — minimizes wasted bandwidth.
  const thumbWidth = density === "compact" ? 240 : density === "large" ? 800 : 400;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group"
      onContextMenu={(e) => {
        // Right-click on a tile in a custom album → set as cover.
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
        <div
          className={`aspect-square overflow-hidden rounded-md bg-secondary/40 ${
            selected
              ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
              : ""
          }`}
        >
          <img
            src={thumbUrl(row.image_url, thumbWidth)}
            alt={row.caption ?? "Gallery image"}
            loading="lazy"
            draggable={false}
            onLoad={(e) => {
              const el = e.currentTarget;
              if (el.naturalWidth && el.naturalHeight) {
                onLoadDim({ width: el.naturalWidth, height: el.naturalHeight });
              }
            }}
            className="w-full h-full object-cover transition group-hover:scale-[1.02]"
          />
        </div>
      </button>

      {/* Cover star — shown when this tile is the album's cover */}
      {isAlbumCover ? (
        <span
          aria-label="Album cover"
          title="Album cover"
          className="absolute bottom-2 left-2 inline-flex items-center justify-center w-7 h-7 rounded-full bg-foreground text-background"
        >
          <StarIcon className="w-3.5 h-3.5 fill-current" aria-hidden />
        </span>
      ) : null}

      {/* Select overlay */}
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

function ListView({
  rows,
  dims,
  albums,
  selecting,
  selected,
  onToggleSelect,
  onOpen,
  onDelete,
  onLoadDim,
}: {
  rows: GalleryRow[];
  dims: Record<string, Dim>;
  albums: Album[];
  selecting: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpen: (idx: number) => void;
  onDelete: (id: string) => void;
  onLoadDim: (id: string, d: Dim) => void;
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
          const d = dims[r.id];
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
                <img
                  src={thumbUrl(r.image_url, 120)}
                  alt={r.caption ?? "Gallery image"}
                  loading="lazy"
                  draggable={false}
                  onLoad={(e) => {
                    const el = e.currentTarget;
                    if (el.naturalWidth && el.naturalHeight) {
                      onLoadDim(r.id, {
                        width: el.naturalWidth,
                        height: el.naturalHeight,
                      });
                    }
                  }}
                  className="w-full h-full object-cover"
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
                {d ? ` · ${d.width}×${d.height}` : ""}
              </span>
              <button
                type="button"
                onClick={() => onDelete(r.id)}
                aria-label="Delete"
                className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
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
