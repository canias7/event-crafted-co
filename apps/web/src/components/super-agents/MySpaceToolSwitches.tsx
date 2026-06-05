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
  Info,
  Loader2,
  Lock,
  Settings2,
  Sparkles,
  Store,
  UserCircle2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  /** Plain-language explanation shown in the info tooltip. */
  desc: string;
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
      {
        name: "search_inquiries",
        label: "Search inquiries",
        desc: "Find and filter your host inquiries by name, event type, date, or status.",
      },
      {
        name: "get_inquiry",
        label: "Get inquiry detail",
        desc: "Pull the full detail of one inquiry, including its recent messages.",
      },
      {
        name: "search_messages",
        label: "Search messages",
        desc: "Full-text search across all of your host conversations.",
      },
      {
        name: "summarize_inquiry_thread",
        label: "Summarize a thread",
        desc: "Condense a long conversation into a few key bullet points.",
      },
      {
        name: "list_recent_notifications",
        label: "List notifications",
        desc: "Read your latest notifications — new inquiries, hot-lead alerts, replies.",
      },
      {
        name: "send_host_reply",
        label: "Send a host reply",
        desc: "Send a message to a host in the conversation thread.",
        sensitive: true,
      },
      {
        name: "bulk_send_reply",
        label: "Bulk-send replies",
        desc: "Send the same message to several host threads at once.",
        sensitive: true,
      },
      {
        name: "update_inquiry_status",
        label: "Update inquiry status",
        desc: "Mark an inquiry as replied, closed, or declined.",
      },
      {
        name: "bulk_update_inquiry_status",
        label: "Bulk-update statuses",
        desc: "Set the same status on multiple inquiries in one go.",
      },
      {
        name: "mark_notifications_read",
        label: "Mark notifications read",
        desc: "Clear unread notifications, individually or all at once.",
      },
    ],
  },
  {
    title: "Calendar & appointments",
    Icon: Calendar,
    tools: [
      {
        name: "check_availability",
        label: "Check availability",
        desc: "Check whether you're free on a given date.",
      },
      {
        name: "manage_appointment",
        label: "Manage appointments",
        desc: "Create, update, or respond to appointments with hosts.",
      },
      {
        name: "manage_calendar",
        label: "Block/unblock dates",
        desc: "Mark dates unavailable or reopen them on your calendar.",
      },
    ],
  },
  {
    title: "Money & billing",
    Icon: CreditCard,
    tools: [
      {
        name: "create_payment_link",
        label: "Create payment link",
        desc: "Create a shareable payment link — deposit, balance, or retainer.",
        sensitive: true,
      },
      {
        name: "create_invoice",
        label: "Create invoice",
        desc: "Build a line-item invoice with tax and totals calculated for you.",
      },
      {
        name: "manage_invoice",
        label: "Manage invoices",
        desc: "List your invoices or email one to its contact.",
      },
      {
        name: "manage_expense",
        label: "Track expenses",
        desc: "Record and review your business expenses.",
      },
    ],
  },
  {
    title: "Documents & contacts",
    Icon: FileText,
    tools: [
      {
        name: "create_document",
        label: "Create contract/proposal",
        desc: "Draft a sendable contract or proposal from text.",
      },
      {
        name: "list_documents",
        label: "List documents",
        desc: "See the contracts and proposals you've sent and their status.",
      },
      {
        name: "manage_contact",
        label: "Manage contacts",
        desc: "View, add, or update your saved customers and contacts.",
      },
    ],
  },
  {
    title: "Profile & business content",
    Icon: UserCircle2,
    tools: [
      {
        name: "get_business_info",
        label: "Look up business info",
        desc: "Look up your FAQs, portfolio, reviews, appointments, and past bookings.",
      },
      {
        name: "update_profile",
        label: "Edit profile",
        desc: "Edit your business name, bio, location, or pricing.",
      },
      {
        name: "manage_faq",
        label: "Manage FAQs",
        desc: "Add, edit, or remove your FAQ entries.",
      },
      {
        name: "manage_knowledge",
        label: "Manage knowledge facts",
        desc: "Save durable facts about your business — pricing rules, brand voice, policies.",
      },
      {
        name: "set_chat_preferences",
        label: "Set chat preferences",
        desc: "Save standing preferences applied to every future My Space chat.",
      },
    ],
  },
  {
    title: "Listings & portfolio",
    Icon: Store,
    tools: [
      {
        name: "manage_listing",
        label: "Manage listing lifecycle",
        desc: "Check your listing's status or submit it for review.",
      },
      {
        name: "list_listings",
        label: "List listings",
        desc: "See the listings this account can manage.",
      },
      {
        name: "set_active_listing",
        label: "Switch active listing",
        desc: "Choose which listing My Space works on.",
      },
      {
        name: "add_portfolio_image",
        label: "Add portfolio image",
        desc: "Add an image to your public portfolio gallery.",
      },
    ],
  },
  {
    title: "Images",
    Icon: ImageIcon,
    tools: [
      {
        name: "edit_image",
        label: "Edit / restyle an image",
        desc: "Restyle or edit an image you provide using AI.",
      },
    ],
  },
  {
    title: "Automation, analytics & email",
    Icon: Sparkles,
    tools: [
      {
        name: "toggle_auto_reply",
        label: "Toggle auto-reply settings",
        desc: "Turn the inbox auto-reply agent and its options on or off.",
      },
      {
        name: "manage_scheduled_action",
        label: "Schedule future actions",
        desc: "Schedule, list, or cancel actions to run later.",
      },
      {
        name: "get_sales_analytics",
        label: "Sales analytics",
        desc: "Pull revenue reports and month-by-month breakdowns.",
      },
      {
        name: "send_email",
        label: "Send an email",
        desc: "Send an email to a contact on your behalf.",
        sensitive: true,
      },
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
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label={`What "${tool.label}" does`}
                              className="shrink-0 text-muted-foreground/50 hover:text-foreground transition-colors"
                            >
                              <Info className="w-3.5 h-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            align="start"
                            className="max-w-[240px] text-xs leading-snug"
                          >
                            {tool.desc}
                          </TooltipContent>
                        </Tooltip>
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
