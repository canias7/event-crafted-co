import { useState } from "react";
import { Bookmark, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
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
import { Switch } from "@/components/ui/switch";

interface Filters {
  q?: string;
  category?: string;
}

interface Props {
  filters: Filters;
}

function summarize(filters: Filters) {
  const parts: string[] = [];
  if (filters.category && filters.category !== "All") parts.push(filters.category);
  if (filters.q) parts.push(`"${filters.q}"`);
  return parts.length > 0 ? parts.join(" · ") : "All vendors";
}

export function SaveSearchButton({ filters }: Props) {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);

  // Only meaningful for hosts (or signed-in users who have at least
  // one filter active).
  const hasFilters =
    !!filters.q || (filters.category && filters.category !== "All");
  if (!hasFilters) return null;

  // Signed-out users: show CTA that pushes to signup.
  if (!user || !profile) {
    return (
      <Link to="/signup">
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full text-xs h-8"
        >
          <Bookmark className="w-3 h-3 mr-1" />
          Sign in to save
        </Button>
      </Link>
    );
  }

  // Vendor / admin profile: don't surface — saved searches are a
  // host-side feature.
  if (profile.role !== "host") return null;

  async function save() {
    if (!user || !name.trim()) return;
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("saved_searches").insert({
      host_id: user.id,
      name: name.trim(),
      filters: { _version: 1, ...filters },
      notify_new_matches: notify,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Search saved");
    setOpen(false);
    setName("");
    setNotify(true);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && !name) setName(summarize(filters));
      }}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="rounded-full text-xs h-8"
      >
        <Bookmark className="w-3 h-3 mr-1" />
        Save search
      </Button>
      <DialogContent className="sm:max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            Save this search
          </DialogTitle>
          <DialogDescription>
            Re-run it any time from your saved searches page, and get a
            ping when new vendors join that match.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="rounded-sm bg-secondary/50 p-3 text-xs">
            <span className="text-muted-foreground">Filters: </span>
            <span className="font-medium">{summarize(filters)}</span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="search-name">Name</Label>
            <Input
              id="search-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Brooklyn florists"
              autoFocus
              required
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Notify me of new matches</p>
              <p className="text-xs text-muted-foreground">
                We'll drop a notification when a new vendor joins that
                matches this search.
              </p>
            </div>
            <Switch checked={notify} onCheckedChange={setNotify} />
          </div>
        </div>
        <DialogFooter className="pt-2 gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={saving}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saving || !name.trim()}
            className="rounded-full bg-foreground text-background hover:bg-foreground/90"
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save search
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
