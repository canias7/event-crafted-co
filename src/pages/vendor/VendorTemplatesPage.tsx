import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, Sparkles, FileText, Edit2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { SubNavTabs } from "@/components/shared/SubNavTabs";
import { VENDOR_LIBRARY_HUB_TABS } from "@/data/hubTabs";
import { vendorNavItems as navItems } from "@/data/navItems";

const templatesTable = () => supabase.from("vendor_message_templates");

interface TemplateRow {
  id: string;
  name: string;
  body: string;
  updated_at: string;
}

export default function VendorTemplatesPage() {
  const { user, vendorMemberships } = useAuth();
  const vendorId = vendorMemberships[0]?.vendor_id ?? null;
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateRow | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    if (vendorId) {
      const { data } = await templatesTable()
        .select("id, name, body, updated_at")
        .eq("vendor_id", vendorId)
        .order("name", { ascending: true });
      setRows((data as TemplateRow[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, vendorId]);

  async function deleteTemplate(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    const { error } = await templatesTable().delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="font-display text-xl">Reply templates</h1>
              <p className="text-sm text-muted-foreground">
                Reusable replies you can drop into any inquiry
              </p>
            </div>
            <Button
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
              disabled={!vendorId}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              <Plus className="w-4 h-4 mr-2" />
              New template
            </Button>
          </div>
          <SubNavTabs tabs={VENDOR_LIBRARY_HUB_TABS} />
        </div>

        <div className="p-4 md:p-8 max-w-3xl space-y-6">
          {loading ? (
            <Skeleton className="h-48 w-full rounded-sm" />
          ) : !vendorId ? (
            <div className="rounded-sm border border-border bg-card p-8 text-center">
              <p className="font-display text-xl mb-2">
                Set up your business profile first
              </p>
              <p className="text-sm text-muted-foreground">
                Templates are per-vendor. Finish your profile to start
                creating reusable replies.
              </p>
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-sm border border-border bg-card p-8 text-center">
              <FileText className="w-10 h-10 mx-auto text-muted-foreground/40 mb-4" />
              <p className="font-display text-xl mb-2">No templates yet</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6 leading-relaxed">
                Save your most-used responses (intro, pricing breakdown,
                "tell me more" follow-up) and drop them into any inquiry
                with one click.
              </p>
              <div className="rounded-sm bg-secondary/40 p-4 max-w-md mx-auto text-left mb-6">
                <p className="font-label text-accent flex items-center gap-1.5 mb-1.5">
                  <Sparkles className="w-3 h-3" />
                  Tip
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  When the AI agent ships, your templates become the
                  strongest signal we have for matching your tone.
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
              {rows.map((t) => (
                <div
                  key={t.id}
                  className="rounded-sm border border-border bg-card p-5"
                >
                  <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                    <p className="font-display text-base">{t.name}</p>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs rounded-full"
                        onClick={() => {
                          setEditing(t);
                          setEditorOpen(true);
                        }}
                      >
                        <Edit2 className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => deleteTemplate(t.id)}
                        aria-label="Delete template"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap line-clamp-3">
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
        <TemplateEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          vendorId={vendorId}
          editing={editing}
          onSuccess={load}
        />
      )}
    </div>
  );
}

function TemplateEditor({
  open,
  onOpenChange,
  vendorId,
  editing,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  editing: TemplateRow | null;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setBody(editing?.body ?? "");
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
      ? await templatesTable().update(payload).eq("id", editing.id)
      : await templatesTable().insert({ vendor_id: vendorId, ...payload });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Template updated" : "Template saved");
    onOpenChange(false);
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {editing ? "Edit template" : "New template"}
          </DialogTitle>
          <DialogDescription className="text-sm">
            Templates are private to your vendor account.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="template-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Intro reply, Pricing breakdown, Decline polite…"
              className="h-10"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="template-body">
              Body <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="template-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Write the message exactly as you'd send it. You can edit before sending."
              required
            />
          </div>
          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="rounded-full"
            >
              <X className="w-3.5 h-3.5 mr-1.5" />
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
