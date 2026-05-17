import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, ListPlus, Check } from "lucide-react";
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
// Style intent: Turo / Airbnb amenity grids — soft pills, tight
// vertical rhythm, every tag field gets an inline "+" affordance for
// custom entries (the schema's `allowCustom` flag is no longer the
// gate — every tags field accepts vendor-typed extras now).

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

  return (
    <div>
      <div className="mb-6">
        <p className="font-label text-muted-foreground inline-flex items-center gap-1.5">
          <ListPlus className="w-3 h-3" />
          {category} details
        </p>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
          Tell hosts what your space and offering includes — these
          surface on your public listing and let hosts filter the
          directory by what matters.
        </p>
      </div>

      {canEdit ? (
        <form onSubmit={save} className="space-y-10">
          <CategoryAttributesFields
            category={category}
            attrs={attrs}
            onChange={setAttrs}
          />
          <div className="flex justify-end pt-4 border-t border-border">
            <Button
              type="submit"
              disabled={saving}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save details
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

// Stateless renderer for the category-specific structured fields.
// Used both by CategoryAttributesEditor (DB-backed editor on the
// profile page) and ListingWizardModal (in-memory state during
// listing creation). Sections without `onlySubs` apply to every sub
// in the group; sub-specific sections only render for the matching
// sub.
export function CategoryAttributesFields({
  category,
  attrs,
  onChange,
}: {
  category: string;
  attrs: Attrs;
  onChange: (next: Attrs) => void;
}) {
  const schema = getCategorySchema(category);
  if (!schema) return null;

  const visibleSections = schema.sections.filter(
    (s) => !s.onlySubs || s.onlySubs.includes(category),
  );

  function setField(key: string, value: AttrValue) {
    onChange({ ...attrs, [key]: value });
  }

  function toggleTag(key: string, option: string) {
    const current = (attrs[key] as string[] | undefined) ?? [];
    const next = current.includes(option)
      ? current.filter((x) => x !== option)
      : [...current, option];
    onChange({ ...attrs, [key]: next });
  }

  return (
    <>
      {visibleSections.map((section, idx) => (
        <fieldset
          key={section.name}
          className={
            idx === 0
              ? "space-y-5"
              : "space-y-5 pt-8 border-t border-border"
          }
        >
          <legend className="font-display text-base">{section.name}</legend>
          <div className="space-y-6">
            {section.fields.map((field) => (
              <FieldEditor
                key={field.key}
                field={field}
                value={attrs[field.key]}
                onChange={(v) => setField(field.key, v)}
                onToggleTag={(opt) => toggleTag(field.key, opt)}
              />
            ))}
          </div>
        </fieldset>
      ))}
    </>
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
      <div className="space-y-2 max-w-sm">
        <Label htmlFor={`f-${field.key}`} className="text-sm font-medium">
          {field.label}
        </Label>
        <Input
          id={`f-${field.key}`}
          type="number"
          inputMode="decimal"
          min={0}
          value={dollars}
          onChange={(e) => {
            const n = Number.parseFloat(e.target.value);
            onChange(Number.isFinite(n) ? Math.round(n * 100) : null);
          }}
          placeholder="$"
          className="h-10"
        />
        {field.help && (
          <p className="text-xs text-muted-foreground">{field.help}</p>
        )}
      </div>
    );
  }

  if (field.type === "int") {
    return (
      <div className="space-y-2 max-w-sm">
        <Label htmlFor={`f-${field.key}`} className="text-sm font-medium">
          {field.label}
        </Label>
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
            className="h-10"
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
      <div className="flex items-center justify-between gap-4 py-1">
        <div className="min-w-0">
          <Label className="text-sm font-medium cursor-pointer">
            {field.label}
          </Label>
          {field.help && (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {field.help}
            </p>
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
    // Custom (vendor-added) entries = anything in `selected` that
    // isn't part of the preset options. Rendered with a subtle
    // accent tint so the vendor can see what's hand-typed.
    const customSelected = selected.filter(
      (s) => !field.options.includes(s),
    );
    return (
      <div className="space-y-3">
        <div>
          <Label className="text-sm font-medium">{field.label}</Label>
          {field.help && (
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {field.help}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {field.options.map((opt) => {
            const active = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onToggleTag(opt)}
                className={`text-xs rounded-full px-3 py-1.5 border transition-all inline-flex items-center gap-1.5 ${
                  active
                    ? "bg-accent/15 text-accent border-accent/40 hover:border-accent/60"
                    : "bg-card text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground"
                }`}
                aria-pressed={active}
              >
                {active && <Check className="w-3 h-3" />}
                {opt}
              </button>
            );
          })}
          {customSelected.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onToggleTag(opt)}
              className="text-xs rounded-full px-3 py-1.5 border bg-accent/15 text-accent border-accent/40 hover:bg-accent/25 transition-colors inline-flex items-center gap-1.5"
              title="Custom entry — click to remove"
            >
              <Check className="w-3 h-3" />
              {opt}
            </button>
          ))}
          {/* Add-custom affordance — every tags field gets this now,
              so vendors can list anything specific to their space
              without us having to add an enum value to the schema. */}
          <CustomTagButton
            onAdd={(custom) => {
              if (!selected.includes(custom)) onToggleTag(custom);
            }}
          />
        </div>
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="space-y-2 max-w-sm">
        <Label htmlFor={`f-${field.key}`} className="text-sm font-medium">
          {field.label}
        </Label>
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

// "+" pill that expands inline into a small input on click. Click ✓
// or press Enter to commit; click outside or Esc to collapse. Sits in
// the same flex row as the preset chips so it reads as part of the
// pill cluster, not a separate form row.
function CustomTagButton({ onAdd }: { onAdd: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function commit() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setEditing(false);
      return;
    }
    onAdd(trimmed);
    setDraft("");
    // Stay open — vendors usually add 2-3 customs in a row.
    inputRef.current?.focus();
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setEditing(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="text-xs rounded-full px-3 py-1.5 border border-dashed border-border bg-transparent text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors inline-flex items-center gap-1.5"
        aria-label="Add a custom option"
      >
        <Plus className="w-3 h-3" />
        Add other
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-foreground/40 bg-card pl-3 pr-1 py-0.5">
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setEditing(false);
            setDraft("");
          }
        }}
        onBlur={() => {
          if (!draft.trim()) setEditing(false);
        }}
        placeholder="Type and press Enter"
        className="text-xs bg-transparent outline-none border-0 w-40 placeholder:text-muted-foreground/60"
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={commit}
        disabled={!draft.trim()}
        className="w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Add"
      >
        <Check className="w-3 h-3" />
      </button>
    </span>
  );
}
