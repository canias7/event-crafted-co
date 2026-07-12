// Gallery tab — account-level MEDIA LIBRARY, mirroring the web vendor
// Gallery (apps/web/.../VendorGalleryPage). "Upload once, reuse across
// listings": photos live on the ACCOUNT (vendor_gallery_images, keyed by
// user_id) — NOT bolted to a single listing. The per-listing photos are
// a different table (vendor_portfolio_images) managed in the listing
// builder; this tab is the shared library the web app also reads/writes.
//
// Shared backend with web:
//   table  vendor_gallery_images  (user_id, image_url, caption, album_id,
//          display_order, created_at, deleted_at, width, height,
//          file_size_bytes, exif, blurhash)
//   table  vendor_gallery_albums  (user_id, name, display_order, cover_image_id)
//   bucket vendor-gallery         path {user_id}/{file}
//
// v1 parity: All/Uncategorized/Trash + custom albums, smart collections
// (Last 7/30 days, Portraits, Landscapes, Large), search, sort, grid
// (two densities) + list views, upload (cap-checked, dimensions captured),
// bulk select → move/delete, lightbox (caption, set cover, delete/restore),
// soft-delete trash. Deferred to a round 2 (matches how web shipped it):
// EXIF/blurhash capture, in-app rotate/flip/crop, zip, share links,
// calendar view, drag-reorder — all written null-safe so web round-2 data
// still renders here.

import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { compressForUpload } from "@/lib/imageManipulation";

const WHITE = "#ffffff";
const SURFACE = "#f3f4f6";
const INK = "#14161a";
const INK_DIM = "#5e636e";
const ACCENT = "#1b3654";
const BORDER = "#e5e7eb";
const ERROR = "#dc2828";
const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB, matches web
const UPLOAD_CONCURRENCY = 4;
const BUCKET = "vendor-gallery";

// Human label for the plan storage caps (Free 100 MB / Pro 1 GB /
// Premium 5 GB) — matches web's formatBytes.
function formatBytesLabel(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1).replace(/\.0$/, "")} GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

// Album scope tokens (UI-only states, like web). Real albums are UUIDs.
const ALL = "__all__";
const NONE = "__none__";
const TRASH = "__trash__";

type SmartFilter =
  | null
  | "recent7"
  | "recent30"
  | "portraits"
  | "landscapes"
  | "large";

type SortMode = "newest" | "oldest" | "name_asc" | "name_desc";

interface GalleryImage {
  id: string;
  image_url: string;
  caption: string | null;
  album_id: string | null;
  display_order: number;
  created_at: string;
  deleted_at: string | null;
  width: number | null;
  height: number | null;
  file_size_bytes: number | null;
}

interface Album {
  id: string;
  name: string;
  display_order: number;
  cover_image_id: string | null;
}

// vendor-gallery public URL → storage path ({user_id}/{file}) for deletes.
function storagePathFromUrl(url: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length);
}

function fileNameFromUrl(url: string): string {
  try {
    return decodeURIComponent(url.split("/").pop()?.split("?")[0] ?? "");
  } catch {
    return "";
  }
}

function extFromUrl(url: string): string {
  return (fileNameFromUrl(url).split(".").pop() ?? "").toLowerCase();
}

