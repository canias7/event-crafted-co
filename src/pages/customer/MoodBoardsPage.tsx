import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ImageIcon, Plus, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { customerNavItems as navItems } from "@/data/navItems";

interface BoardRow {
  id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  share_token: string;
  created_at: string;
  pin_count?: number;
}

export default function MoodBoardsPage() {
  const { user } = useAuth();
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  async function loadBoards() {
    if (!user) return;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: boardData } = await (supabase as any)
      .from("mood_boards")
      .select("id, name, description, cover_image_url, share_token, created_at")
      .eq("host_id", user.id)
      .order("created_at", { ascending: false });

    const list = (boardData as BoardRow[] | null) ?? [];

    if (list.length > 0) {
      // Pull pin counts in a single query
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: itemRows } = await (supabase as any)
        .from("mood_board_items")
        .select("board_id, image_url")
        .in(
          "board_id",
          list.map((b) => b.id),
        );
      const items = (itemRows as { board_id: string; image_url: string }[] | null) ?? [];
      const counts: Record<string, number> = {};
      const firstImage: Record<string, string> = {};
      for (const it of items) {
        counts[it.board_id] = (counts[it.board_id] ?? 0) + 1;
        if (!firstImage[it.board_id]) firstImage[it.board_id] = it.image_url;
      }
      for (const b of list) {
        b.pin_count = counts[b.id] ?? 0;
        if (!b.cover_image_url) b.cover_image_url = firstImage[b.id] ?? null;
      }
    }

    setBoards(list);
    setLoading(false);
  }

  useEffect(() => {
    if (user) loadBoards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleCreate() {
    if (!user || !name.trim()) return;
    setCreating(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("mood_boards")
      .insert({
        host_id: user.id,
        name: name.trim(),
        description: description.trim() || null,
      })
      .select("id")
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error("Couldn't create the board. Try again.");
      return;
    }
    toast.success("Board created");
    setCreateOpen(false);
    setName("");
    setDescription("");
    await loadBoards();
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40 flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl">Mood boards</h1>
            <p className="text-sm text-muted-foreground">
              Pin inspiration and share with your vendors
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                New board
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a mood board</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="board-name">Name</Label>
                  <Input
                    id="board-name"
                    placeholder="e.g. Florals & color palette"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="board-desc">Description (optional)</Label>
                  <Textarea
                    id="board-desc"
                    placeholder="What this board is about"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-full"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={creating || !name.trim()}
                  className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                >
                  {creating ? "Creating…" : "Create board"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="p-4 md:p-8">
          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <Skeleton className="aspect-[4/5] w-full rounded-sm mb-4" />
                  <Skeleton className="h-5 w-2/3 mb-2" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          ) : boards.length === 0 ? (
            <div className="text-center py-20 max-w-md mx-auto">
              <div className="w-12 h-12 mx-auto rounded-full bg-secondary flex items-center justify-center mb-4">
                <ImageIcon className="w-5 h-5 text-muted-foreground" />
              </div>
              <h3 className="font-display text-xl mb-2">No mood boards yet</h3>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                Collect references — florals, color palettes, table settings — then
                share a single link with your vendors so they're aligned from day one.
              </p>
              <Button
                onClick={() => setCreateOpen(true)}
                className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                Create your first board
                <ArrowRight className="w-3.5 h-3.5 ml-2" />
              </Button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
              {boards.map((b) => (
                <Link
                  key={b.id}
                  to={`/customer/moodboards/${b.id}`}
                  className="group block"
                >
                  <div className="aspect-[4/5] overflow-hidden rounded-sm mb-4 bg-muted">
                    {b.cover_image_url ? (
                      <img
                        src={b.cover_image_url}
                        alt={b.name}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
                      </div>
                    )}
                  </div>
                  <h3 className="font-display text-lg leading-tight transition-colors group-hover:text-accent mb-1">
                    {b.name}
                  </h3>
                  <p className="text-sm text-muted-foreground tnum">
                    {b.pin_count ?? 0} {(b.pin_count ?? 0) === 1 ? "pin" : "pins"}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
