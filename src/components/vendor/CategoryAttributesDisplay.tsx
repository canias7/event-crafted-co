import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCents } from "@/lib/format";
import {
  type AttributeField,
  type CategorySection,
  getCategorySchema,
} from "@/data/categoryAttributes";

// Public-facing renderer for the structured per-category fields.
// Renders one section per schema section, formatting values according
// to field type (currency, int with suffix, boolean as ✓/✗, tags as
// chips). Only shows fields that have a value — empty stays hidden.
//
// Renders nothing for categories without a schema, or when the vendor
// hasn't filled in any structured fields yet.

type AttrValue = string | number | boolean | string[] | null | undefined;
type Attrs = Record<string, AttrValue>;

export function CategoryAttributesDisplay({
  vendorId,
  category,
}: {
  vendorId: string;
  category: string;
}) {
  const schema = getCategorySchema(category);
  const [attrs, setAttrs] = useState<Attrs | null>(null);

  useEffect(() => {
    if (!schema || !vendorId) return;
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("vendor_profiles")
        .select("category_attributes")
        .eq("id", vendorId)
        .maybeSingle();
      if (cancelled) return;
      setAttrs((data?.category_attributes as Attrs | null) ?? {});
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId, schema]);

  if (!schema || !attrs) return null;

  // Filter sections to only those with at least one populated field.
  const populatedSections = schema.sections.filter((s) =>
    s.fields.some((f) => hasValue(attrs[f.key])),
  );

  if (populatedSections.length === 0) return null;

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl">About this {category.toLowerCase()}</h2>
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-6">
        {populatedSections.map((section) => (
          <SectionDisplay key={section.name} section={section} attrs={attrs} />
        ))}
      </div>
    </div>
  );
}

function SectionDisplay({
  section,
  attrs,
}: {
  section: CategorySection;
  attrs: Attrs;
}) {
  const populated = section.fields.filter((f) => hasValue(attrs[f.key]));
  if (populated.length === 0) return null;

  return (
    <div>
      <p className="font-label text-muted-foreground mb-3">{section.name}</p>
      <dl className="space-y-2 text-sm">
        {populated.map((field) => (
          <FieldDisplay key={field.key} field={field} value={attrs[field.key]} />
        ))}
      </dl>
    </div>
  );
}

function FieldDisplay({
  field,
  value,
}: {
  field: AttributeField;
  value: AttrValue;
}) {
  if (field.type === "currency" && typeof value === "number") {
    return (
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-muted-foreground">{field.label}</dt>
        <dd className="font-medium tnum tabular-nums">{formatCents(value)}</dd>
      </div>
    );
  }

  if (field.type === "int" && typeof value === "number") {
    return (
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-muted-foreground">{field.label}</dt>
        <dd className="font-medium tnum tabular-nums">
          {value}
          {field.suffix ? ` ${field.suffix}` : ""}
        </dd>
      </div>
    );
  }

  if (field.type === "boolean" && value === true) {
    return (
      <div className="flex items-center gap-2">
        <Check className="w-3.5 h-3.5 text-accent shrink-0" />
        <dt className="text-foreground">{field.label}</dt>
      </div>
    );
  }

  if (field.type === "tags") {
    const tags = (value as string[] | undefined) ?? [];
    if (tags.length === 0) return null;
    return (
      <div>
        <dt className="text-muted-foreground mb-1.5">{field.label}</dt>
        <dd className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex text-xs bg-secondary text-secondary-foreground rounded-full px-2.5 py-0.5"
            >
              {t}
            </span>
          ))}
        </dd>
      </div>
    );
  }

  if (field.type === "select" && typeof value === "string" && value) {
    return (
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-muted-foreground">{field.label}</dt>
        <dd className="font-medium">{value}</dd>
      </div>
    );
  }

  return null;
}

function hasValue(v: AttrValue): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  return false;
}
