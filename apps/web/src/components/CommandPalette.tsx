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
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useVendors } from "@/hooks/useVendors";
import { useCategoryNames } from "@/lib/categoryNames";

// `labelKey` and `hintKey` name the text under command_palette.pages /
// command_palette.hints in the shell namespace (locales/<lang>/shell.json).
interface NavTarget {
  labelKey: string;
  hintKey?: string;
  path: string;
  icon: LucideIcon;
}

const PUBLIC_NAV: NavTarget[] = [
  { labelKey: "browse_vendors", hintKey: "directory", path: "/vendors", icon: Store },
  { labelKey: "browse_by_location", hintKey: "cities", path: "/vendors/locations", icon: Store },
];

// Mirrors mobile host bottom nav (Explore / Inbox / Events / Profile).
// All the planning-workspace surfaces (Guests / Seating / Mood boards /
// Registry / Tasks / Checklist / Payments / Planning team / etc.) are
// gone — keep the palette in sync.
const HOST_NAV: NavTarget[] = [
  { labelKey: "explore", path: "/customer/explore", icon: Compass },
  { labelKey: "inbox", path: "/customer/inquiries", icon: MessageSquare },
  { labelKey: "events", path: "/customer/events", icon: CalendarDays },
  { labelKey: "profile", path: "/customer/profile", icon: User },
];

// Mirrors live vendor portal routes — only surfaces that still resolve.
// Inquiry inbox IS the leads/triage hub (the My Vendora "Leads" tab
// got dropped because it duplicated this surface). Calendar is a
// sub-tab inside My Vendora.
const VENDOR_NAV: NavTarget[] = [
  { labelKey: "profile", path: "/vendor/me", icon: User },
  { labelKey: "inquiry_inbox", path: "/vendor/inbox", icon: Inbox },
  { labelKey: "overview", path: "/vendor/overview", icon: CreditCard },
  { labelKey: "calendar", path: "/vendor/appointments", icon: CalendarDays },
  { labelKey: "partners", path: "/vendor/partners", icon: MessageSquare },
];

const SETTINGS_NAV: NavTarget[] = [
  { labelKey: "settings", path: "/settings", icon: Settings },
];

export function CommandPalette({ initialOpen = false }: { initialOpen?: boolean } = {}) {
  const { t } = useTranslation("shell");
  const categoryNames = useCategoryNames();
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
      <CommandInput placeholder={t("command_palette.placeholder")} />
      <CommandList>
        <CommandEmpty>{t("command_palette.empty")}</CommandEmpty>

        {vendors.length > 0 && (
          <CommandGroup heading={t("command_palette.groups.vendors")}>
            {vendors.slice(0, 8).map((v) => {
              // Shown in the visitor's language; the search value keeps the
              // stored English name too, so either one matches.
              const category = categoryNames.sub(v.category);
              const categoryValue =
                category === v.category ? v.category : `${v.category} ${category}`;
              return (
                <CommandItem
                  key={`vendor-${v.id}`}
                  value={`vendor ${v.name} ${categoryValue} ${v.location ?? ""}`}
                  onSelect={() => go(`/vendors/${v.id}`)}
                >
                  <Store className="mr-2 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{v.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {category}
                      {v.location ? ` · ${v.location}` : ""}
                    </div>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        <CommandSeparator />
        <CommandGroup heading={t("command_palette.groups.public")}>
          {PUBLIC_NAV.map((n) => (
            <NavRow key={n.path} item={n} onSelect={() => go(n.path)} />
          ))}
        </CommandGroup>

        {isHost && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("command_palette.groups.customer")}>
              {HOST_NAV.map((n) => (
                <NavRow key={n.path} item={n} onSelect={() => go(n.path)} />
              ))}
            </CommandGroup>
          </>
        )}

        {isVendor && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("command_palette.groups.vendor")}>
              {VENDOR_NAV.map((n) => (
                <NavRow key={n.path} item={n} onSelect={() => go(n.path)} />
              ))}
            </CommandGroup>
          </>
        )}

        {profile && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("command_palette.groups.account")}>
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
  const { t } = useTranslation("shell");
  const Icon = item.icon;
  const label = t(`command_palette.pages.${item.labelKey}`);
  const hint = item.hintKey ? t(`command_palette.hints.${item.hintKey}`) : undefined;
  return (
    <CommandItem
      value={`nav ${label} ${hint ?? ""}`}
      onSelect={onSelect}
    >
      <Icon className="mr-2 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      {hint && (
        <span className="text-xs text-muted-foreground">{hint}</span>
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
  const { t } = useTranslation("shell");
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
        "inline-flex items-center gap-2 px-3 h-9 rounded-full border border-border bg-card text-xs text-muted-foreground hover:text-accent hover:border-foreground/30 transition-colors"
      }
      aria-label={t("command_palette.open_search")}
    >
      <Search className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">{t("command_palette.search")}</span>
      <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-secondary text-[10px] font-mono">
        ⌘K
      </kbd>
    </button>
  );
}

