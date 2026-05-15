import { useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarPlus,
  Check,
  X,
  XCircle,
  CircleCheck,
  Clock,
  MapPin,
  ChevronRight,
  Video,
} from "lucide-react";
import { downloadIcs, slugForFile } from "@/lib/ics";
import { formatDate, formatTime } from "@/lib/format";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export interface Appointment {
  id: string;
  inquiry_id: string | null;
  vendor_id: string;
  host_id: string;
  kind: string;
  title: string | null;
  location: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: "proposed" | "accepted" | "declined" | "cancelled" | "completed";
  proposed_by: "host" | "vendor";
  notes: string | null;
  meeting_url?: string | null;
  meeting_provider?: "jitsi" | "google_meet" | null;
  // Display only
  vendor_name?: string | null;
  host_name?: string | null;
}

const kindLabel: Record<string, string> = {
  consultation: "Consultation",
  walkthrough: "Walkthrough",
  tasting: "Tasting",
  fitting: "Fitting",
  phone_call: "Phone call",
  other: "Meeting",
};

const statusBadge: Record<
  Appointment["status"],
  { label: string; className: string }
> = {
  proposed: {
    label: "Proposed",
    className:
      "bg-secondary text-secondary-foreground border border-border",
  },
  accepted: {
    label: "Confirmed",
    className: "bg-accent/15 text-accent border border-accent/30",
  },
  declined: {
    label: "Declined",
    className: "bg-muted text-muted-foreground border border-border",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-muted text-muted-foreground border border-border",
  },
  completed: {
    label: "Completed",
    className:
      "bg-secondary text-secondary-foreground border border-border",
  },
};

export type AppointmentsListSide = "host" | "vendor";

interface Props {
  appointments: Appointment[];
  side: AppointmentsListSide;
  onMutate: () => void;
}