export default function GalleryScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [images, setImages] = useState<GalleryImage[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  const [activeAlbum, setActiveAlbum] = useState<string>(ALL);
  const [smart, setSmart] = useState<SmartFilter>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("newest");
  const [dense, setDense] = useState(false); // grid density toggle
  const [listView, setListView] = useState(false);

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [lightbox, setLightbox] = useState<GalleryImage | null>(null);
  const [captionDraft, setCaptionDraft] = useState("");
  const [editingCaption, setEditingCaption] = useState(false);
  const [newAlbumOpen, setNewAlbumOpen] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [moveOpen, setMoveOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [{ data: imgs }, { data: albs }] = await Promise.all([
      supabase
        .from("vendor_gallery_images")
        .select(
          "id, image_url, caption, album_id, display_order, created_at, deleted_at, width, height, file_size_bytes",
        )
        .eq("user_id", user.id)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false }),
      supabase
        .from("vendor_gallery_albums")
        .select("id, name, display_order, cover_image_id")
        .eq("user_id", user.id)
        .order("display_order", { ascending: true }),
    ]);
    setImages((imgs ?? []) as GalleryImage[]);
    setAlbums((albs ?? []) as Album[]);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        await load();
        if (alive) setLoading(false);
      })();
      return () => {
        alive = false;
      };
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // ---- derived: the visible set after album + smart + search + sort ----
  const visible = useMemo(() => {
    const now = Date.now();
    let rows = images;

    if (activeAlbum === TRASH) {
      rows = rows.filter((r) => r.deleted_at);
    } else {
      rows = rows.filter((r) => !r.deleted_at);
      if (activeAlbum === NONE) rows = rows.filter((r) => !r.album_id);
      else if (activeAlbum !== ALL) rows = rows.filter((r) => r.album_id === activeAlbum);
    }

    if (smart) {
      rows = rows.filter((r) => {
        const ageMs = now - new Date(r.created_at).getTime();
        const w = r.width ?? 0;
        const h = r.height ?? 0;
        switch (smart) {
          case "recent7":
            return ageMs < 7 * 86400000;
          case "recent30":
            return ageMs < 30 * 86400000;
          case "portraits":
            return w > 0 && h > 0 && h / w > 1.05;
          case "landscapes":
            return w > 0 && h > 0 && w / h > 1.05;
          case "large":
            return (r.file_size_bytes ?? 0) > 5 * 1024 * 1024;
          default:
            return true;
        }
      });
    }

    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          (r.caption ?? "").toLowerCase().includes(q) ||
          fileNameFromUrl(r.image_url).toLowerCase().includes(q),
      );
    }

    const sorted = [...rows];
    sorted.sort((a, b) => {
      switch (sort) {
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "name_asc":
          return fileNameFromUrl(a.image_url).localeCompare(fileNameFromUrl(b.image_url));
        case "name_desc":
          return fileNameFromUrl(b.image_url).localeCompare(fileNameFromUrl(a.image_url));
        case "newest":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    return sorted;
  }, [images, activeAlbum, smart, search, sort]);

  const activeCount = useMemo(() => images.filter((r) => !r.deleted_at).length, [images]);
  const trashCount = useMemo(() => images.filter((r) => r.deleted_at).length, [images]);

  // ---- upload ----
  async function uploadImages() {
    if (!user?.id || uploading) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Library access needed", "Enable photo access in Settings to upload.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsMultipleSelection: true,
    });
    if (result.canceled || result.assets.length === 0) return;

    // STORAGE cap check (best-effort — the vendor-gallery storage RLS
    // policy is the real gate). Caps are bytes now, not image counts:
    // Free 100 MB / Pro 1 GB / Premium 5 GB, cap_bytes = null → uncapped.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: statusRows } = await (supabase as any).rpc(
        "gallery_storage_status",
        { p_user_id: user.id },
      );
      const status = Array.isArray(statusRows) ? statusRows[0] : statusRows;
      const capBytes =
        status && status.cap_bytes !== null ? Number(status.cap_bytes) : null;
      const usedBytes = status ? Number(status.used_bytes ?? 0) : 0;
      if (capBytes !== null && usedBytes >= capBytes) {
        Alert.alert(
          "Gallery storage full",
          `Your plan includes ${formatBytesLabel(capBytes)} of gallery storage and you've used ${formatBytesLabel(usedBytes)}. Delete some images (and empty Trash) or upgrade your plan to add more.`,
          [
            { text: "Not now", style: "cancel" },
            {
              text: "Upgrade plan",
              onPress: () => router.push("/(vendor)/subscription" as never),
            },
          ],
        );
        return;
      }
    } catch {
      /* ignore — proceed, RLS enforces */
    }

    const assets = result.assets;
    setUploading(true);
    setUploadProgress({ done: 0, total: assets.length });

    const baseOrder =
      images.length === 0 ? 0 : Math.max(...images.map((p) => p.display_order)) + 1;
    const rows: Array<Record<string, unknown> | null> = new Array(assets.length).fill(null);
    let cursor = 0;
    let done = 0;
    let firstError: { message?: string } | null = null;

    async function worker() {
      while (true) {
        const i = cursor++;
        if (i >= assets.length) return;
        const a = assets[i];
        try {
          const { uri, mime } = await compressForUpload(a);
          const bytes = new Uint8Array(await (await fetch(uri)).arrayBuffer());
          if (bytes.byteLength === 0) throw new Error("Empty file");
          if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("Over 20 MB");
          const path = `${user!.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
          const up = await supabase.storage
            .from(BUCKET)
            .upload(path, bytes, { contentType: mime, upsert: false });
          if (up.error) throw up.error;
          const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
          rows[i] = {
            user_id: user!.id,
            image_url: publicUrl,
            album_id: activeAlbum !== ALL && activeAlbum !== NONE && activeAlbum !== TRASH
              ? activeAlbum
              : null,
            display_order: baseOrder + i,
            width: a.width ?? null,
            height: a.height ?? null,
            file_size_bytes: bytes.byteLength,
          };
        } catch (err) {
          if (!firstError) firstError = (err as { message?: string }) ?? { message: "failed" };
        } finally {
          done++;
          setUploadProgress({ done, total: assets.length });
        }
      }
    }

    try {
      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_CONCURRENCY, assets.length) }, () => worker()),
      );
      const ok = rows.filter((r): r is Record<string, unknown> => r !== null);
      if (ok.length === 0) throw firstError ?? new Error("Upload failed");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("vendor_gallery_images").insert(ok);
      if (error) throw error;
      await load();
      if (ok.length < assets.length) {
        Alert.alert("Partial upload", `${ok.length} of ${assets.length} uploaded.`);
      }
    } catch (err) {
      Alert.alert("Couldn't upload", (err as { message?: string })?.message ?? "Try again.");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  // ---- mutations ----
  async function softDelete(ids: string[]) {
    if (ids.length === 0) return;
    const ts = new Date().toISOString();
    setImages((cur) => cur.map((r) => (ids.includes(r.id) ? { ...r, deleted_at: ts } : r)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("vendor_gallery_images")
      .update({ deleted_at: ts })
      .in("id", ids);
  }

  async function restore(ids: string[]) {
    setImages((cur) => cur.map((r) => (ids.includes(r.id) ? { ...r, deleted_at: null } : r)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("vendor_gallery_images")
      .update({ deleted_at: null })
      .in("id", ids);
  }

  async function purge(rows: GalleryImage[]) {
    const ids = rows.map((r) => r.id);
    setImages((cur) => cur.filter((r) => !ids.includes(r.id)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("vendor_gallery_images").delete().in("id", ids);
    const paths = rows.map((r) => storagePathFromUrl(r.image_url)).filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  }

  async function moveToAlbum(ids: string[], albumId: string | null) {
    setImages((cur) =>
      cur.map((r) => (ids.includes(r.id) ? { ...r, album_id: albumId } : r)),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("vendor_gallery_images")
      .update({ album_id: albumId })
      .in("id", ids);
  }

  async function createAlbum() {
    const name = newAlbumName.trim();
    if (!name || !user?.id) return;
    setNewAlbumOpen(false);
    setNewAlbumName("");
    const order = albums.length === 0 ? 0 : Math.max(...albums.map((a) => a.display_order)) + 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("vendor_gallery_albums")
      .insert({ user_id: user.id, name, display_order: order })
      .select("id, name, display_order, cover_image_id")
      .single();
    if (error) {
      Alert.alert("Couldn't create album", error.message);
      return;
    }
    setAlbums((cur) => [...cur, data as Album]);
    setActiveAlbum((data as Album).id);
  }

  async function saveCaption(img: GalleryImage) {
    const text = captionDraft.trim();
    setEditingCaption(false);
    setImages((cur) => cur.map((r) => (r.id === img.id ? { ...r, caption: text || null } : r)));
    setLightbox((lb) => (lb && lb.id === img.id ? { ...lb, caption: text || null } : lb));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("vendor_gallery_images")
      .update({ caption: text || null })
      .eq("id", img.id);
  }

  async function setAlbumCover(albumId: string, imageId: string) {
    setAlbums((cur) =>
      cur.map((a) => (a.id === albumId ? { ...a, cover_image_id: imageId } : a)),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("vendor_gallery_albums")
      .update({ cover_image_id: imageId })
      .eq("id", albumId);
    Alert.alert("Cover set", "This photo is now the album cover.");
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  function confirmBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const inTrash = activeAlbum === TRASH;
    Alert.alert(
      inTrash ? "Delete forever?" : "Move to trash?",
      inTrash
        ? `${ids.length} photo${ids.length === 1 ? "" : "s"} will be permanently deleted.`
        : `${ids.length} photo${ids.length === 1 ? "" : "s"} move to trash (restore within 30 days).`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: inTrash ? "Delete" : "Move to trash",
          style: "destructive",
          onPress: async () => {
            if (inTrash) await purge(images.filter((r) => ids.includes(r.id)));
            else await softDelete(ids);
            exitSelect();
          },
        },
      ],
    );
  }

  // ---- layout sizing ----
  const cols = listView ? 1 : dense ? 4 : 3;
  const W = Dimensions.get("window").width;
  const tile = Math.floor((W - 40 - (cols - 1) * 6) / cols);

  const albumName = (id: string | null) =>
    id ? albums.find((a) => a.id === id)?.name ?? "Album" : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: WHITE }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Title */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 34, fontWeight: "700", color: INK }}>
            Gallery
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => (selectMode ? exitSelect() : setSelectMode(true))}
              style={pillStyle(selectMode)}
            >
              <Text style={{ color: selectMode ? WHITE : INK, fontWeight: "600", fontSize: 13 }}>
                {selectMode ? "Done" : "Select"}
              </Text>
            </Pressable>
            <Pressable onPress={uploadImages} disabled={uploading} style={[pillStyle(true), { opacity: uploading ? 0.6 : 1 }]}>
              {uploading ? (
                <ActivityIndicator size="small" color={WHITE} />
              ) : (
                <Feather name="plus" size={15} color={WHITE} />
              )}
              <Text style={{ color: WHITE, fontWeight: "700", fontSize: 13, marginLeft: 5 }}>
                {uploading && uploadProgress ? `${uploadProgress.done}/${uploadProgress.total}` : "Upload"}
              </Text>
            </Pressable>
          </View>
        </View>
        <Text style={{ marginTop: 4, fontSize: 13, color: INK_DIM }}>
          Your media library — upload once, reuse across listings.
        </Text>

        {/* Album chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 16 }} contentContainerStyle={{ gap: 8 }}>
          <Chip label="All" active={activeAlbum === ALL} onPress={() => setActiveAlbum(ALL)} icon="grid" />
          <Chip label="Uncategorized" active={activeAlbum === NONE} onPress={() => setActiveAlbum(NONE)} />
          {albums.map((a) => (
            <Chip key={a.id} label={a.name} active={activeAlbum === a.id} onPress={() => setActiveAlbum(a.id)} />
          ))}
          <Chip
            label={trashCount ? `Trash ${trashCount}` : "Trash"}
            active={activeAlbum === TRASH}
            onPress={() => setActiveAlbum(TRASH)}
            icon="trash-2"
          />
          <Chip label="New album" onPress={() => setNewAlbumOpen(true)} icon="folder-plus" outline />
        </ScrollView>

        {/* Smart collections */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: 8 }}>
          <Text style={{ fontSize: 10, fontWeight: "800", letterSpacing: 1, color: INK_DIM, alignSelf: "center" }}>
            SMART
          </Text>
          <Chip label="Last 7 days" small active={smart === "recent7"} onPress={() => setSmart(smart === "recent7" ? null : "recent7")} />
          <Chip label="Last 30 days" small active={smart === "recent30"} onPress={() => setSmart(smart === "recent30" ? null : "recent30")} />
          <Chip label="Portraits" small active={smart === "portraits"} onPress={() => setSmart(smart === "portraits" ? null : "portraits")} />
          <Chip label="Landscapes" small active={smart === "landscapes"} onPress={() => setSmart(smart === "landscapes" ? null : "landscapes")} />
          <Chip label="Large" small active={smart === "large"} onPress={() => setSmart(smart === "large" ? null : "large")} />
        </ScrollView>

        {/* Search + sort + view */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }}>
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: SURFACE,
              borderRadius: 12,
              paddingHorizontal: 12,
              height: 40,
            }}
          >
            <Feather name="search" size={15} color={INK_DIM} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search caption or filename"
              placeholderTextColor={INK_DIM}
              style={{ flex: 1, marginLeft: 8, color: INK, fontSize: 14 }}
            />
            {search ? (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Feather name="x" size={15} color={INK_DIM} />
              </Pressable>
            ) : null}
          </View>
          <Pressable onPress={cycleSort(sort, setSort)} style={iconBtn}>
            <Feather name="sliders" size={16} color={INK} />
          </Pressable>
          <Pressable onPress={() => (listView ? setListView(false) : setDense((d) => !d))} style={iconBtn}>
            <Feather name={listView ? "list" : dense ? "grid" : "square"} size={16} color={INK} />
          </Pressable>
          <Pressable onPress={() => setListView((v) => !v)} style={iconBtn}>
            <Feather name={listView ? "grid" : "list"} size={16} color={INK} />
          </Pressable>
        </View>
        <Text style={{ marginTop: 6, fontSize: 11, color: INK_DIM }}>{sortLabel(sort)}</Text>

        {/* Grid / list */}
        {loading ? (
          <View style={{ paddingTop: 80, alignItems: "center" }}>
            <ActivityIndicator />
          </View>
        ) : visible.length === 0 ? (
          <Pressable
            onPress={activeAlbum === TRASH ? undefined : uploadImages}
            style={{ marginTop: 24, backgroundColor: SURFACE, borderRadius: 18, padding: 28, alignItems: "center" }}
          >
            <Feather name={activeAlbum === TRASH ? "trash-2" : "image"} size={28} color={INK_DIM} />
            <Text style={{ marginTop: 10, fontSize: 15, fontWeight: "700", color: INK }}>
              {activeAlbum === TRASH ? "Trash is empty" : search || smart ? "No matches" : "No photos yet"}
            </Text>
            {activeAlbum !== TRASH && !search && !smart ? (
              <Text style={{ marginTop: 4, fontSize: 13, color: INK_DIM, textAlign: "center" }}>
                Tap to upload. JPG, PNG, WebP — up to 20 MB each.
              </Text>
            ) : null}
          </Pressable>
        ) : (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 6,
              marginTop: 16,
            }}
          >
            {visible.map((img) => {
              const isSel = selected.has(img.id);
              return (
                <Pressable
                  key={img.id}
                  onPress={() => {
                    if (selectMode) toggleSelect(img.id);
                    else {
                      setLightbox(img);
                      setCaptionDraft(img.caption ?? "");
                      setEditingCaption(false);
                    }
                  }}
                  onLongPress={() => {
                    if (!selectMode) {
                      setSelectMode(true);
                      toggleSelect(img.id);
                    }
                  }}
                  style={
                    listView
                      ? { width: "100%", flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderColor: BORDER }
                      : { width: tile, height: tile }
                  }
                >
                  <View
                    style={
                      listView
                        ? { width: 56, height: 56, borderRadius: 10, overflow: "hidden", backgroundColor: SURFACE }
                        : { width: "100%", height: "100%", borderRadius: 12, overflow: "hidden", backgroundColor: SURFACE, opacity: isSel ? 0.6 : 1 }
                    }
                  >
                    <Image source={{ uri: img.image_url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                  </View>
                  {listView ? (
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text numberOfLines={1} style={{ color: INK, fontSize: 14, fontWeight: "600" }}>
                        {img.caption || fileNameFromUrl(img.image_url) || "Untitled"}
                      </Text>
                      <Text style={{ color: INK_DIM, fontSize: 12, marginTop: 2 }}>
                        {albumName(img.album_id) ? `${albumName(img.album_id)} · ` : ""}
                        {new Date(img.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                  ) : null}
                  {selectMode ? (
                    <View
                      style={{
                        position: "absolute",
                        top: listView ? 18 : 6,
                        right: 6,
                        width: 22,
                        height: 22,
                        borderRadius: 999,
                        backgroundColor: isSel ? ACCENT : "rgba(255,255,255,0.85)",
                        borderWidth: 1.5,
                        borderColor: isSel ? ACCENT : BORDER,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {isSel ? <Feather name="check" size={13} color={WHITE} /> : null}
                    </View>
                  ) : img.caption && !listView ? (
                    <View style={{ position: "absolute", bottom: 6, right: 6, width: 20, height: 20, borderRadius: 999, backgroundColor: "rgba(10,10,10,0.7)", alignItems: "center", justifyContent: "center" }}>
                      <Feather name="message-square" size={11} color={WHITE} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Bulk action bar */}
      {selectMode && selected.size > 0 ? (
        <View
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: 28,
            backgroundColor: INK,
            borderRadius: 18,
            paddingVertical: 12,
            paddingHorizontal: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ color: WHITE, fontWeight: "700" }}>{selected.size} selected</Text>
          <View style={{ flexDirection: "row", gap: 18 }}>
            {activeAlbum === TRASH ? (
              <BarAction icon="rotate-ccw" label="Restore" onPress={async () => { await restore([...selected]); exitSelect(); }} />
            ) : (
              <BarAction icon="folder" label="Move" onPress={() => setMoveOpen(true)} />
            )}
            <BarAction icon="trash-2" label={activeAlbum === TRASH ? "Delete" : "Trash"} onPress={confirmBulkDelete} danger />
          </View>
        </View>
      ) : null}

      {/* Lightbox */}
      <Modal visible={lightbox !== null} animationType="fade" transparent onRequestClose={() => setLightbox(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)" }}>
          <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 }}>
              <Pressable onPress={() => setLightbox(null)} hitSlop={12} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
                <Feather name="chevron-left" size={28} color={WHITE} />
              </Pressable>
            </View>
            {lightbox ? (
              <>
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 }}>
                  <Image source={{ uri: lightbox.image_url }} style={{ width: "100%", height: "100%", borderRadius: 12 }} resizeMode="contain" />
                </View>
                <View style={{ paddingHorizontal: 18, paddingTop: 10 }}>
                  {editingCaption ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <TextInput
                        value={captionDraft}
                        onChangeText={setCaptionDraft}
                        placeholder="Add a caption…"
                        placeholderTextColor="rgba(255,255,255,0.5)"
                        autoFocus
                        style={{ flex: 1, color: WHITE, fontSize: 15, borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.3)", paddingVertical: 6 }}
                      />
                      <Pressable onPress={() => saveCaption(lightbox)} hitSlop={8}>
                        <Text style={{ color: "#7fb0ff", fontWeight: "700" }}>Save</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable onPress={() => { setCaptionDraft(lightbox.caption ?? ""); setEditingCaption(true); }}>
                      <Text style={{ color: lightbox.caption ? WHITE : "rgba(255,255,255,0.5)", fontSize: 15 }}>
                        {lightbox.caption || "Add a caption…"}
                      </Text>
                    </Pressable>
                  )}
                  <View style={{ flexDirection: "row", justifyContent: "space-around", marginTop: 16 }}>
                    {lightbox.deleted_at ? (
                      <LbAction icon="rotate-ccw" label="Restore" onPress={async () => { await restore([lightbox.id]); setLightbox(null); }} />
                    ) : (
                      <LbAction icon="folder" label="Move" onPress={() => { setSelected(new Set([lightbox.id])); setMoveOpen(true); }} />
                    )}
                    {activeAlbum !== ALL && activeAlbum !== NONE && activeAlbum !== TRASH ? (
                      <LbAction icon="star" label="Cover" onPress={() => setAlbumCover(activeAlbum, lightbox.id)} />
                    ) : null}
                    <LbAction
                      icon="trash-2"
                      label={lightbox.deleted_at ? "Delete" : "Trash"}
                      danger
                      onPress={() => {
                        const img = lightbox;
                        Alert.alert(img.deleted_at ? "Delete forever?" : "Move to trash?", undefined, [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: img.deleted_at ? "Delete" : "Trash",
                            style: "destructive",
                            onPress: async () => {
                              if (img.deleted_at) await purge([img]);
                              else await softDelete([img.id]);
                              setLightbox(null);
                            },
                          },
                        ]);
                      }}
                    />
                  </View>
                </View>
              </>
            ) : null}
          </SafeAreaView>
        </View>
      </Modal>

      {/* New album */}
      <CenterModal visible={newAlbumOpen} onClose={() => setNewAlbumOpen(false)} title="New album">
        <TextInput
          value={newAlbumName}
          onChangeText={setNewAlbumName}
          placeholder="Album name"
          placeholderTextColor={INK_DIM}
          autoFocus
          style={{ marginTop: 14, borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, color: INK, fontSize: 15 }}
        />
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <SmallBtn label="Cancel" onPress={() => setNewAlbumOpen(false)} />
          <SmallBtn label="Create" primary onPress={createAlbum} />
        </View>
      </CenterModal>

      {/* Move to album */}
      <CenterModal visible={moveOpen} onClose={() => setMoveOpen(false)} title="Move to">
        <View style={{ marginTop: 12, gap: 4 }}>
          <MoveRow label="Uncategorized" onPress={async () => { await moveToAlbum([...selected], null); setMoveOpen(false); exitSelect(); }} />
          {albums.map((a) => (
            <MoveRow key={a.id} label={a.name} onPress={async () => { await moveToAlbum([...selected], a.id); setMoveOpen(false); exitSelect(); }} />
          ))}
        </View>
      </CenterModal>
    </SafeAreaView>
  );
}

// ---------- small UI pieces ----------
function pillStyle(filled: boolean) {
  return {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: filled ? INK : SURFACE,
  };
}

const iconBtn = {
  width: 40,
  height: 40,
  borderRadius: 12,
  backgroundColor: SURFACE,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

function Chip({
  label,
  active,
  onPress,
  icon,
  small,
  outline,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Feather.glyphMap;
  small?: boolean;
  outline?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        height: small ? 30 : 34,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: active ? INK : outline ? WHITE : SURFACE,
        borderWidth: outline ? 1 : 0,
        borderColor: BORDER,
      }}
    >
      {icon ? <Feather name={icon} size={13} color={active ? WHITE : INK_DIM} style={{ marginRight: 5 }} /> : null}
      <Text style={{ color: active ? WHITE : INK, fontSize: small ? 12 : 13, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

function BarAction({ icon, label, onPress, danger }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: "center" }} hitSlop={8}>
      <Feather name={icon} size={18} color={danger ? "#ff8a80" : WHITE} />
      <Text style={{ color: danger ? "#ff8a80" : WHITE, fontSize: 11, marginTop: 2 }}>{label}</Text>
    </Pressable>
  );
}

function LbAction({ icon, label, onPress, danger }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: "center" }} hitSlop={8}>
      <Feather name={icon} size={22} color={danger ? "#ff8a80" : WHITE} />
      <Text style={{ color: danger ? "#ff8a80" : "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 4 }}>{label}</Text>
    </Pressable>
  );
}

function CenterModal({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", paddingHorizontal: 24 }}
      >
        <View style={{ backgroundColor: WHITE, borderRadius: 20, padding: 20, maxHeight: "70%" }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: INK }}>{title}</Text>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SmallBtn({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 18,
        height: 42,
        borderRadius: 999,
        backgroundColor: primary ? INK : WHITE,
        borderWidth: primary ? 0 : 1,
        borderColor: BORDER,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: primary ? WHITE : INK, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

function MoveRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderColor: BORDER }}>
      <Feather name="folder" size={16} color={INK_DIM} />
      <Text style={{ marginLeft: 10, fontSize: 15, color: INK }}>{label}</Text>
    </Pressable>
  );
}

function cycleSort(sort: SortMode, set: (s: SortMode) => void) {
  const order: SortMode[] = ["newest", "oldest", "name_asc", "name_desc"];
  return () => set(order[(order.indexOf(sort) + 1) % order.length]);
}

function sortLabel(sort: SortMode): string {
  return {
    newest: "Sort: Newest first",
    oldest: "Sort: Oldest first",
    name_asc: "Sort: Name A–Z",
    name_desc: "Sort: Name Z–A",
  }[sort];
}
