import { useEffect, useState } from "react";
import { Loader2, Save, Filter } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

// Lead routing rules — vendor sets auto-reply + auto-decline-below
// thresholds. Backed by the trigger in migration 20260504100000;
// this card is the UI to configure them.

interface Props {
  vendorId: string;
}

export function LeadRulesCard({ vendorId }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [template, setTemplate] = useState("");
  const [floorDollars, setFloorDollars] = useState("");
  const [declineMsg, setDeclineMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("vendor_profiles")
        .select(
          "auto_reply_enabled, auto_reply_template, auto_decline_below_cents, auto_decline_message",
        )
        .eq("id", vendorId)
        .maybeSingle();
      if (cancelled) return;
      const row = data as
        | {
            auto_reply_enabled: boolean | null;
            auto_reply_template: string | null;
            auto_decline_below_cents: number | null;
            auto_decline_message: string | null;
          }
        | null;
      setEnabled(row?.auto_reply_enabled ?? false);
      setTemplate(row?.auto_reply_template ?? "");
      setFloorDollars(
        row?.auto_decline_below_cents != null
          ? String(Math.round(row.auto_decline_below_cents / 100))
          : "",
      );
      setDeclineMsg(row?.auto_decline_message ?? "");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  async function save() {
    setSaving(true);
    const cents = floorDollars
      ? Math.round(Number.parseInt(floorDollars, 10) * 100)
      : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_profiles")
      .update({
        auto_reply_enabled: enabled,
        auto_reply_template: template.trim() || null,
        auto_decline_below_cents:
          Number.isFinite(cents as number) && (cents as number) > 0
            ? cents
            : null,
        auto_decline_message: declineMsg.trim() || null,
      })
      .eq("id", vendorId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Lead rules saved");
  }

  if (loading) return null;

  return (
    <div>
      <div className="mb-3 flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
          <Filter className="w-4 h-4" />
        </div>
        <div>
          <p className="font-label text-muted-foreground">Lead routing</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Auto-reply on every inquiry · auto-decline budgets below your
            floor. Both fire instantly when an inquiry lands so hosts get
            an immediate response.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="card-soft p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-medium">Auto-reply</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Lands as a reply in the thread within seconds of the inquiry.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          {enabled && (
            <Textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={4}
              placeholder="Hi! Thanks for reaching out. I'll review your event details and follow up with availability + a tailored quote within 24 hours."
            />
          )}
        </div>

        <div className="card-soft p-4 space-y-2">
          <div>
            <Label htmlFor="lr-floor">Auto-decline below budget ($)</Label>
            <p className="text-xs text-muted-foreground leading-relaxed mb-2">
              Inquiries with a max budget below this number get a polite
              decline + are filed to your "Closed" tab. Leave blank to
              accept all budgets.
            </p>
            <Input
              id="lr-floor"
              type="number"
              min={0}
              value={floorDollars}
              onChange={(e) => setFloorDollars(e.target.value)}
              placeholder="3000"
            />
          </div>
          {floorDollars && (
            <div>
              <Label htmlFor="lr-msg">Decline message</Label>
              <Textarea
                id="lr-msg"
                value={declineMsg}
                onChange={(e) => setDeclineMsg(e.target.value)}
                rows={3}
                placeholder="Thanks for thinking of us — unfortunately we can't take projects below this budget. We wish you the best of luck."
              />
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-full bg-foreground text-background hover:bg-foreground/90"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1.5" />
            )}
            Save lead rules
          </Button>
        </div>
      </div>
    </div>
  );
}