export function AppointmentsList({ appointments, side, onMutate }: Props) {
  const [filter, setFilter] = useState<
    "upcoming" | "past" | "needs_response" | "all"
  >("upcoming");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const filterOptions: Array<{
    value: typeof filter;
    label: string;
    count: number;
  }> = useMemo(() => {
    const now = new Date();
    const counts = {
      upcoming: 0,
      past: 0,
      needs_response: 0,
      all: appointments.length,
    };
    for (const a of appointments) {
      const t = new Date(a.scheduled_at).getTime();
      if (a.status === "proposed" && a.proposed_by !== side) counts.needs_response++;
      if ((a.status === "accepted" || a.status === "proposed") && t >= now.getTime())
        counts.upcoming++;
      if (t < now.getTime()) counts.past++;
    }
    return [
      { value: "upcoming", label: "Upcoming", count: counts.upcoming },
      {
        value: "needs_response",
        label: "Needs response",
        count: counts.needs_response,
      },
      { value: "past", label: "Past", count: counts.past },
      { value: "all", label: "All", count: counts.all },
    ];
  }, [appointments, side]);

  const visible = useMemo(() => {
    const now = Date.now();
    return appointments.filter((a) => {
      const t = new Date(a.scheduled_at).getTime();
      switch (filter) {
        case "upcoming":
          return (
            (a.status === "accepted" || a.status === "proposed") && t >= now
          );
        case "past":
          return t < now;
        case "needs_response":
          return a.status === "proposed" && a.proposed_by !== side;
        case "all":
          return true;
      }
    });
  }, [appointments, filter, side]);

  async function setStatus(
    appt: Appointment,
    status: Appointment["status"],
  ) {
    setPendingId(appt.id);
    const { error } = await supabase
      .from("appointments")
      .update({ status })
      .eq("id", appt.id);
    setPendingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Appointment ${status}`);
    onMutate();
  }

  if (appointments.length === 0) {
    return (
      <div className="text-center py-20 max-w-md mx-auto">
        <div className="w-12 h-12 mx-auto rounded-full bg-secondary flex items-center justify-center mb-4">
          <CalendarDays className="w-5 h-5 text-muted-foreground" />
        </div>
        <h3 className="font-editorial text-2xl mb-2">No appointments yet</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {side === "host"
            ? "Vendors can propose meetings — tastings, walkthroughs, consultations — and they'll show up here."
            : "When you propose a meeting from an inquiry, it'll show up here once the host responds."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {filterOptions.map((opt) => (
          <Button
            key={opt.value}
            size="sm"
            variant="ghost"
            onClick={() => setFilter(opt.value)}
            className={`rounded-full whitespace-nowrap h-8 text-xs ${
              filter === opt.value
                ? "bg-foreground text-background hover:bg-foreground/90"
                : "bg-secondary/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
            <span className="ml-2 tnum opacity-70">{opt.count}</span>
          </Button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">
          Nothing matches that filter.
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((appt) => {
            const badge = statusBadge[appt.status];
            const when = new Date(appt.scheduled_at);
            const otherName =
              side === "host" ? appt.vendor_name : appt.host_name;
            const needsMyResponse =
              appt.status === "proposed" && appt.proposed_by !== side;
            const canCancel =
              appt.status === "accepted" || appt.status === "proposed";
            const inPast = when.getTime() < Date.now();
            const canMarkComplete =
              appt.status === "accepted" && inPast && side === "vendor";
            const canExport =
              (appt.status === "accepted" || appt.status === "proposed") &&
              !inPast;

            return (
              <div
                key={appt.id}
                className="card-soft p-5"
              >
                <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-display text-base mb-0.5">
                      {kindLabel[appt.kind] ?? "Meeting"}
                      {otherName && (
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          with {otherName}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground tnum">
                      {appt.proposed_by === side
                        ? "Proposed by you"
                        : `Proposed by the ${appt.proposed_by}`}
                    </p>
                  </div>
                  <Badge className={badge.className}>{badge.label}</Badge>
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground mb-3">
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5" />
                    <span className="tnum">
                      {formatDate(when, "short")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="tnum">
                      {formatTime(when)}
                      {" · "}
                      {appt.duration_minutes} min
                    </span>
                  </div>
                  {appt.location && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" />
                      <span className="truncate max-w-[260px]">
                        {appt.location}
                      </span>
                    </div>
                  )}
                </div>

                {appt.notes && (
                  <p className="text-sm text-foreground/80 leading-relaxed border-l-2 border-border pl-3 mb-3 whitespace-pre-wrap">
                    {appt.notes}
                  </p>
                )}

                {appt.meeting_url && appt.status !== "cancelled" && appt.status !== "declined" && (
                  <a
                    href={appt.meeting_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm bg-secondary/60 hover:bg-secondary text-foreground rounded-sm px-3 py-2 mb-3 transition-colors group"
                  >
                    <Video className="w-3.5 h-3.5 text-accent" />
                    <span className="font-medium">
                      Join {appt.meeting_provider === "google_meet" ? "Google Meet" : "video call"}
                    </span>
                    <ChevronRight className="w-3 h-3 ml-auto opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                  </a>
                )}

                {(needsMyResponse || canCancel || canMarkComplete || canExport) && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {needsMyResponse && (
                      <>
                        <Button
                          size="sm"
                          disabled={pendingId === appt.id}
                          onClick={() => setStatus(appt, "accepted")}
                          className="rounded-full bg-foreground text-background hover:bg-foreground/90 h-8 text-xs"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pendingId === appt.id}
                          onClick={() => setStatus(appt, "declined")}
                          className="rounded-full h-8 text-xs"
                        >
                          <X className="w-3 h-3 mr-1" />
                          Decline
                        </Button>
                      </>
                    )}
                    {canMarkComplete && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pendingId === appt.id}
                        onClick={() => setStatus(appt, "completed")}
                        className="rounded-full h-8 text-xs"
                      >
                        <CircleCheck className="w-3 h-3 mr-1" />
                        Mark complete
                      </Button>
                    )}
                    {canCancel && !needsMyResponse && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pendingId === appt.id}
                            className="rounded-full h-8 text-xs text-muted-foreground"
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Cancel
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Cancel this appointment?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              The other party will be notified.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-full">
                              Keep it
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => setStatus(appt, "cancelled")}
                              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Cancel appointment
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    {canExport && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const kindLabelText =
                            kindLabel[appt.kind] ?? "Meeting";
                          const counterparty = otherName
                            ? ` with ${otherName}`
                            : "";
                          const summary = `${kindLabelText}${counterparty}`;
                          const desc = [
                            appt.notes,
                            appt.inquiry_id
                              ? `Linked inquiry: ${window.location.origin}${
                                  side === "host"
                                    ? `/customer/inquiries/${appt.inquiry_id}`
                                    : `/vendor/inbox/${appt.inquiry_id}`
                                }`
                              : null,
                          ]
                            .filter(Boolean)
                            .join("\n\n");
                          downloadIcs(
                            slugForFile(`vendora-${kindLabelText}-${otherName ?? "meeting"}`),
                            [
                              {
                                uid: `appt-${appt.id}@vendora`,
                                start: when,
                                durationMinutes: appt.duration_minutes,
                                summary,
                                description: desc || null,
                                location: appt.location,
                              },
                            ],
                          );
                        }}
                        className="rounded-full h-8 text-xs"
                      >
                        <CalendarPlus className="w-3 h-3 mr-1" />
                        Add to calendar
                      </Button>
                    )}
                    {appt.inquiry_id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        asChild
                        className="rounded-full h-8 text-xs ml-auto"
                      >
                        <a
                          href={
                            side === "host"
                              ? `/customer/inquiries/${appt.inquiry_id}`
                              : `/vendor/inbox/${appt.inquiry_id}`
                          }
                        >
                          Open inquiry
                          <ChevronRight className="w-3 h-3 ml-1" />
                        </a>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
