import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  Compass,
  CreditCard,
  Inbox,
  MessageSquare,
  Search,
  Settings,
  Sparkles,
  Store,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useAuth } from "@/hooks/useAuth";
import { useVendors } from "@/hooks/useVendors";

interface NavTarget {
  label: string;
  hint?: string;
  path: string;
  icon: LucideIcon;
}

const PUBLIC_NAV: NavTarget[] = [
  { label: "Browse vendors", hint: "Directory", path: "/vendors", icon: Store },
  { label: "Browse by location", hint: "Cities", path: "/vendors/locations", icon: Store },
];

// Mirrors mobile host bottom nav (Explore / Inbox / Events / Profile).
// All the planning-workspace surfaces (Guests / Seating / Mood boards /
// Registry / Tasks / Checklist / Payments / Planning team / etc.) are
// gone — keep the palette in sync.
const HOST_NAV: NavTarget[] = [
  { label: "Explore", path: "/customer/explore", icon: Compass },
  { label: "Inbox", path: "/customer/inquiries", icon: MessageSquare },
  { label: "Events", path: "/customer/events", icon: CalendarDays },
  { label: "Profile", path: "/customer/profile", icon: User },
];

// Mirrors live vendor portal routes — only surfaces that still resolve.
// Leads / Calendar / VendoraPay are tabs inside the My Vendora wrapper
// (the standalone routes redirect to it). Listing /vendor/leads etc. as
// separate entries would still work via the redirect, but using the
// wrapper URL directly keeps the URL pretty and the tab pre-selected.
const VENDOR_NAV: NavTarget[] = [
  { label: "Profile", path: "/vendor/me", icon: User },
  { label: "Inquiry inbox", path: "/vendor/inbox", icon: Inbox },
  { label: "Leads", path: "/vendor/my-vendora?view=leads", icon: Users },
  { label: "Calendar", path: "/vendor/my-vendora?view=calendar", icon: CalendarDays },
  { label: "VendoraPay", path: "/vendor/my-vendora?view=vendorapay", icon: CreditCard },
  { label: "Partners", path: "/vendor/partners", icon: MessageSquare },
  { label: "Studio", path: "/vendor/studio", icon: Store },
];

const SETTINGS_NAV: NavTarget[] = [
  { label: "Settings", path: "/settings", icon: Settings },
];

export function CommandPalette({ initialOpen = false }: { initialOpen?: boolean } = {}) {
  const [open, setOpen] = useState(initialOpen);
  const navigate = useNavigate();
  const { profile, hasVendorAccess, hasHostAccess } = useAuth();
  const { vendors } = useVendors();

  // Cmd/Ctrl + K toggles the palette globally.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function go(path: string) {
    setOpen(false);
    navigate(path);
  }

  // Use the source-of-truth flags from useAuth. With the one-role-
  // per-email rule, host access requires onboarded_at to be set; a
  // pure vendor signup doesn't get host nav (and vice versa).
  const isHost = hasHostAccess;
  const isVendor = hasVendorAccess;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search vendors, pages…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>

        {vendors.length > 0 && (
          <CommandGroup heading="Vendors">
            {vendors.slice(0, 8).map((v) => (
              <CommandItem
                key={`vendor-${v.id}`}
                value={`vendor ${v.name} ${v.category} ${v.location ?? ""}`}
                onSelect={() => go(`/vendors/${v.id}`)}
              >
                <Store className="mr-2 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{v.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {v.category}
                    {v.location ? ` · ${v.location}` : ""}
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />
        <CommandGroup heading="Public">
          {PUBLIC_NAV.map((n) => (
            <NavRow key={n.path} item={n} onSelect={() => go(n.path)} />
          ))}
        </CommandGroup>

        {isHost && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Customer">
              {HOST_NAV.map((n) => (
                <NavRow key={n.path} item={n} onSelect={() => go(n.path)} />
              ))}
            </CommandGroup>
          </>
        )}

        {isVendor && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Vendor">
              {VENDOR_NAV.map((n) => (
                <NavRow key={n.path} item={n} onSelect={() => go(n.path)} />
              ))}
            </CommandGroup>
          </>
        )}

        {profile && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Account">
              {SETTINGS_NAV.map((n) => (
                <NavRow key={n.path} item={n} onSelect={() => go(n.path)} />
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

function NavRow({
  item,
  onSelect,
}: {
  item: NavTarget;
  onSelect: () => void;
}) {
  const Icon = item.icon;
  return (
    <CommandItem
      value={`nav ${item.label} ${item.hint ?? ""}`}
      onSelect={onSelect}
    >
      <Icon className="mr-2 text-muted-foreground" />
      <span className="flex-1">{item.label}</span>
      {item.hint && (
        <span className="text-xs text-muted-foreground">{item.hint}</span>
      )}
    </CommandItem>
  );
}

// Optional UI trigger — lets pages render a clickable hint that opens the
// palette without needing the keyboard shortcut. The component just dispatches
// a synthetic Cmd+K event.
export function CommandPaletteTrigger({
  className,
}: {
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "k",
            metaKey: true,
            ctrlKey: true,
          }),
        );
      }}
      className={
        className ??
        "inline-flex items-center gap-2 px-3 h-9 rounded-full border border-border bg-card text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
      }
      aria-label="Open search"
    >
      <Search className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">Search</span>
      <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-secondary text-[10px] font-mono">
        ⌘K
      </kbd>
    </button>
  );
}

