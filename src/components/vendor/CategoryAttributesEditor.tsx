import { useEffect, useState } from "react";
import { Loader2, ListPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  type AttributeField,
  getCategorySchema,
} from "@/data/categoryAttributes";

// Vendor-side editor for the category-specific structured fields.
// Loads the schema from src/data/categoryAttributes.ts based on the
// vendor's category, renders one form section per schema section,
// and saves into vendor_profiles.category_attributes jsonb.
//
// Renders nothing for categories without a schema (yet) — those
// vendors just keep the global profile fields. As more categories
// get schemas, this component picks them up automatically.

type AttrValue = string | number | boolean | string[] | null | undefined;
type Attrs = Record<string, AttrValue>;

export function CategoryAttributesEditor({
  vendorId,
  category,
  canEdit,
}: {
  vendorId: string;
  category: string;
  canEdit: boolean;
}) {
  const schema = getCategorySchema(category);
  const [attrs, setAttrs] = useState<Attrs>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!schema || !vendorId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("vendor_profiles")
        .select("category_attributes")
        .eq("id", vendorId)
        .maybeSingle();
      if (cancelled) return;
      const loaded = (data?.category_attributes as Attrs | null) ?? {};
      setAttrs(loaded);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId, schema]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_profiles")
      .update({ category_attributes: attrs })
      .eq("id", vendorId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${category} details saved`);
  }

  function setField(key: string, value: AttrValue) {
    setAttrs((prev) => ({ ...prev, [key]: value }));
  }

  function toggleTag(key: string, option: string) {
    setAttrs((prev) => {
      const current = (prev[key] as string[] | undefined) ?? [];
      const next = current.includes(option)
        ? current.filter((x) => x !== option)
        : [...current, option];
      return { ...prev, [key]: next };
    });
  }

  if (!schema) return null;
  if (loading) {
    return <p className="text-xs text-muted-foreground py-3">Loading…</p>;
  }

  // Sections without `onlySubs` apply to every sub in the group;
  // sub-specific sections only render for the matching sub.
  const visibleSections = schema.sections.filter(
    (s) => !s.onlySubs || s.onlySubs.includes(category),
  );

  return (
    <div>
      <div className="mb-4">
        <p className="font-label text-muted-foreground inline-flex items-center gap-1.5">
          <ListPlus className="w-3 h-3" />
          {category} details
        </p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Fields specific to your category — these surface on your public
          profile and let hosts filter the directory by what matters.
        </p>
      </div>

      {canEdit ? (
        <form onSubmit={save} className="space-y-6">
          {visibleSections.map((section) => (
            <fieldset key={section.name} className="space-y-3">
              <legend className="text-sm font-medium mb-2">
                {section.name}
              </legend>
              {section.fields.map((field) => (
                <FieldEditor
                  key={field.key}
                  field={field}
                  value={attrs[field.key]}
                  onChange={(v) => setField(field.key, v)}
                  onToggleTag={(opt) => toggleTag(field.key, opt)}
                />
              ))}
            </fieldset>
          ))}
          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={saving}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save {category.toLowerCase()} details
            </Button>
          </div>
        </form>
      ) : (
        <div className="text-xs text-muted-foreground italic py-3">
          Read-only — only the vendor owner can edit these.
        </div>
      )}
    </div>
  );
}

function FieldEditor({
  field,
  value,
  onChange,
  onToggleTag,
}: {
  field: AttributeField;
  value: AttrValue;
  onChange: (v: AttrValue) => void;
  onToggleTag: (option: string) => void;
}) {
  if (field.type === "currency") {
    const dollars = typeof value === "number" ? Math.round(value / 100) : "";
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`f-${field.key}`}>{field.label}</Label>
        <Input
          id={`f-${field.key}`}
          type="number"
          inputMode="decimal"
          min={0}
          value={dollars}
          onChange={(e) => {
            const n = Number.parseFloat(e.target.value);
            onChange(
              Number.isFinite(n) ? Math.round(n * 100) : null,
            );
          }}
          placeholder="$"
        />
        {field.help && (
          <p className="text-xs text-muted-foreground">{field.help}</p>
        )}
      </div>
    );
  }

  if (field.type === "int") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`f-${field.key}`}>{field.label}</Label>
        <div className="flex items-center gap-2">
          <Input
            id={`f-${field.key}`}
            type="number"
            inputMode="numeric"
            min={field.min}
            max={field.max}
            value={typeof value === "number" ? value : ""}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              onChange(Number.isFinite(n) ? n : null);
            }}
            placeholder=""
          />
          {field.suffix && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {field.suffix}
            </span>
          )}
        </div>
        {field.help && (
          <p className="text-xs text-muted-foreground">{field.help}</p>
        )}
      </div>
    );
  }

  if (field.type === "boolean") {
    return (
      <div className="flex items-center justify-between gap-3 py-1">
        <div className="min-w-0">
          <Label className="text-sm font-normal cursor-pointer">
            {field.label}
          </Label>
          {field.help && (
            <p className="text-xs text-muted-foreground mt-0.5">{field.help}</p>
          )}
        </div>
        <Switch
          checked={Boolean(value)}
          onCheckedChange={(v) => onChange(v)}
        />
      </div>
    );
  }

  if (field.type === "tags") {
    const selected = (value as string[] | undefined) ?? [];
    return (
      <div className="space-y-1.5">
        <Label>{field.label}</Label>
        {field.help && (
          <p className="text-xs text-muted-foreground">{field.help}</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {field.options.map((opt) => {
            const active = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onToggleTag(opt)}
                className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                  active
                    ? "bg-foreground text-background border-foreground"
                    : "bg-transparent text-muted-foreground border-border hover:border-foreground/30"
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`f-${field.key}`}>{field.label}</Label>
        <select
          id={`f-${field.key}`}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full h-10 px-3 rounded-sm border border-border bg-background text-sm"
        >
          <option value="">—</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {field.help && (
          <p className="text-xs text-muted-foreground">{field.help}</p>
        )}
      </div>
    );
  }

  return null;
}
