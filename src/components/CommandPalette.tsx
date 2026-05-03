import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  CheckSquare,
  CreditCard,
  FileText,
  Heart,
  Image,
  Inbox,
  LayoutDashboard,
  ListTodo,
  Mail,
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
import {
  fetchInspirationEntries,
  inspirationEntries,
  type InspirationEntry,
} from "@/data/inspiration";

interface NavTarget {
  label: string;
  hint?: string;
  path: string;
  icon: LucideIcon;
}

const PUBLIC_NAV: NavTarget[] = [
  { label: "Browse vendors", hint: "Directory", path: "/vendors", icon: Store },
  {
    label: "Inspiration",
    hint: "Real events",
    path: "/inspiration",
    icon: Sparkles,
  },
  {
    label: "How it works",
    hint: "Public",
    path: "/how-it-works",
    icon: FileText,
  },
  {
    label: "Become a vendor",
    hint: "Apply",
    path: "/vendor-apply",
    icon: Store,
  },
];

const HOST_NAV: NavTarget[] = [
  {
    label: "Customer dashboard",
    path: "/customer/dashboard",
    icon: LayoutDashboard,
  },
  { label: "My inquiries", path: "/customer/inquiries", icon: MessageSquare },
  { label: "Guests", path: "/customer/guests", icon: User },
  { label: "Appointments", path: "/customer/appointments", icon: CalendarDays },
  { label: "Event details", path: "/customer/event", icon: FileText },
  { label: "Invitations", path: "/customer/invitations", icon: Mail },
  { label: "Checklist", path: "/customer/checklist", icon: CheckSquare },
  { label: "Tasks", path: "/customer/tasks", icon: ListTodo },
  { label: "Payments", path: "/customer/payments", icon: CreditCard },
  { label: "Saved vendors", path: "/customer/favorites", icon: Heart },
  { label: "Saved searches", path: "/customer/saved-searches", icon: Store },
  { label: "Mood boards", path: "/customer/moodboards", icon: Image },
];

const VENDOR_NAV: NavTarget[] = [
  {
    label: "Vendor dashboard",
    path: "/vendor/dashboard",
    icon: LayoutDashboard,
  },
  { label: "Inquiry inbox", path: "/vendor/inbox", icon: Inbox },
  { label: "Reply templates", path: "/vendor/templates", icon: FileText },
  { label: "Vendor profile", path: "/vendor/profile", icon: User },
  { label: "Team", path: "/vendor/team", icon: Users },
  { label: "Appointments", path: "/vendor/appointments", icon: CalendarDays },
  { label: "Availability", path: "/vendor/availability", icon: CalendarDays },
];

const ADMIN_NAV: NavTarget[] = [
  { label: "Admin dashboard", path: "/admin/dashboard", icon: LayoutDashboard },
  { label: "All vendors", path: "/admin/vendors", icon: Store },
  { label: "All inquiries", path: "/admin/inquiries", icon: MessageSquare },
  { label: "Reviews moderation", path: "/admin/reviews", icon: CheckSquare },
  { label: "Inspiration CMS", path: "/admin/inspiration", icon: Sparkles },
];

const SETTINGS_NAV: NavTarget[] = [
  { label: "Settings", path: "/settings", icon: Settings },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { profile, vendorMemberships } = useAuth();
  const { vendors } = useVendors();
  const [inspiration, setInspiration] = useState<InspirationEntry[]>(
    inspirationEntries,
  );

  // Hydrate inspiration from DB so admin-published entries are searchable.
  useEffect(() => {
    let cancelled = false;
    fetchInspirationEntries().then((fetched) => {
      if (cancelled) return;
      if (fetched.length > 0) setInspiration(fetched);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const isHost = profile?.role === "host";
  const isAdmin = profile?.role === "admin";
  const isVendor =
    profile?.role === "vendor" || vendorMemberships.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search vendors, inspiration, pages…" />
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

        {inspiration.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Inspiration">
              {inspiration.slice(0, 6).map((entry) => (
                <CommandItem
                  key={`insp-${entry.slug}`}
                  value={`inspiration ${entry.title} ${entry.eventTypeLabel} ${entry.location}`}
                  onSelect={() => go(`/inspiration/${entry.slug}`)}
                >
                  <Sparkles className="mr-2 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{entry.title}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {entry.eventTypeLabel}
                      {entry.location ? ` · ${entry.location}` : ""}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
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

        {isAdmin && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Admin">
              {ADMIN_NAV.map((n) => (
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

