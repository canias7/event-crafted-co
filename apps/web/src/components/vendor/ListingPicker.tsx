// Shared listing-picker dropdown. Two vendor surfaces use it today
// (Calendar + Leads) to scope their queries to ONE of the vendor's
// listings at a time. Both pages preselect the first APPROVED listing
// on mount; pending / rejected listings render in the dropdown so
// the vendor sees them but can't choose them — picking a pending
// listing would surface a calendar / leads view that doesn't have
// any meaningful data yet.

import { useTranslation } from "react-i18next";
import { Check, ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCategoryNames } from "@/lib/categoryNames";

export interface ListingOpt {
  id: string;
  business_name: string | null;
  category: string | null;
  location: string | null;
  application_status: "pending" | "approved" | "rejected" | null;
  logo_url: string | null;
  /**
   * Default sales tax percentage for this listing's invoice
   * template. Optional on the type so older code paths that select
   * fewer columns still compile.
   */
  default_tax_pct?: number | null;
}

// `status` names the label in listingEditor's listingPicker.status.
function statusBadge(s: ListingOpt["application_status"]) {
  if (s === "approved")
    return { status: "live", bg: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" };
  if (s === "rejected")
    return { status: "rejected", bg: "hsl(var(--destructive) / 0.1)", color: "hsl(var(--destructive))" };
  return { status: "pending", bg: "hsl(var(--pending))", color: "hsl(var(--accent))" };
}

export function ListingPicker({
  listings,
  loading,
  selectedId,
  onSelect,
  open,
  onOpenChange,
}: {
  listings: ListingOpt[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useTranslation("listingEditor");
  const categoryNames = useCategoryNames();
  // Category names as shown; the stored English one stays on the row.
  const categoryLabel = (category: string | null) =>
    category ? categoryNames.sub(category) : category;
  const selected = listings.find((l) => l.id === selectedId) ?? null;
  const selLabel =
    selected?.business_name?.trim() ||
    categoryLabel(selected?.category ?? null) ||
    t("listingPicker.pick");
  const selSub = selected
    ? [categoryLabel(selected.category), selected.location].filter(Boolean).join(" · ")
    : null;
  const selBadge = selected ? statusBadge(selected.application_status) : null;

  if (loading) {
    return <Skeleton className="h-16 w-full rounded-2xl" />;
  }

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.18em] font-medium text-muted-foreground mb-2">
        {t("listingPicker.label")}
      </p>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors"
            style={{
              background: "#ffffff",
              border: "1px solid hsl(var(--border))",
            }}
          >
            <span className="flex items-center gap-3 min-w-0 flex-1">
              <span
                className="w-9 h-9 rounded-full shrink-0 overflow-hidden inline-flex items-center justify-center text-xs font-medium"
                style={{
                  background: "rgba(0,0,0,0.08)",
                  color: "#14161a",
                }}
              >
                {selected?.logo_url ? (
                  <img
                    src={selected.logo_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  (selLabel.charAt(0) || "L").toUpperCase()
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-foreground truncate">
                  {selLabel}
                </span>
                {selSub ? (
                  <span className="block text-xs text-muted-foreground truncate">
                    {selSub}
                  </span>
                ) : null}
              </span>
              {selBadge ? (
                <span
                  className="text-[10px] uppercase tracking-wider font-medium rounded-full px-2 py-0.5 shrink-0"
                  style={{ background: selBadge.bg, color: selBadge.color }}
                >
                  {t(`listingPicker.status.${selBadge.status}`)}
                </span>
              ) : null}
            </span>
            <ChevronDown
              className={cn(
                "w-4 h-4 text-muted-foreground shrink-0 transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0 overflow-hidden"
          align="start"
        >
          <Command>
            <CommandInput placeholder={t("listingPicker.search")} className="h-11" />
            <CommandList>
              <CommandEmpty>{t("listingPicker.empty")}</CommandEmpty>
              <CommandGroup>
                {listings.map((l) => {
                  const label =
                    l.business_name?.trim() ||
                    categoryLabel(l.category) ||
                    t("listingPicker.untitled");
                  const sub = [categoryLabel(l.category), l.location]
                    .filter(Boolean)
                    .join(" · ");
                  const badge = statusBadge(l.application_status);
                  // Only approved listings can be selected — pending /
                  // rejected listings render here so the vendor sees
                  // them, but they aren't actionable.
                  const isApproved = l.application_status === "approved";
                  return (
                    <CommandItem
                      key={l.id}
                      value={`${label} ${sub}`}
                      disabled={!isApproved}
                      onSelect={isApproved ? () => onSelect(l.id) : undefined}
                      className={!isApproved ? "opacity-60" : undefined}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
                          selectedId === l.id
                            ? "opacity-100 text-accent"
                            : "opacity-0",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-foreground truncate">
                          {label}
                        </span>
                        {sub ? (
                          <span className="block text-xs text-muted-foreground truncate">
                            {sub}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className="text-[10px] uppercase tracking-wider font-medium rounded-full px-2 py-0.5 shrink-0 ml-2"
                        style={{ background: badge.bg, color: badge.color }}
                      >
                        {t(`listingPicker.status.${badge.status}`)}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
