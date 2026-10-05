import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
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

// Section names, field labels, suffixes and preset options in the
// visitor's language (locales/<language>/vendorProfileParts.json,
// keyed by the English text). The stored values stay English; a
// vendor's own custom tag isn't in the list and shows as typed.
type AttributeNames = Record<"section" | "label" | "suffix" | "option", (text: string) => string>;

function useAttributeNames(): AttributeNames {
  const { t, i18n } = useTranslation("vendorProfileParts");
  const language = i18n.resolvedLanguage;
  return useMemo(() => {
    const lookup = (group: string) => {
      const names = t(`attributes.${group}`, { returnObjects: true }) as unknown;
      return (text: string) =>
        names && typeof names === "object" && Object.prototype.hasOwnProperty.call(names, text)
          ? String((names as Record<string, unknown>)[text])
          : text;
    };
    return {
      section: lookup("sections"),
      label: lookup("labels"),
      suffix: lookup("suffixes"),
      option: lookup("options"),
    };
  }, [t, language]);
}

export function CategoryAttributesDisplay({
  vendorId,
  category,
}: {
  vendorId: string;
  category: string;
}) {
  const { t } = useTranslation("vendorProfile");
  const names = useAttributeNames();
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

  if (!schema) return null;
  // Schema exists but the attrs fetch is still in flight — hold the
  // layout with a skeleton so the section doesn't pop in late.
  if (!attrs) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-64" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-24 rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  // Skip sections scoped to other subs in the group, then keep only
  // those with at least one populated field.
  const populatedSections = schema.sections
    .filter((s) => !s.onlySubs || s.onlySubs.includes(category))
    .filter((s) => s.fields.some((f) => hasValue(attrs[f.key])));

  if (populatedSections.length === 0) return null;

  return (
    <div className="space-y-7">
      <h2 className="font-editorial text-3xl sm:text-4xl text-foreground">
        {t("attributes.title", { category: category.toLowerCase() })}
      </h2>
      <div className="grid sm:grid-cols-2 gap-x-10 gap-y-7">
        {populatedSections.map((section) => (
          <SectionDisplay key={section.name} section={section} attrs={attrs} names={names} />
        ))}
      </div>
    </div>
  );
}

function SectionDisplay({
  section,
  attrs,
  names,
}: {
  section: CategorySection;
  attrs: Attrs;
  names: AttributeNames;
}) {
  const populated = section.fields.filter((f) => hasValue(attrs[f.key]));
  if (populated.length === 0) return null;

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.18em] font-medium text-muted-foreground mb-3">
        {names.section(section.name)}
      </p>
      <dl className="space-y-2.5 text-sm">
        {populated.map((field) => (
          <FieldDisplay key={field.key} field={field} value={attrs[field.key]} names={names} />
        ))}
      </dl>
    </div>
  );
}

function FieldDisplay({
  field,
  value,
  names,
}: {
  field: AttributeField;
  value: AttrValue;
  names: AttributeNames;
}) {
  const label = names.label(field.label);
  if (field.type === "currency" && typeof value === "number") {
    return (
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="font-medium tnum tabular-nums">{formatCents(value)}</dd>
      </div>
    );
  }

  if (field.type === "int" && typeof value === "number") {
    return (
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="font-medium tnum tabular-nums">
          {value}
          {field.suffix ? ` ${names.suffix(field.suffix)}` : ""}
        </dd>
      </div>
    );
  }

  if (field.type === "boolean" && value === true) {
    return (
      <div className="flex items-center gap-2">
        <Check className="w-3.5 h-3.5 text-accent shrink-0" />
        <dt className="text-foreground">{label}</dt>
      </div>
    );
  }

  if (field.type === "tags") {
    const tags = (value as string[] | undefined) ?? [];
    if (tags.length === 0) return null;
    return (
      <div>
        <dt className="text-foreground mb-2">{label}</dt>
        <dd className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex text-[13px] rounded-full px-4 py-1.5"
              style={{
                background: "rgba(0,0,0,0.12)",
                color: "#14161a",
                border: "0.5px solid rgba(0,0,0,0.3)",
              }}
            >
              {names.option(t)}
            </span>
          ))}
        </dd>
      </div>
    );
  }

  if (field.type === "select" && typeof value === "string" && value) {
    return (
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="font-medium">{names.option(value)}</dd>
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
