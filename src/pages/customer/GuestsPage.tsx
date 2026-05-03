import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Users,
  Copy,
  Check,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Checkbox,
} from "@/components/ui/checkbox";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { customerNavItems as navItems } from "@/data/navItems";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const guestsTable = () => (supabase as any).from("event_guests");

interface GuestRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  plus_one_allowed: boolean;
  group_label: string | null;
  invitation_token: string;
  rsvp_status: "attending" | "declined" | "maybe" | null;
  rsvp_plus_one: boolean | null;
  rsvp_responded_at: string | null;
}

const rsvpStyles: Record<string, string> = {
  attending: "bg-accent text-accent-foreground border-accent",
  declined: "bg-muted text-muted-foreground border-border",
  maybe: "bg-secondary text-secondary-foreground border-border",
};

const rsvpLabel: Record<string, string> = {
  attending: "Attending",
  declined: "Declined",
  maybe: "Maybe",
};

export default function GuestsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<GuestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<
    "all" | "attending" | "declined" | "maybe" | "no-response"
  >("all");
  const [addOpen, setAddOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data } = await guestsTable()
      .select(
        "id, name, email, phone, plus_one_allowed, group_label, invitation_token, rsvp_status, rsvp_plus_one, rsvp_responded_at",
      )
      .eq("host_id", user.id)
      .order("created_at", { ascending: false });
    setRows((data as GuestRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function deleteGuest(id: string) {
    setRows((prev) => prev.filter((g) => g.id !== id));
    const { error } = await guestsTable().delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
    }
  }

  function copyLink(token: string, id: string) {
    const url = `${window.location.origin}/rsvp/${token}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1500);
        toast.success("Invitation link copied");
      })
      .catch(() => toast.error("Couldn't copy link"));
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((g) => {
      if (filter === "no-response" && g.rsvp_status) return false;
      if (
        filter !== "all" &&
        filter !== "no-response" &&
        g.rsvp_status !== filter
      )
        return false;
      if (!q) return true;
      return (
        g.name.toLowerCase().includes(q) ||
        (g.email ?? "").toLowerCase().includes(q) ||
        (g.group_label ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, filter]);

  const stats = useMemo(() => {
    let total = 0;
    let attending = 0;
    let declined = 0;
    let awaiting = 0;
    let plusOnes = 0;
    for (const g of rows) {
      total++;
      if (g.rsvp_status === "attending") {
        attending++;
        if (g.rsvp_plus_one) plusOnes++;
      } else if (g.rsvp_status === "declined") declined++;
      else awaiting++;
    }
    return { total, attending, declined, awaiting, plusOnes };
  }, [rows]);

  const filterChips: Array<{ value: typeof filter; label: string; count: number }> = [
    { value: "all", label: "All", count: stats.total },
    { value: "attending", label: "Attending", count: stats.attending },
    { value: "declined", label: "Declined", count: stats.declined },
    { value: "maybe", label: "Maybe", count: rows.filter((g) => g.rsvp_status === "maybe").length },
    { value: "no-response", label: "No response", count: stats.awaiting },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 flex items-center justify-between sticky top-0 z-40">
          <div>
            <h1 className="font-display text-xl">Guests</h1>
            <p className="text-sm text-muted-foreground">
              Manage your guest list and RSVPs
            </p>
          </div>
          <Button
            onClick={() => setAddOpen(true)}
            className="rounded-full bg-foreground text-background hover:bg-foreground/90"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add guest
          </Button>
        </div>

        <div className="p-4 md:p-8 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Total", value: stats.total },
              { label: "Attending", value: stats.attending },
              { label: "Declined", value: stats.declined },
              { label: "Awaiting", value: stats.awaiting },
              { label: "Plus-ones", value: stats.plusOnes },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-card border border-border rounded-sm px-5 py-4"
              >
                <p className="font-label text-muted-foreground">{s.label}</p>
                <p className="font-display text-2xl tnum mt-1">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, or group"
                className="h-11 pl-10 rounded-full bg-secondary/80 border-none"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
              {filterChips.map((c) => (
                <Button
                  key={c.value}
                  size="sm"
                  variant="ghost"
                  onClick={() => setFilter(c.value)}
                  className={`rounded-full whitespace-nowrap h-9 text-xs ${
                    filter === c.value
                      ? "bg-foreground text-background hover:bg-foreground/90"
                      : "bg-secondary/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {c.label}
                  <span className="ml-2 tnum opacity-70">{c.count}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="bg-card rounded-sm border border-border overflow-hidden">
            {loading ? (
              <div className="p-6 space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 px-6">
                <Users className="w-10 h-10 mx-auto text-muted-foreground/40 mb-4" />
                <p className="font-display text-xl mb-2">
                  {rows.length === 0
                    ? "No guests yet"
                    : "Nothing matches that filter"}
                </p>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6 leading-relaxed">
                  {rows.length === 0
                    ? "Add your first guest, share their invitation link, and watch RSVPs roll in."
                    : "Try a different filter above."}
                </p>
                {rows.length === 0 && (
                  <Button
                    onClick={() => setAddOpen(true)}
                    className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add guest
                  </Button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((g) => (
                  <div
                    key={g.id}
                    className="p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-3 md:gap-5"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{g.name}</p>
                        {g.plus_one_allowed && (
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase tracking-wider"
                          >
                            +1 allowed
                          </Badge>
                        )}
                        {g.group_label && (
                          <span className="font-label text-muted-foreground">
                            {g.group_label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {g.email ?? g.phone ?? "—"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                      {g.rsvp_status ? (
                        <Badge
                          variant="outline"
                          className={rsvpStyles[g.rsvp_status]}
                        >
                          {rsvpLabel[g.rsvp_status]}
                          {g.rsvp_status === "attending" && g.rsvp_plus_one && " +1"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Awaiting
                        </Badge>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs rounded-full"
                        onClick={() => copyLink(g.invitation_token, g.id)}
                      >
                        {copiedId === g.id ? (
                          <>
                            <Check className="w-3 h-3 mr-1.5" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 mr-1.5" />
                            Copy link
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => deleteGuest(g.id)}
                        aria-label="Delete guest"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <MobileNav items={navItems} />

      {user && (
        <AddGuestDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          hostId={user.id}
          onSuccess={load}
        />
      )}
    </div>
  );
}

function AddGuestDialog({
  open,
  onOpenChange,
  hostId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostId: string;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [groupLabel, setGroupLabel] = useState("");
  const [plusOne, setPlusOne] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Guest name is required");
      return;
    }
    setSubmitting(true);
    const { error } = await guestsTable().insert({
      host_id: hostId,
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      group_label: groupLabel.trim() || null,
      plus_one_allowed: plusOne,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Guest added");
    setName("");
    setEmail("");
    setPhone("");
    setGroupLabel("");
    setPlusOne(false);
    onOpenChange(false);
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Add a guest</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="guest-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="guest-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="h-10"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="guest-email">Email</Label>
              <Input
                id="guest-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-phone">Phone</Label>
              <Input
                id="guest-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-10"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="guest-group">Group</Label>
            <Input
              id="guest-group"
              value={groupLabel}
              onChange={(e) => setGroupLabel(e.target.value)}
              placeholder="Bride's family, work friends, …"
              className="h-10"
            />
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <Checkbox
              checked={plusOne}
              onCheckedChange={(v) => setPlusOne(v === true)}
            />
            <span className="text-sm">Allow a plus-one</span>
          </label>
          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
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
              Add guest
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
