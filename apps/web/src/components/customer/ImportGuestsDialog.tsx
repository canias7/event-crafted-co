import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Bulk-import guests via paste. Supports CSV with optional header row,
// or one name per line. The parser intentionally tolerates messy input
// (commas inside quotes, blank lines, mixed line endings) so hosts can
// paste from spreadsheets without preflight cleanup.

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostId: string;
  onSuccess: () => void;
}

export function ImportGuestsDialog({
  open,
  onOpenChange,
  hostId,
  onSuccess,
}: Props) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function parseRows(input: string) {
    // Accept either CSV (commas) or simple line-by-line (just names).
    // Header detection: if first row starts with "name," treat as header.
    const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];
    const hasHeader = /^name(,|$)/i.test(lines[0]);
    const dataLines = hasHeader ? lines.slice(1) : lines;
    return dataLines
      .map((line) => {
        const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
        const [name, email, phone, group, plus] = parts;
        if (!name) return null;
        return {
          name,
          email: email || null,
          phone: phone || null,
          group_label: group || null,
          plus_one_allowed: /^(yes|true|1|y)$/i.test(plus ?? ""),
        };
      })
      .filter(Boolean) as Array<{
        name: string;
        email: string | null;
        phone: string | null;
        group_label: string | null;
        plus_one_allowed: boolean;
      }>;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const rows = parseRows(text);
    if (rows.length === 0) {
      toast.error("No valid guest rows found");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase
      .from("event_guests")
      .insert(rows.map((r) => ({ ...r, host_id: hostId })));
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      `Imported ${rows.length} ${rows.length === 1 ? "guest" : "guests"}`,
    );
    setText("");
    onOpenChange(false);
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-editorial text-3xl">
            Import guests
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="import-text">
              Paste CSV or one name per line
            </Label>
            <Textarea
              id="import-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              placeholder={`name,email,phone,group,plus_one_allowed\nSarah Mitchell,sarah@example.com,,Bride's family,yes\nJames Park,james@example.com,5551234567,Groom's family,yes\n\n— or —\n\nSarah Mitchell\nJames Park`}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Optional header row. Columns: name, email, phone, group,
              plus_one_allowed (yes/no). Only name is required.
            </p>
          </div>
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
              disabled={submitting || !text.trim()}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Import
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
