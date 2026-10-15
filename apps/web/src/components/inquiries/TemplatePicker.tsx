// "Templates" chip above the vendor's chat composer (owner's call, Oct
// 2026). Lists the listing's saved replies (vendor_message_templates,
// managed on /vendor/templates); picking one puts its text in the
// message box to edit before sending. Nothing is sent from here.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface TemplateRow {
  id: string;
  name: string;
  body: string;
}

export function TemplatePicker({
  vendorId,
  onPick,
}: {
  vendorId: string;
  onPick: (body: string) => void;
}) {
  const { t } = useTranslation("vendorTemplates");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<TemplateRow[] | null>(null);

  // Load on each open so templates edited in another tab show up.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setRows(null);
    void supabase
      .from("vendor_message_templates")
      .select("id, name, body")
      .eq("vendor_id", vendorId)
      .order("updated_at", { ascending: false })
      .then(({ data }) => {
        if (alive) setRows((data ?? []) as TemplateRow[]);
      });
    return () => {
      alive = false;
    };
  }, [open, vendorId]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-xs font-bold bg-card border border-border rounded-full px-3 py-1.5 hover:bg-muted"
        >
          <FileText className="w-3.5 h-3.5 text-accent" />
          {t("picker.button")}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-[min(22rem,calc(100vw-2.5rem))] p-2 rounded-xl">
        {rows === null ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="m-0 px-2 py-3 text-sm text-foreground">{t("picker.empty")}</p>
        ) : (
          <ul className="m-0 p-0 list-none max-h-72 overflow-y-auto">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(r.body);
                    setOpen(false);
                  }}
                  className="w-full text-left rounded-lg px-3 py-2 hover:bg-muted transition-colors"
                >
                  <span className="block text-sm font-bold text-foreground truncate">{r.name}</span>
                  <span className="block text-xs text-muted-foreground line-clamp-2">{r.body}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-1 border-t border-border px-3 pt-2 pb-1">
          <Link to="/vendor/templates" className="text-xs font-bold text-foreground hover:text-accent">
            {t("picker.manage")}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
