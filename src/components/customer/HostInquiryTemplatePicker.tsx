import { useEffect, useState } from "react";
import {
  Bookmark,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Drop-in companion for any host inquiry message field.
//
// Renders next to a Textarea: a "Use template" dropdown to insert a
// saved body, plus "Save current as template" to capture what's
// currently in the field. Manage page lives at /settings/templates
// (or wherever) — for now we just expose CRUD inline via the dialog.

interface HostTemplate {
  id: string;
  name: string;
  body: string;
  is_default: boolean;
  use_count: number;
}

export function HostInquiryTemplatePicker({
  currentBody,
  onApply,
}: {
  currentBody: string;
  onApply: (body: string) => void;
}) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<HostTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [editing, setEditing] = useState<HostTemplate | null>(null);

  async function load() {
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("host_inquiry_templates")
      .select("id, name, body, is_default, use_count")
      .eq("host_id", user.id);
    setTemplates((data as HostTemplate[]) ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    if (user && !loaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loaded]);

  async function applyTemplate(t: HostTemplate) {
    onApply(t.body);
    toast.success(`Inserted "${t.name}"`);
    // Bump use_count async, ignore failure.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("host_inquiry_templates")
      .update({ use_count: t.use_count + 1 })
      .eq("id", t.id);
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this template?")) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("host_inquiry_templates")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deleted");
    load();
  }

  if (!user) return null;

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full h-8"
            >
              <Bookmark className="w-3 h-3 mr-1.5" />
              Use template
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 max-h-80 overflow-y-auto">
            <DropdownMenuLabel className="text-xs">Saved templates</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {templates.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-3 text-center">
                No templates yet. Save your current message to start.
              </p>
            ) : (
              templates.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center group"
                >
                  <DropdownMenuItem
                    onClick={() => applyTemplate(t)}
                    className="flex-1 flex-col items-start gap-0.5"
                  >
                    <span className="text-sm font-medium inline-flex items-center gap-1.5">
                      {t.is_default && (
                        <Check className="w-3 h-3 text-accent" />
                      )}
                      {t.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground line-clamp-2 w-full">
                      {t.body}
                    </span>
                  </DropdownMenuItem>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(t);
                      setSaveOpen(true);
                    }}
                    className="p-2 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
                    aria-label="Edit"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(t.id);
                    }}
                    className="p-2 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
                    aria-label="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-full h-8"
          onClick={() => {
            setEditing(null);
            setSaveOpen(true);
          }}
          disabled={!currentBody.trim() && templates.length === 0}
        >
          <Plus className="w-3 h-3 mr-1.5" />
          Save as template
        </Button>
      </div>

      <SaveDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        defaultBody={editing?.body ?? currentBody}
        editing={editing}
        onSaved={() => {
          load();
          setEditing(null);
        }}
      />
    </>
  );
}

function SaveDialog({
  open,
  onOpenChange,
  defaultBody,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultBody: string;
  editing: HostTemplate | null;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setBody(editing?.body ?? defaultBody);
      setIsDefault(editing?.is_default ?? false);
    }
  }, [open, editing, defaultBody]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !name.trim() || !body.trim()) {
      toast.error("Name and body required");
      return;
    }
    setSubmitting(true);
    const payload = {
      host_id: user.id,
      name: name.trim(),
      body: body.trim(),
      is_default: isDefault,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const op = editing
      ? sb.from("host_inquiry_templates").update(payload).eq("id", editing.id)
      : sb.from("host_inquiry_templates").insert(payload);
    const { error } = await op;
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Updated" : "Saved");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {editing ? "Edit template" : "Save template"}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Reuse this message body the next time you reach out to a vendor.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="t-name">Template name</Label>
            <Input
              id="t-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Backyard wedding pitch"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-body">Message body</Label>
            <Textarea
              id="t-body"
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded"
            />
            Use as default for new inquiries
          </label>
          <DialogFooter className="gap-2 sm:gap-0">
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
              {editing ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
