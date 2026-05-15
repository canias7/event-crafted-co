import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Edit2,
  Gift,
  Copy,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { SubNavTabs } from "@/components/shared/SubNavTabs";
import { GIFTS_HUB_TABS } from "@/data/hubTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { customerNavItems as navItems } from "@/data/navItems";

interface Wish {
  id: string;
  title: string;
  description: string | null;
  target_cents: number | null;
  image_url: string | null;
  source_url: string | null;
  share_token: string;
  pledged_cents?: number;
  pledge_count?: number;
}

const wishesTable = () => supabase.from("gift_wishes");

export default function GiftWishesPage() {
  const { user } = useAuth();
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Wish | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data } = await wishesTable()
      .select(
        "id, title, description, target_cents, image_url, source_url, share_token",
      )
      .eq("host_id", user.id)
      .order("created_at", { ascending: false });
    const baseWishes = (data as Wish[] | null) ?? [];

    if (baseWishes.length > 0) {
      // Hydrate per-wish pledged totals
      const { data: pledges } = await supabase
        .from("gift_pledges")
        .select("wish_id, amount_cents")
        .in(
          "wish_id",
          baseWishes.map((w) => w.id),
        );
      const totals = new Map<string, { sum: number; count: number }>();
      for (const p of (pledges ?? []) as Array<{
        wish_id: string;
        amount_cents: number;
      }>) {
        const existing = totals.get(p.wish_id) ?? { sum: 0, count: 0 };
        existing.sum += p.amount_cents;
        existing.count += 1;
        totals.set(p.wish_id, existing);
      }
      for (const w of baseWishes) {
        const t = totals.get(w.id);
        w.pledged_cents = t?.sum ?? 0;
        w.pledge_count = t?.count ?? 0;
      }
    }
    setWishes(baseWishes);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function deleteWish(id: string) {
    setDeletingId(id);
    const { error } = await wishesTable().delete().eq("id", id);
    setDeletingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setWishes((p) => p.filter((w) => w.id !== id));
  }

  function copyShare(token: string) {
    const url = `${window.location.origin}/gift/${token}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success("Share link copied"),
      () => toast.error("Couldn't copy"),
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="font-editorial text-3xl">Group gifts</h1>
              <p className="text-sm text-muted-foreground">
                Big-ticket items + cash funds guests pool toward
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New gift
            </Button>
          </div>
          <SubNavTabs tabs={GIFTS_HUB_TABS} />
        </div>

        <div className="p-4 md:p-8 max-w-3xl space-y-4">
          {loading ? (
            <div className="text-center text-muted-foreground py-12">
              Loading…
            </div>
          ) : wishes.length === 0 ? (
            <div className="text-center py-16 max-w-md mx-auto">
              <div className="w-12 h-12 mx-auto rounded-full bg-secondary flex items-center justify-center mb-4">
                <Gift className="w-5 h-5 text-muted-foreground" />
              </div>
              <h3 className="font-editorial text-3xl mb-2">No group gifts yet</h3>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                Add gifts where guests pool money — honeymoon fund, big
                furniture, charity, anything. Each gets its own share link.
              </p>
              <div className="rounded-sm bg-secondary/50 p-4 text-left mb-6">
                <p className="font-label text-accent flex items-center gap-1.5 mb-1.5">
                  <Sparkles className="w-3 h-3" />
                  Tip
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Pledges are tracked, not charged. Vendora doesn't process
                  payments yet — guests see who pledged what, you collect
                  off-platform.
                </p>
              </div>
              <Button
                onClick={() => {
                  setEditing(null);
                  setEditorOpen(true);
                }}
                className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add your first gift
              </Button>
            </div>
          ) : (
            wishes.map((w) => {
              const pct = w.target_cents
                ? Math.min(
                    100,
                    Math.round(((w.pledged_cents ?? 0) / w.target_cents) * 100),
                  )
                : null;
              return (
                <div
                  key={w.id}
                  className="card-soft p-5"
                >
                  <div className="flex items-start gap-4">
                    {w.image_url && (
                      <img
                        src={w.image_url}
                        alt={w.title}
                        className="w-20 h-20 rounded-sm object-cover shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <p className="font-display text-base">{w.title}</p>
                          {w.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {w.description}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditing(w);
                              setEditorOpen(true);
                            }}
                            aria-label="Edit gift"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={deletingId === w.id}
                            onClick={() => deleteWish(w.id)}
                            aria-label="Delete gift"
                          >
                            {deletingId === w.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-baseline gap-2 mb-2">
                        <p className="font-display text-lg tnum">
                          ${Math.round((w.pledged_cents ?? 0) / 100).toLocaleString()}
                        </p>
                        {w.target_cents && (
                          <p className="text-xs text-muted-foreground">
                            of ${Math.round(w.target_cents / 100).toLocaleString()}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground ml-auto">
                          {w.pledge_count ?? 0}{" "}
                          {(w.pledge_count ?? 0) === 1
                            ? "contribution"
                            : "contributions"}
                        </p>
                      </div>
                      {pct !== null && (
                        <Progress value={pct} className="h-1.5 mb-3" />
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyShare(w.share_token)}
                          className="rounded-full h-8 text-xs"
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Share link
                        </Button>
                        {w.source_url && (
                          <a
                            href={w.source_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              className="rounded-full h-8 text-xs"
                            >
                              <ExternalLink className="w-3 h-3 mr-1" />
                              Source
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      <MobileNav items={navItems} />

      {user && (
        <WishEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          hostId={user.id}
          editing={editing}
          onSuccess={load}
        />
      )}
    </div>
  );
}

function WishEditor({
  open,
  onOpenChange,
  hostId,
  editing,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  hostId: string;
  editing: Wish | null;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [target, setTarget] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(editing?.title ?? "");
      setDescription(editing?.description ?? "");
      setTarget(
        editing?.target_cents != null
          ? Math.round(editing.target_cents / 100).toString()
          : "",
      );
      setImageUrl(editing?.image_url ?? "");
      setSourceUrl(editing?.source_url ?? "");
    }
  }, [open, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSubmitting(true);
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      target_cents: target ? Math.round(Number.parseFloat(target) * 100) : null,
      image_url: imageUrl.trim() || null,
      source_url: sourceUrl.trim() || null,
    };
    const { error } = editing
      ? await wishesTable().update(payload).eq("id", editing.id)
      : await wishesTable().insert({ ...payload, host_id: hostId });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Gift updated" : "Gift added");
    onOpenChange(false);
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {editing ? "Edit gift" : "New gift"}
          </DialogTitle>
          <DialogDescription>
            Tracking only — Vendora doesn't process payments yet. You'll
            see who pledged what + collect off-platform.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="w-title">Title</Label>
            <Input
              id="w-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Honeymoon fund · Espresso machine · Charity donation"
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="w-desc">Description (optional)</Label>
            <Textarea
              id="w-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A few sentences guests will see when they open the share link."
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="w-target">Target (USD, optional)</Label>
              <Input
                id="w-target"
                type="number"
                min="0"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="2500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="w-image">Image URL (optional)</Label>
              <Input
                id="w-image"
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="w-source">Source URL (optional)</Label>
            <Input
              id="w-source"
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://amazon.com/…"
            />
          </div>
          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editing ? "Save" : "Add gift"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
