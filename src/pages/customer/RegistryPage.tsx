import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Edit2,
  ExternalLink,
  Gift,
  Heart,
  Sparkles,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { customerNavItems as navItems } from "@/data/navItems";

interface RegistryLink {
  id: string;
  provider: string;
  label: string;
  url: string;
  description: string | null;
  display_order: number;
}

const PROVIDERS: Array<{
  value: string;
  label: string;
  hint: string;
  cta: string;
}> = [
  { value: "amazon", label: "Amazon", hint: "Anything", cta: "amazon.com/wedding" },
  { value: "crate-barrel", label: "Crate & Barrel", hint: "Home", cta: "crateandbarrel.com" },
  { value: "zola", label: "Zola", hint: "All-in-one wedding", cta: "zola.com" },
  { value: "honeyfund", label: "Honeyfund", hint: "Honeymoon cash fund", cta: "honeyfund.com" },
  { value: "charity", label: "Charity", hint: "Donations in lieu", cta: "" },
  { value: "other", label: "Custom", hint: "Anything else", cta: "" },
];

const providerStyles: Record<string, string> = {
  amazon: "bg-[#FF9900]/10 text-[#FF9900] border-[#FF9900]/30",
  "crate-barrel": "bg-foreground/10 text-foreground border-foreground/20",
  zola: "bg-accent/15 text-accent border-accent/30",
  honeyfund: "bg-[#F59E0B]/10 text-[#D97706] border-[#F59E0B]/30",
  charity: "bg-[#10B981]/10 text-[#059669] border-[#10B981]/30",
  other: "bg-muted text-muted-foreground border-border",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const linksTable = () => (supabase as any).from("event_registry_links");

export default function RegistryPage() {
  const { user } = useAuth();
  const [links, setLinks] = useState<RegistryLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<RegistryLink | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data } = await linksTable()
      .select("id, provider, label, url, description, display_order")
      .eq("host_id", user.id)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    setLinks((data as RegistryLink[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function deleteLink(id: string) {
    setDeletingId(id);
    const { error } = await linksTable().delete().eq("id", id);
    setDeletingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setLinks((prev) => prev.filter((l) => l.id !== id));
    toast.success("Registry link removed");
  }

  function copyAllLinks() {
    if (links.length === 0) {
      toast.error("Add a link first");
      return;
    }
    const text = links
      .map((l) => `${l.label}: ${l.url}`)
      .join("\n");
    navigator.clipboard.writeText(text).then(
      () => toast.success("All registry links copied"),
      () => toast.error("Couldn't copy"),
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="font-display text-xl">Registry</h1>
              <p className="text-sm text-muted-foreground">
                One hub for every place guests can find what you'd love
              </p>
            </div>
            <div className="flex items-center gap-2">
              {links.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyAllLinks}
                  className="rounded-full"
                >
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  Copy all
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setEditorOpen(true);
                }}
                className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add registry
              </Button>
            </div>
          </div>
        </div>

        <div className="p-4 md:p-8 max-w-3xl space-y-6">
          {loading ? (
            <div className="text-center text-muted-foreground py-12">
              Loading…
            </div>
          ) : links.length === 0 ? (
            <div className="text-center py-20 max-w-md mx-auto">
              <div className="w-12 h-12 mx-auto rounded-full bg-secondary flex items-center justify-center mb-4">
                <Gift className="w-5 h-5 text-muted-foreground" />
              </div>
              <h3 className="font-display text-xl mb-2">Build your registry hub</h3>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                Vendora doesn't host registries — but it can be the one place
                guests find them all. Add Amazon, Crate &amp; Barrel, Zola,
                Honeyfund, a charity, or anything else with a URL.
              </p>
              <div className="rounded-sm bg-secondary/50 p-4 mb-6 max-w-sm mx-auto text-left">
                <p className="font-label text-accent flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-3 h-3" />
                  Tip
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Most modern guests prefer cash funds (Honeyfund) or charity
                  donations. Add 2–3 options and let them pick.
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
                Add your first registry
              </Button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {links.map((l) => {
                const meta = PROVIDERS.find((p) => p.value === l.provider);
                return (
                  <div
                    key={l.id}
                    className="rounded-sm border border-border bg-card p-5 flex flex-col"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <span
                          className={`inline-block text-[10px] tracking-wide uppercase font-medium px-2 py-0.5 rounded-full border ${
                            providerStyles[l.provider] ?? providerStyles.other
                          }`}
                        >
                          {meta?.label ?? l.provider}
                        </span>
                        <p className="font-display text-base mt-2 truncate">
                          {l.label}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            setEditing(l);
                            setEditorOpen(true);
                          }}
                          aria-label="Edit registry link"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={deletingId === l.id}
                          onClick={() => deleteLink(l.id)}
                          aria-label="Delete registry link"
                        >
                          {deletingId === l.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                          )}
                        </Button>
                      </div>
                    </div>
                    {l.description && (
                      <p className="text-xs text-muted-foreground leading-relaxed mb-3 line-clamp-2 flex-1">
                        {l.description}
                      </p>
                    )}
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-accent hover:underline inline-flex items-center gap-1 truncate mt-auto"
                    >
                      Open registry
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <MobileNav items={navItems} />

      {user && (
        <RegistryEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          hostId={user.id}
          editing={editing}
          nextOrder={
            links.reduce((m, l) => Math.max(m, l.display_order), -1) + 1
          }
          onSuccess={load}
        />
      )}
    </div>
  );
}

function RegistryEditor({
  open,
  onOpenChange,
  hostId,
  editing,
  nextOrder,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostId: string;
  editing: RegistryLink | null;
  nextOrder: number;
  onSuccess: () => void;
}) {
  const [provider, setProvider] = useState("amazon");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setProvider(editing?.provider ?? "amazon");
      setLabel(editing?.label ?? "");
      setUrl(editing?.url ?? "");
      setDescription(editing?.description ?? "");
    }
  }, [open, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !url.trim()) {
      toast.error("Label and URL are required");
      return;
    }
    let normalized = url.trim();
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
    try {
      // Light validation — let the user save anything that parses.
      new URL(normalized);
    } catch {
      toast.error("That doesn't look like a valid URL");
      return;
    }
    setSubmitting(true);
    const payload = {
      provider,
      label: label.trim(),
      url: normalized,
      description: description.trim() || null,
    };
    const { error } = editing
      ? await linksTable().update(payload).eq("id", editing.id)
      : await linksTable().insert({
          ...payload,
          host_id: hostId,
          display_order: nextOrder,
        });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Registry updated" : "Registry added");
    onOpenChange(false);
    onSuccess();
  }

  const meta = PROVIDERS.find((p) => p.value === provider);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {editing ? "Edit registry" : "Add a registry"}
          </DialogTitle>
          <DialogDescription>
            We just store the link — guests open it in a new tab.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="r-provider">Type</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger id="r-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label} <span className="text-muted-foreground">· {p.hint}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="r-label">Display name</Label>
            <Input
              id="r-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={
                provider === "honeyfund"
                  ? "Our honeymoon fund"
                  : provider === "charity"
                    ? "Donate in our names"
                    : "Our home registry"
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="r-url">URL</Label>
            <Input
              id="r-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={meta?.cta ? `https://${meta.cta}/...` : "https://"}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="r-desc">Description (optional)</Label>
            <Textarea
              id="r-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short note for guests."
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
              <Heart className="w-3.5 h-3.5 mr-1" />
              {editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
