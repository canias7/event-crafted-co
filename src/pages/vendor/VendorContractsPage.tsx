import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Edit2,
  FileText,
  Star,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { SubNavTabs } from "@/components/shared/SubNavTabs";
import { VENDOR_LIBRARY_HUB_TABS } from "@/data/hubTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { vendorNavItems as navItems } from "@/data/navItems";

interface ContractTemplate {
  id: string;
  name: string;
  body: string;
  is_default: boolean;
  updated_at: string;
}

const SAMPLE_BODY = `# Service Agreement

This agreement is between [Vendor Business] ("Vendor") and the client booking the event ("Client").

## Scope of Work
The Vendor will provide [photography / florals / catering / etc.] services for the event date specified in the accepted proposal.

## Payment
A non-refundable deposit of 25% is due to secure the date. Remaining balance is due 14 days before the event.

## Cancellation
Deposits are non-refundable but transferable to a new date with at least 60 days' notice, subject to availability.

## Liability
The Vendor's total liability is limited to the amount paid under this agreement.
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tplTable = () => (supabase as any).from("vendor_contract_templates");

export default function VendorContractsPage() {
  const { user, vendorMemberships } = useAuth();
  const vendorId = vendorMemberships[0]?.vendor_id ?? null;

  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ContractTemplate | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    if (!user || !vendorId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await tplTable()
      .select("id, name, body, is_default, updated_at")
      .eq("vendor_id", vendorId)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true });
    setTemplates((data as ContractTemplate[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, vendorId]);

  async function setDefault(id: string) {
    if (!vendorId) return;
    // Clear current default first to honor the partial unique index.
    await tplTable()
      .update({ is_default: false })
      .eq("vendor_id", vendorId)
      .eq("is_default", true);
    const { error } = await tplTable()
      .update({ is_default: true })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Default contract updated");
    load();
  }

  async function deleteTemplate(id: string) {
    setDeletingId(id);
    const { error } = await tplTable().delete().eq("id", id);
    setDeletingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    toast.success("Template deleted");
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="font-display text-xl">Contracts</h1>
              <p className="text-sm text-muted-foreground">
                Reusable contract templates · attach to any proposal
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
              disabled={!vendorId}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New template
            </Button>
          </div>
          <SubNavTabs tabs={VENDOR_LIBRARY_HUB_TABS} />
        </div>

        <div className="p-4 md:p-8 max-w-3xl space-y-6">
          {loading ? (
            <div className="text-center text-muted-foreground py-12">
              Loading…
            </div>
          ) : !vendorId ? (
            <div className="text-center py-20 max-w-md mx-auto">
              <p className="font-display text-xl mb-2">
                Set up your vendor profile first
              </p>
              <p className="text-sm text-muted-foreground">
                Templates live per-vendor; finish your profile to start
                creating reusable contracts.
              </p>
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-16 max-w-md mx-auto">
              <FileText className="w-10 h-10 mx-auto text-muted-foreground/40 mb-4" />
              <h3 className="font-display text-xl mb-2">No templates yet</h3>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                Save a contract template once, attach it to every proposal in
                one click. The default template auto-prefills new proposals.
              </p>
              <div className="rounded-sm bg-secondary/50 p-4 max-w-sm mx-auto text-left mb-6">
                <p className="font-label text-accent flex items-center gap-1.5 mb-1.5">
                  <Sparkles className="w-3 h-3" />
                  Tip
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Markdown headings + bullets render cleanly on the host
                  side. Keep it short — most hosts skim.
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
                Create your first template
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="rounded-sm border border-border bg-card p-5"
                >
                  <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-display text-base flex items-center gap-2">
                        {t.name}
                        {t.is_default && (
                          <Badge className="bg-accent/15 text-accent border border-accent/30">
                            <Star className="w-3 h-3 mr-1 fill-accent" />
                            Default
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Updated {new Date(t.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {!t.is_default && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs rounded-full"
                          onClick={() => setDefault(t.id)}
                        >
                          <Star className="w-3 h-3 mr-1" />
                          Make default
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditing(t);
                          setEditorOpen(true);
                        }}
                        aria-label="Edit template"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={deletingId === t.id}
                        onClick={() => deleteTemplate(t.id)}
                        aria-label="Delete template"
                      >
                        {deletingId === t.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-foreground/80 leading-relaxed line-clamp-3 whitespace-pre-wrap">
                    {t.body}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <MobileNav items={navItems} />

      {vendorId && (
        <ContractEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          vendorId={vendorId}
          editing={editing}
          firstTemplate={templates.length === 0}
          onSuccess={load}
        />
      )}
    </div>
  );
}

function ContractEditor({
  open,
  onOpenChange,
  vendorId,
  editing,
  firstTemplate,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  editing: ContractTemplate | null;
  firstTemplate: boolean;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "Standard service agreement");
      setBody(editing?.body ?? SAMPLE_BODY);
    }
  }, [open, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !body.trim()) {
      toast.error("Name and body are required");
      return;
    }
    setSubmitting(true);
    const payload = {
      name: name.trim(),
      body: body.trim(),
    };
    const { error } = editing
      ? await tplTable().update(payload).eq("id", editing.id)
      : await tplTable().insert({
          vendor_id: vendorId,
          // First template auto-marks as default so newcomer vendors don't
          // have to think about it.
          is_default: firstTemplate,
          ...payload,
        });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Template saved" : "Template added");
    onOpenChange(false);
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {editing ? "Edit contract template" : "New contract template"}
          </DialogTitle>
          <DialogDescription>
            Markdown-friendly. Hosts see the rendered version when reviewing
            a proposal.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="c-name">Name</Label>
            <Input
              id="c-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-body">Contract body</Label>
            <Textarea
              id="c-body"
              rows={16}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Markdown headings (#) and bullets (-) render cleanly. Plain
              text works too.
            </p>
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
              {editing ? "Save changes" : "Save template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
