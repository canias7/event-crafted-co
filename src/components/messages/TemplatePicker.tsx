import { useEffect, useState } from "react";
import { ChevronDown, FileText, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const templatesTable = () => supabase.from("vendor_message_templates");

interface Template {
  id: string;
  name: string;
  body: string;
}

interface Props {
  vendorId: string | null;
  onPick: (body: string) => void;
}

export function TemplatePicker({ vendorId, onPick }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;
    templatesTable()
      .select("id, name, body")
      .eq("vendor_id", vendorId)
      .order("name", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setTemplates((data as Template[]) ?? []);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  if (!vendorId) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-full text-muted-foreground"
        >
          <FileText className="w-3.5 h-3.5 mr-1.5" />
          Templates
          <ChevronDown className="w-3 h-3 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="font-label text-muted-foreground">
          Insert a template
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!loaded ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            Loading…
          </div>
        ) : templates.length === 0 ? (
          <div className="px-3 py-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              <p className="text-sm font-medium">No templates yet</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Save your most-used replies — they'll show up here.
            </p>
          </div>
        ) : (
          templates.map((t) => (
            <DropdownMenuItem
              key={t.id}
              onClick={() => onPick(t.body)}
              className="cursor-pointer flex flex-col items-start gap-0.5"
            >
              <span className="text-sm font-medium">{t.name}</span>
              <span className="text-xs text-muted-foreground line-clamp-1 w-full">
                {t.body.slice(0, 80)}…
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
