import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, Plus, Loader2, Check, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BoardOption {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  sourceUrl?: string;
  caption?: string;
}

export function SaveToBoardModal({
  open,
  onOpenChange,
  imageUrl,
  sourceUrl,
  caption,
}: Props) {
  const { user } = useAuth();
  const [boards, setBoards] = useState<BoardOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from("mood_boards")
      .select("id, name")
      .eq("host_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setBoards((data as BoardOption[]) ?? []);
        setLoading(false);
        // If they have no boards, jump straight to the create form so the
        // first interaction isn't an empty list.
        setShowCreate((data ?? []).length === 0);
      });
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  async function pinTo(boardId: string) {
    setSavingId(boardId);
    // Resolve next display order for the board.
    const { data: existing } = await supabase
      .from("mood_board_items")
      .select("display_order")
      .eq("board_id", boardId)
      .order("display_order", { ascending: false })
      .limit(1);
    const nextOrder = (existing?.[0]?.display_order ?? -1) + 1;

    const { error } = await supabase.from("mood_board_items").insert({
      board_id: boardId,
      image_url: imageUrl,
      source_url: sourceUrl ?? null,
      caption: caption ?? null,
      display_order: nextOrder,
    });
    setSavingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Pinned to your board");
    onOpenChange(false);
  }

  async function createAndPin(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !newName.trim()) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("mood_boards")
      .insert({ host_id: user.id, name: newName.trim() })
      .select("id")
      .single();
    if (error || !data) {
      setCreating(false);
      toast.error(error?.message ?? "Couldn't create the board");
      return;
    }
    await pinTo(data.id);
    setCreating(false);
    setNewName("");
    setShowCreate(false);
  }

  if (!user) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-editorial text-3xl">
              Sign in to save
            </DialogTitle>
            <DialogDescription>
              Mood boards are part of your planning workspace. Create an
              account to start saving inspiration.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4 gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="rounded-full"
            >
              Maybe later
            </Button>
            <Link to="/signup">
              <Button className="rounded-full bg-foreground text-background hover:bg-foreground/90">
                Create an account
              </Button>
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-editorial text-3xl">
            Save to a mood board
          </DialogTitle>
          <DialogDescription>
            Pin this image to keep it with the rest of your inspiration.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            Loading boards…
          </div>
        ) : showCreate ? (
          <form onSubmit={createAndPin} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="new-board-name">New board name</Label>
              <Input
                id="new-board-name"
                placeholder="e.g. Florals & color palette"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                required
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              {boards.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowCreate(false)}
                  disabled={creating}
                  className="rounded-full"
                >
                  Back
                </Button>
              )}
              <Button
                type="submit"
                disabled={creating || !newName.trim()}
                className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create + pin
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-3 pt-2">
            <div className="max-h-72 overflow-y-auto -mx-1 px-1">
              {boards.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-6">
                  <ImageIcon className="w-6 h-6 mx-auto mb-2 text-muted-foreground/50" />
                  No boards yet — create your first below.
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {boards.map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => pinTo(b.id)}
                        disabled={savingId !== null}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-sm border border-border hover:border-foreground/30 hover:bg-secondary/40 transition-colors text-left disabled:opacity-60"
                      >
                        <span className="text-sm font-medium truncate">
                          {b.name}
                        </span>
                        {savingId === b.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                        ) : (
                          <Bookmark className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowCreate(true)}
              className="w-full rounded-full"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New board
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
