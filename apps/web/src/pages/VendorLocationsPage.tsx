import { useMemo, useState } from "react";
import { Check, ChevronDown, MapPin } from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { VendorCard } from "@/components/shared/VendorCard";
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
import { useVendors, type Vendor } from "@/hooks/useVendors";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { cn } from "@/lib/utils";

const ALL_CITIES = "__all__";

// Title-case "brooklyn, ny" → "Brooklyn, NY". Tolerant of mixed case.
function normalizeLocation(loc: string): string {
  const trimmed = loc.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) {
    return parts[0]
      .split(" ")
      .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
      .join(" ");
  }
  const city = parts[0]
    .split(" ")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
  const state = parts[1].length === 2 ? parts[1].toUpperCase() : parts[1];
  return `${city}, ${state}`;
}

export default function VendorLocationsPage() {
  const { vendors, loading } = useVendors();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>(ALL_CITIES);

  useDocumentMeta({
    title: "Vendors by location — Vendora",
    description:
      "Browse Vendora vendors by city. Photographers, florists, venues, caterers, planners — find the team near your event.",
  });

  // Map vendors to their normalized city label so we can group, count,
  // and filter from a single derivation.
  const labelByVendor = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vendors) {
      m.set(v.id, normalizeLocation(v.location ?? v.distance ?? ""));
    }
    return m;
  }, [vendors]);

  const cities = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of vendors) {
      const k = labelByVendor.get(v.id) ?? "";
      if (!k) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [vendors, labelByVendor]);

  const filtered: Vendor[] = useMemo(() => {
    if (selected === ALL_CITIES) return vendors;
    return vendors.filter((v) => labelByVendor.get(v.id) === selected);
  }, [vendors, labelByVendor, selected]);

  const totalLocations = cities.length;
  const triggerLabel =
    selected === ALL_CITIES
      ? `All cities · ${vendors.length} ${vendors.length === 1 ? "vendor" : "vendors"}`
      : selected;

  return (
    <div className="min-h-screen public-canvas">
      <PublicNav />

      <section className="pt-32 pb-10">
        <div className="container mx-auto px-6 md:px-8 max-w-5xl">
          <p className="font-label text-accent tracking-[0.4em] mb-4">
            — VENDORS BY LOCATION
          </p>
          <h1 className="font-editorial text-5xl md:text-5xl leading-[1.05] mb-4">
            Find your team{" "}
            <span className="italic font-light text-accent">near you.</span>
          </h1>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl leading-relaxed">
            {totalLocations} {totalLocations === 1 ? "city" : "cities"} on Vendora
            today. Pick one to filter the directory.
          </p>

          {/* City picker — searchable combobox */}
          <div className="mt-8 max-w-md">
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center justify-between gap-3 rounded-full px-5 py-3 text-left transition-colors"
                  style={{
                    background: "rgba(255,253,250,0.7)",
                    border: "0.5px solid rgba(255,138,76,0.22)",
                    backdropFilter: "blur(10px)",
                    WebkitBackdropFilter: "blur(10px)",
                    boxShadow: "0 8px 24px -16px rgba(196,84,30,0.18)",
                  }}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <MapPin className="w-4 h-4 text-accent shrink-0" />
                    <span className="font-medium text-foreground truncate">
                      {triggerLabel}
                    </span>
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
                style={{
                  background: "rgba(255,253,250,0.95)",
                  border: "0.5px solid rgba(255,138,76,0.22)",
                  backdropFilter: "blur(14px)",
                  WebkitBackdropFilter: "blur(14px)",
                }}
              >
                <Command>
                  <CommandInput placeholder="Search a city…" className="h-11" />
                  <CommandList>
                    <CommandEmpty>No cities yet.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="All cities"
                        onSelect={() => {
                          setSelected(ALL_CITIES);
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selected === ALL_CITIES ? "opacity-100 text-accent" : "opacity-0",
                          )}
                        />
                        <span className="flex-1">All cities</span>
                        <span className="text-xs text-muted-foreground tnum">
                          {vendors.length}
                        </span>
                      </CommandItem>
                      {cities.map((c) => (
                        <CommandItem
                          key={c.label}
                          value={c.label}
                          onSelect={() => {
                            setSelected(c.label);
                            setOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selected === c.label ? "opacity-100 text-accent" : "opacity-0",
                            )}
                          />
                          <span className="flex-1">{c.label}</span>
                          <span className="text-xs text-muted-foreground tnum">
                            {c.count}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="container mx-auto px-6 md:px-8">
          {loading && vendors.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-8">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i}>
                  <Skeleton className="aspect-[4/3] w-full rounded-sm mb-3" />
                  <Skeleton className="h-5 w-2/3 mb-2" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 max-w-md mx-auto">
              <div className="w-12 h-12 mx-auto rounded-full bg-secondary flex items-center justify-center mb-4">
                <MapPin className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="font-editorial text-2xl mb-2">
                {selected === ALL_CITIES ? "No vendors yet" : `No vendors in ${selected}`}
              </p>
              <p className="text-sm text-muted-foreground">
                Check back as the directory grows — vendors are joining
                every week.
              </p>
            </div>
          ) : (
            <>
              <div className="max-w-5xl mx-auto mb-6 px-1">
                <p className="font-label text-muted-foreground">
                  {filtered.length}{" "}
                  {filtered.length === 1 ? "vendor" : "vendors"}
                  {selected === ALL_CITIES ? "" : ` in ${selected}`}
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-8">
                {filtered.map((v, i) => (
                  <VendorCard key={v.id} vendor={v} eager={i < 6} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
