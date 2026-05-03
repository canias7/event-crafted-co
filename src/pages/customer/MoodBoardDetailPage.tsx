import { useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Upload,
  Link as LinkIcon,
  X,
  Loader2,
  Share2,
  Trash2,
  ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Lightbox } from "@/components/shared/Lightbox";
import { customerNavItems as navItems } from "@/data/navItems";

const BUCKET = "mood-board-images";
const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

interface BoardRow {
  id: string;
  host_id: string;
  name: string;
  description: string | null;
  share_token: string;
  created_at: string;
}

interface PinRow {
  id: string;
  image_url: string;
  source_url: string | null;
  caption: string | null;
  display_order: number;
  created_at: string;
}

export default function MoodBoardDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [board, setBoard] = useState<BoardRow | null>(null);
  const [pins, setPins] = useState<PinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [urlSource, setUrlSource] = useState("");
  const [urlCaption, setUrlCaption] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    if (!id || !user) return;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: b } = await (supabase as any)
      .from("mood_boards")
      .select("id, host_id, name, description, share_token, created_at")
      .eq("id", id)
      .maybeSingle();
    if (!b) {
      setBoard(null);
      setLoading(false);
      return;
    }
    setBoard(b as BoardRow);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: items } = await (supabase as any)
      .from("mood_board_items")
      .select("id, image_url, source_url, caption, display_order, created_at")
      .eq("board_id", id)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    setPins((items as PinRow[] | null) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (user && id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  function nextDisplayOrder() {
    return pins.reduce((m, p) => Math.max(m, p.display_order), -1) + 1;
  }

  async function uploadFiles(fileList: FileList) {
    if (!user || !board) return;
    const files = Array.from(fileList).filter((f) => {
      if (!ACCEPTED.includes(f.type)) {
        toast.error(`${f.name}: only JPG, PNG, WEBP, or GIF`);
        return false;
      }
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name}: max 8 MB`);
        return false;
      }
      return true;
    });
    if (files.length === 0) return;

    setUploading(true);
    const start = nextDisplayOrder();
    let succeeded = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split(".").pop() ?? "jpg";
      const filename = `${crypto.randomUUID()}.${ext.toLowerCase()}`;
      const path = `${user.id}/${board.id}/${filename}`;

      const upload = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, cacheControl: "3600" });
      if (upload.error) {
        toast.error(`${file.name}: ${upload.error.message}`);
        continue;
      }
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const insert = await (supabase as any).from("mood_board_items").insert({
        board_id: board.id,
        image_url: pub.publicUrl,
        display_order: start + i,
      });
      if (insert.error) {
        await supabase.storage.from(BUCKET).remove([path]);
        toast.error(`${file.name}: ${insert.error.message}`);
        continue;
      }
      succeeded++;
    }
    setUploading(false);
    if (succeeded > 0) {
      toast.success(
        `${succeeded} ${succeeded === 1 ? "pin" : "pins"} added`,
      );
      load();
    }
  }

  async function addByUrl() {
    if (!board || !urlValue.trim()) return;
    setAddingUrl(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("mood_board_items").insert({
      board_id: board.id,
      image_url: urlValue.trim(),
      source_url: urlSource.trim() || null,
      caption: urlCaption.trim() || null,
      display_order: nextDisplayOrder(),
    });
    setAddingUrl(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Pin added");
    setUrlOpen(false);
    setUrlValue("");
    setUrlSource("");
    setUrlCaption("");
    load();
  }

  async function deletePin(pin: PinRow) {
    setDeletingId(pin.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("mood_board_items")
      .delete()
      .eq("id", pin.id);
    // If the image is in our bucket, remove the blob too. External URLs
    // are left alone — we never owned them.
    if (pin.image_url.includes(`/${BUCKET}/`)) {
      const marker = `/${BUCKET}/`;
      const idx = pin.image_url.indexOf(marker);
      if (idx >= 0) {
        const path = pin.image_url.slice(idx + marker.length).split("?")[0];
        await supabase.storage.from(BUCKET).remove([path]);
      }
    }
    setDeletingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPins((prev) => prev.filter((p) => p.id !== pin.id));
  }

  async function deleteBoard() {
    if (!board) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("mood_boards")
      .delete()
      .eq("id", board.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Board deleted");
    navigate("/customer/moodboards");
  }

  function copyShareLink() {
    if (!board) return;
    const url = `${window.location.origin}/board/${board.share_token}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success("Share link copied"),
      () => toast.error("Couldn't copy — your browser blocked clipboard access"),
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen bg-background">
        <DashboardSidebar items={navItems} title="Customer" backPath="/" />
        <main className="flex-1 p-12 text-center text-muted-foreground">
          Loading board…
        </main>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="flex min-h-screen bg-background">
        <DashboardSidebar items={navItems} title="Customer" backPath="/" />
        <main className="flex-1 p-12 text-center">
          <p className="font-display text-xl mb-2">Board not found</p>
          <Link to="/customer/moodboards" className="text-sm text-accent">
            Back to mood boards
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <Link
            to="/customer/moodboards"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All boards
          </Link>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-display text-xl">{board.name}</h1>
              {board.description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {board.description}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1 tnum">
                {pins.length} {pins.length === 1 ? "pin" : "pins"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={copyShareLink}
                className="rounded-full"
              >
                <Share2 className="w-3.5 h-3.5 mr-1.5" />
                Share
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="rounded-full">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this board?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove the board and all {pins.length} pins.
                      You can't undo this.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-full">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={deleteBoard}
                      className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete board
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>

        <div className="p-4 md:p-8">
          <div className="flex gap-2 mb-6 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  Upload images
                </>
              )}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED.join(",")}
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  uploadFiles(e.target.files);
                }
                e.target.value = "";
              }}
            />
            <Dialog open={urlOpen} onOpenChange={setUrlOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-full">
                  <LinkIcon className="w-3.5 h-3.5 mr-1.5" />
                  Pin from URL
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Pin an image from the web</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="pin-image">Image URL</Label>
                    <Input
                      id="pin-image"
                      placeholder="https://…/image.jpg"
                      value={urlValue}
                      onChange={(e) => setUrlValue(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pin-source">Source URL (optional)</Label>
                    <Input
                      id="pin-source"
                      placeholder="https://pinterest.com/pin/…"
                      value={urlSource}
                      onChange={(e) => setUrlSource(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pin-caption">Caption (optional)</Label>
                    <Input
                      id="pin-caption"
                      placeholder="A note about this image"
                      value={urlCaption}
                      onChange={(e) => setUrlCaption(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="ghost"
                    onClick={() => setUrlOpen(false)}
                    className="rounded-full"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={addByUrl}
                    disabled={addingUrl || !urlValue.trim()}
                    className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                  >
                    {addingUrl ? "Adding…" : "Pin it"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {pins.length === 0 ? (
            <div className="text-center py-20 max-w-md mx-auto">
              <div className="w-12 h-12 mx-auto rounded-full bg-secondary flex items-center justify-center mb-4">
                <ImageIcon className="w-5 h-5 text-muted-foreground" />
              </div>
              <h3 className="font-display text-xl mb-2">No pins yet</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Upload images from your device or paste URLs from Pinterest,
                Instagram, or anywhere else on the web.
              </p>
            </div>
          ) : (
            <div className="columns-2 md:columns-3 lg:columns-4 gap-4 [column-fill:_balance]">
              {pins.map((pin, idx) => (
                <div
                  key={pin.id}
                  className="relative group mb-4 break-inside-avoid rounded-sm overflow-hidden bg-muted"
                >
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(idx)}
                    className="block w-full"
                    aria-label="Open pin"
                  >
                    <img
                      src={pin.image_url}
                      alt={pin.caption ?? "Pin"}
                      loading="lazy"
                      className="w-full h-auto block"
                    />
                  </button>
                  {pin.caption && (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-foreground/85 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-background text-xs leading-snug">
                        {pin.caption}
                      </p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => deletePin(pin)}
                    disabled={deletingId === pin.id}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-foreground/85 text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm disabled:opacity-100"
                    aria-label="Delete pin"
                  >
                    {deletingId === pin.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <X className="w-3.5 h-3.5" />
                    )}
                  </button>
                  {pin.source_url && (
                    <a
                      href={pin.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="absolute top-2 left-2 w-7 h-7 rounded-full bg-foreground/85 text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
                      aria-label="Open source"
                    >
                      <LinkIcon className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <MobileNav items={navItems} />

      <Lightbox
        images={pins.map((pin) => ({
          src: pin.image_url,
          alt: pin.caption ?? "Pin",
          caption: pin.caption,
          href: pin.source_url,
        }))}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </div>
  );
}
