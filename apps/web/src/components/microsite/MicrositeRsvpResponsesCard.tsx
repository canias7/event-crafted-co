import { useEffect, useState } from "react";
import { Trash2, Users, Check, X, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

// Host-side: list of RSVP responses on the microsite. Read-only
// except for delete (spam removal). Lives on the microsite editor
// page so the host has one place for everything microsite-related.

interface Rsvp {
  id: string;
  guest_name: string;
  guest_email: string;
  attending: boolean;
  plus_ones: number;
  message: string | null;
  answers: Record<string, string>;
  created_at: string;
}

export function MicrositeRsvpResponsesCard({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<Rsvp[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("event_microsite_rsvps")
      .select(
        "id, guest_name, guest_email, attending, plus_ones, message, answers, created_at",
      )
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    setRows((data as Rsvp[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (eventId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function remove(id: string) {
    if (!window.confirm("Remove this RSVP response?")) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("event_microsite_rsvps")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
    toast.success("Removed");
  }

  const yes = rows.filter((r) => r.attending);
  const no = rows.filter((r) => !r.attending);
  const totalAttending =
    yes.reduce((sum, r) => sum + 1 + r.plus_ones, 0);

  return (
    <div>
      <div className="mb-3">
        <p className="font-label text-muted-foreground inline-flex items-center gap-1.5">
          <Users className="w-3 h-3" />
          RSVP responses
        </p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Guests who've responded to your event microsite. They can update
          their own response by re-submitting with the same email.
        </p>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground py-4">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-3">
          No responses yet. Share your microsite link to get RSVPs.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="card-soft p-3 text-center">
              <p className="font-display text-2xl tnum">{yes.length}</p>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                Yes
              </p>
            </div>
            <div className="card-soft p-3 text-center">
              <p className="font-display text-2xl tnum">{no.length}</p>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                No
              </p>
            </div>
            <div className="card-soft p-3 text-center">
              <p className="font-display text-2xl tnum">{totalAttending}</p>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                Total
              </p>
            </div>
          </div>

          <ul className="space-y-2">
            {rows.map((r) => (
              <li
                key={r.id}
                className="card-soft p-3 flex items-start gap-3"
              >
                <div
                  className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    r.attending
                      ? "bg-accent/15 text-accent"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {r.attending ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <X className="w-3 h-3" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">
                    {r.guest_name}
                    {r.attending && r.plus_ones > 0 && (
                      <span className="text-muted-foreground font-normal ml-1.5">
                        +{r.plus_ones}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground inline-flex items-center gap-1 truncate">
                    <Mail className="w-2.5 h-2.5 shrink-0" />
                    <a
                      href={`mailto:${r.guest_email}`}
                      className="hover:text-foreground transition-colors truncate"
                    >
                      {r.guest_email}
                    </a>
                  </p>
                  {r.message && (
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed italic">
                      "{r.message}"
                    </p>
                  )}
                  {Object.keys(r.answers ?? {}).length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {Object.entries(r.answers).map(([k, v]) => (
                        <span
                          key={k}
                          className="inline-flex text-[11px] bg-secondary text-secondary-foreground rounded-full px-2 py-0.5"
                        >
                          {k}: {v}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => remove(r.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
