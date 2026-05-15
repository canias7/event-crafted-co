import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Recurring weekly availability + buffer time for vendor calendars.
// Two distinct controls:
//   1. Day-of-week rules: "I never work Mondays" — projects onto
//      every future Monday so the booking UI auto-blocks it.
//   2. Working hours per day: "Sat 10–6" — narrows bookable slots.
//   3. Buffer minutes around appointments — auto-applied by the
//      booking flow so back-to-back appointments leave breathing
//      room.
//
// Sits alongside the one-off date blocker on AvailabilityPage. The
// templated layer (this) and the explicit-blocks layer cooperate;
// one-off blocks always win.

interface DayRule {
  day_of_week: number;
  is_unavailable: boolean;
  start_time: string | null;
  end_time: string | null;
}

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

interface Props {
  vendorId: string;
}

export function RecurringAvailabilityCard({ vendorId }: Props) {
  const [rules, setRules] = useState<DayRule[]>([]);
  const [bufferBefore, setBufferBefore] = useState("0");
  const [bufferAfter, setBufferAfter] = useState("15");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingBuffer, setSavingBuffer] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [rulesRes, profileRes] = await Promise.all([
        sb
          .from("vendor_availability_rules")
          .select("day_of_week, is_unavailable, start_time, end_time")
          .eq("vendor_id", vendorId)
          .order("day_of_week", { ascending: true }),
        sb
          .from("vendor_profiles")
          .select(
            "appointment_buffer_before_minutes, appointment_buffer_after_minutes",
          )
          .eq("id", vendorId)
          .maybeSingle(),
      ]);
      if (cancelled) return;

      // Seed all 7 days; existing rows override.
      const byDay = new Map<number, DayRule>();
      for (const r of (rulesRes.data ?? []) as DayRule[]) {
        byDay.set(r.day_of_week, r);
      }
      const seeded: DayRule[] = Array.from({ length: 7 }, (_, i) => {
        return (
          byDay.get(i) ?? {
            day_of_week: i,
            is_unavailable: false,
            start_time: null,
            end_time: null,
          }
        );
      });
      setRules(seeded);

      const profile = profileRes.data as
        | {
            appointment_buffer_before_minutes: number;
            appointment_buffer_after_minutes: number;
          }
        | null;
      if (profile) {
        setBufferBefore(String(profile.appointment_buffer_before_minutes ?? 0));
        setBufferAfter(String(profile.appointment_buffer_after_minutes ?? 15));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  function patchRule(dayOfWeek: number, patch: Partial<DayRule>) {
    setRules((prev) =>
      prev.map((r) => (r.day_of_week === dayOfWeek ? { ...r, ...patch } : r)),
    );
  }

  async function saveRules() {
    setSaving(true);
    // Upsert each row. We could batch this but 7 rows is trivial and
    // letting Postgres validate the time-range CHECK per row is
    // simpler than collapsing client-side.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const rows = rules.map((r) => ({
      vendor_id: vendorId,
      day_of_week: r.day_of_week,
      is_unavailable: r.is_unavailable,
      start_time: r.is_unavailable ? null : r.start_time,
      end_time: r.is_unavailable ? null : r.end_time,
    }));
    const { error } = await sb
      .from("vendor_availability_rules")
      .upsert(rows, { onConflict: "vendor_id,day_of_week" });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Weekly availability saved");
  }

  async function saveBuffer() {
    const before = Number.parseInt(bufferBefore, 10);
    const after = Number.parseInt(bufferAfter, 10);
    if (
      Number.isNaN(before) ||
      Number.isNaN(after) ||
      before < 0 ||
      after < 0 ||
      before > 240 ||
      after > 240
    ) {
      toast.error("Buffer must be 0–240 minutes");
      return;
    }
    setSavingBuffer(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_profiles")
      .update({
        appointment_buffer_before_minutes: before,
        appointment_buffer_after_minutes: after,
      })
      .eq("id", vendorId);
    setSavingBuffer(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Buffer time saved");
  }

  if (loading) {
    return (
      <div className="card-soft p-6 text-center text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 mx-auto animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Weekly recurring rules */}
      <div className="card-soft p-5 md:p-6">
        <div className="mb-4">
          <h3 className="font-display text-lg leading-tight mb-1">
            Weekly availability
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Mark days you never work, or set bookable hours per weekday.
            One-off blocks below override these rules for specific dates.
          </p>
        </div>
        <div className="space-y-3">
          {rules.map((r) => (
            <div
              key={r.day_of_week}
              className="flex items-center gap-3 flex-wrap"
            >
              <div className="w-24 text-sm font-medium">
                {DAY_LABELS[r.day_of_week]}
              </div>
              <Switch
                checked={!r.is_unavailable}
                onCheckedChange={(v) =>
                  patchRule(r.day_of_week, { is_unavailable: !v })
                }
                aria-label={`${DAY_LABELS[r.day_of_week]} available`}
              />
              <span className="text-xs text-muted-foreground">
                {r.is_unavailable ? "Off" : "Available"}
              </span>
              {!r.is_unavailable && (
                <>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <Input
                      type="time"
                      value={r.start_time ?? ""}
                      onChange={(e) =>
                        patchRule(r.day_of_week, {
                          start_time: e.target.value || null,
                        })
                      }
                      className="h-9 w-28"
                      placeholder="Start"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={r.end_time ?? ""}
                      onChange={(e) =>
                        patchRule(r.day_of_week, {
                          end_time: e.target.value || null,
                        })
                      }
                      className="h-9 w-28"
                      placeholder="End"
                    />
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="mt-5 pt-4 border-t border-border flex justify-end">
          <Button
            type="button"
            onClick={saveRules}
            disabled={saving}
            className="rounded-full bg-foreground text-background hover:bg-foreground/90"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1.5" />
            )}
            Save weekly rules
          </Button>
        </div>
      </div>

      {/* Buffer time */}
      <div className="card-soft p-5 md:p-6">
        <div className="mb-4">
          <h3 className="font-display text-lg leading-tight mb-1">
            Buffer between appointments
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Travel, setup, recovery — minutes the booking flow blocks
            around each appointment so back-to-back bookings stay
            realistic.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="buf-before">Before (min)</Label>
            <Input
              id="buf-before"
              type="number"
              min={0}
              max={240}
              value={bufferBefore}
              onChange={(e) => setBufferBefore(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="buf-after">After (min)</Label>
            <Input
              id="buf-after"
              type="number"
              min={0}
              max={240}
              value={bufferAfter}
              onChange={(e) => setBufferAfter(e.target.value)}
              className="h-9"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            onClick={saveBuffer}
            disabled={savingBuffer}
            variant="outline"
            className="rounded-full"
          >
            {savingBuffer ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1.5" />
            )}
            Save buffer
          </Button>
        </div>
      </div>
    </div>
  );
}
