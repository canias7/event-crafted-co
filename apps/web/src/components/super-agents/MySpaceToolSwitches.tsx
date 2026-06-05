// My Space tool switches — lets the vendor turn individual chatbox
// tools on/off. Disabled tools are dropped from the tool list sent to
// Claude on every turn (see my-space-chat/streaming.ts), so a trimmed
// set means fewer tokens in the cached tools prefix and sharper tool
// selection.
//
// Persistence: profiles.my_space_disabled_tools — a JSONB array of the
// tool names that are OFF. Empty/unset = every tool on. We cast the
// supabase calls because the column post-dates the generated types;
// the cast goes away on the next type regen.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  ChevronRight,
  CreditCard,
  FileText,
  Image as ImageIcon,
  Inbox,
  Loader2,
  Lock,
  Settings2,
  Sparkles,
  Store,
  UserCircle2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ToolDef {
  name: string;
  label: string;
  /** Sends money/messages off-platform — confirmation-gated server-side. */
  sensitive?: boolean;
}

interface ToolGroup {
  title: string;
  Icon: typeof Inbox;
  tools: ToolDef[];
}

// Mirrors the built-in tools in my-space-chat/tools-schemas.ts. Custom
// webhook tools are managed separately (they have their own is_active
// flag) and aren't listed here.
const TOOL_GROUPS: ToolGroup[] = [
  {
    title: "Inbox & inquiries",
    Icon: Inbox,
    tools: [
      { name: "search_inquiries", label: "Search inquiries" },
      { name: "get_inquiry", label: "Get inquiry detail" },
      { name: "search_messages", label: "Search messages" },
      { name: "summarize_inquiry_thread", label: "Summarize a thread" },
      { name: "list_recent_notifications", label: "List notifications" },
      { name: "send_host_reply", label: "Send a host reply", sensitive: true },
      { name: "bulk_send_reply", label: "Bulk-send replies", sensitive: true },
      { name: "update_inquiry_status", label: "Update inquiry status" },
      { name: "bulk_update_inquiry_status", label: "Bulk-update statuses" },
      { name: "mark_notifications_read", label: "Mark notifications read" },
    ],
  },
  {
    title: "Calendar & appointments",
    Icon: Calendar,
    tools: [
      { name: "check_availability", label: "Check availability" },
      { name: "manage_appointment", label: "Manage appointments" },
      { name: "manage_calendar", label: "Block/unblock dates" },
    ],
  },
  {
    title: "Money & billing",
    Icon: CreditCard,
    tools: [
      { name: "create_payment_link", label: "Create payment link", sensitive: true },
      { name: "create_invoice", label: "Create invoice" },
      { name: "manage_invoice", label: "Manage invoices" },
      { name: "manage_expense", label: "Track expenses" },
    ],
  },
  {
    title: "Documents & contacts",
    Icon: FileText,
    tools: [
      { name: "create_document", label: "Create contract/proposal" },
      { name: "list_documents", label: "List documents" },
      { name: "manage_contact", label: "Manage contacts" },
    ],
  },
  {
    title: "Profile & business content",
    Icon: UserCircle2,
    tools: [
      { name: "get_business_info", label: "Look up business info" },
      { name: "update_profile", label: "Edit profile" },
      { name: "manage_faq", label: "Manage FAQs" },
      { name: "manage_package", label: "Manage packages" },
      { name: "manage_knowledge", label: "Manage knowledge facts" },
      { name: "set_chat_preferences", label: "Set chat preferences" },
    ],
  },
  {
    title: "Listings & portfolio",
    Icon: Store,
    tools: [
      { name: "manage_listing", label: "Manage listing lifecycle" },
      { name: "list_listings", label: "List listings" },
      { name: "set_active_listing", label: "Switch active listing" },
      { name: "add_portfolio_image", label: "Add portfolio image" },
    ],
  },
  {
    title: "Images",
    Icon: ImageIcon,
    tools: [{ name: "edit_image", label: "Edit / restyle an image" }],
  },
  {
    title: "Automation, analytics & email",
    Icon: Sparkles,
    tools: [
      { name: "toggle_auto_reply", label: "Toggle auto-reply settings" },
      { name: "manage_scheduled_action", label: "Schedule future actions" },
      { name: "get_sales_analytics", label: "Sales analytics" },
      { name: "send_email", label: "Send an email", sensitive: true },
    ],
  },
];

const ALL_TOOL_NAMES = TOOL_GROUPS.flatMap((g) => g.tools.map((t) => t.name));

export function MySpaceToolSwitches() {
  const { user } = useAuth();
  const [disabled, setDisabled] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    // Cast: my_space_disabled_tools post-dates the generated types.
    const { data, error } = await (supabase as any)
      .from("profiles")
      .select("my_space_disabled_tools")
      .eq("id", user.id)
      .maybeSingle();
    if (!error && data) {
      const raw = data.my_space_disabled_tools;
      setDisabled(new Set(Array.isArray(raw) ? (raw as string[]) : []));
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = async (next: Set<string>, name: string) => {
    if (!user?.id) return;
    const prev = disabled;
    setDisabled(next);
    setSavingName(name);
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ my_space_disabled_tools: Array.from(next) })
      .eq("id", user.id);
    setSavingName(null);
    if (error) {
      setDisabled(prev); // roll back
      console.error("[MySpaceToolSwitches] save failed", error);
      toast.error("Couldn't save that switch. Try again.");
    }
  };

  const toggle = (name: string, enabled: boolean) => {
    const next = new Set(disabled);
    if (enabled) next.delete(name);
    else next.add(name);
    void persist(next, name);
  };

  const setAll = (enabled: boolean) => {
    const next = enabled ? new Set<string>() : new Set(ALL_TOOL_NAMES);
    void persist(next, "__all__");
  };

  const enabledCount = useMemo(
    () => ALL_TOOL_NAMES.length - disabled.size,
    [disabled],
  );

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-medium">My Space tools</h3>
            <p className="text-xs text-muted-foreground">
              {loading
                ? "Loading…"
                : `${enabledCount} of ${ALL_TOOL_NAMES.length} on · off tools are dropped from every chat turn (cheaper, sharper).`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {savingName ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          ) : null}
          <button
            type="button"
            onClick={() => setAll(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            All on
          </button>
          <span className="text-border">·</span>
          <button
            type="button"
            onClick={() => setAll(false)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            All off
          </button>
        </div>
      </div>

      <div className="divide-y divide-border/40">
        {TOOL_GROUPS.map((group) => {
          const onCount = group.tools.filter((t) => !disabled.has(t.name)).length;
          return (
            <Collapsible key={group.title} defaultOpen={false}>
              <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                <span className="flex items-center gap-2">
                  <group.Icon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{group.title}</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {onCount}/{group.tools.length}
                  <ChevronRight className="w-4 h-4 transition-transform group-data-[state=open]:rotate-90" />
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-3 space-y-2.5">
                  {group.tools.map((tool) => (
                    <div
                      key={tool.name}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm truncate">{tool.label}</span>
                        {tool.sensitive ? (
                          <Lock
                            className="w-3 h-3 text-amber-500 shrink-0"
                            aria-label="Sends money or messages — confirmation-gated"
                          />
                        ) : null}
                      </div>
                      <Switch
                        checked={!disabled.has(tool.name)}
                        onCheckedChange={(v) => toggle(tool.name, v)}
                        disabled={loading || savingName === "__all__"}
                        aria-label={`Toggle ${tool.label}`}
                      />
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
