import { useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Switch } from "@/components/ui/switch";

// Granular email + push notification toggles. Stored as jsonb on
// profiles.notification_prefs (added in 20260504200000). Background
// scanners check the relevant key before sending.

interface Prefs {
  new_inquiry: boolean;
  proposal_viewed: boolean;
  proposal_accepted: boolean;
  review_received: boolean;
  weekly_digest: boolean;
  daily_digest: boolean;
  marketing: boolean;
}

const DEFAULTS: Prefs = {
  new_inquiry: true,
  proposal_viewed: true,
  proposal_accepted: true,
  review_received: true,
  weekly_digest: true,
  daily_digest: true,
  marketing: false,
};

const ROWS: Array<{ key: keyof Prefs; label: string; description: string }> = [
  {
    key: "new_inquiry",
    label: "New inquiry replies",
    description:
      "When a vendor responds to your inquiry, or when a host inquires about your services.",
  },
  {
    key: "proposal_viewed",
    label: "Proposal opened",
    description: "When a host opens a proposal you sent.",
  },
  {
    key: "proposal_accepted",
    label: "Proposal accepted",
    description: "When a host accepts a proposal you sent.",
  },
  {
    key: "review_received",
    label: "New review received",
    description: "When a host posts a review on your profile.",
  },
  {
    key: "daily_digest",
    label: "Daily digest",
    description:
      "One email per day with everything that happened — replaces realtime emails when on.",
  },
  {
    key: "weekly_digest",
    label: "Weekly performance summary",
    description:
      "Vendor-only: how your profile performed this week (views, inquiries, conversions).",
  },
  {
    key: "marketing",
    label: "Product updates + tips",
    description:
      "Occasional emails about new features, vendor spotlights, and planning tips. Off by default.",
  },
];

export function NotificationPreferencesCard() {
  const { user, profile, refreshProfile } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [saving, setSaving] = useState<keyof Prefs | null>(null);

  useEffect(() => {
    if (!profile) return;
    const fromProfile =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (profile as any).notification_prefs as Partial<Prefs> | null | undefined;
    setPrefs({ ...DEFAULTS, ...(fromProfile ?? {}) });
  }, [profile]);

  async function toggle(key: keyof Prefs, value: boolean) {
    if (!user) return;
    setSaving(key);
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ notification_prefs: next })
      .eq("id", user.id);
    setSaving(null);
    if (error) {
      toast.error(error.message);
      // Revert optimistic update.
      setPrefs(prefs);
      return;
    }
    refreshProfile();
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium mb-1 inline-flex items-center gap-2">
          <Bell className="w-3.5 h-3.5" />
          Email notifications
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Choose which emails Vendora sends you. Auth emails (verify
          your email, password reset) always go through regardless.
        </p>
      </div>

      <ul className="rounded-sm border border-border bg-card divide-y divide-border">
        {ROWS.map((row) => (
          <li
            key={row.key}
            className="flex items-start justify-between gap-4 p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{row.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {row.description}
              </p>
            </div>
            <div className="flex items-center gap-2 pt-0.5">
              {saving === row.key && (
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              )}
              <Switch
                checked={prefs[row.key]}
                onCheckedChange={(v) => toggle(row.key, v)}
                disabled={saving !== null}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
