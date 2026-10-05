import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  // Display only — host's display name resolved by the page that
  // owns the list. (This list is vendor-only; there is no host UI.)
  host_name?: string | null;
}

// Kinds with their own label (appointments.json kinds.<kind>); any other
// kind reads as a generic meeting (kinds.other).
const KNOWN_KINDS = new Set([
  "consultation",
  "walkthrough",
  "tasting",
  "fitting",
  "phone_call",
  "other",
]);

// Badge labels live in appointments.json under status.<status>.
const statusBadgeClass: Record<Appointment["status"], string> = {
  proposed: "bg-secondary text-secondary-foreground border border-border",
  accepted: "bg-accent/15 text-accent border border-accent/30",
  declined: "bg-muted text-muted-foreground border border-border",
  cancelled: "bg-muted text-muted-foreground border border-border",
  completed: "bg-secondary text-secondary-foreground border border-border",
};

// Strips accents from translated words before they go into a file name
// (slugForFile keeps only a-z and 0-9).
function plainText(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

interface Props {
  appointments: Appointment[];
  onMutate: () => void;
}

export function AppointmentsList({ appointments, onMutate }: Props) {
  const { t, i18n } = useTranslation("appointments");
  // Spanish gets US-Spanish date formats; English keeps the shared formatters.
  const isEs = i18n.resolvedLanguage === "es";
  const kindText = (kind: string) =>
    t(KNOWN_KINDS.has(kind) ? `kinds.${kind}` : "kinds.other");
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
      if (a.status === "proposed" && a.proposed_by === "host")
        counts.needs_response++;
      if ((a.status === "accepted" || a.status === "proposed") && t >= now.getTime())
        counts.upcoming++;
      if (t < now.getTime()) counts.past++;
    }
    return [
      { value: "upcoming", label: t("filters.upcoming"), count: counts.upcoming },
      {
        value: "needs_response",
        label: t("filters.needs_response"),
        count: counts.needs_response,
      },
      { value: "past", label: t("filters.past"), count: counts.past },
      { value: "all", label: t("filters.all"), count: counts.all },
    ];
  }, [appointments, t]);

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
          return a.status === "proposed" && a.proposed_by === "host";
        case "all":
          return true;
      }
    });
  }, [appointments, filter]);

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
    toast.success(t(`statusChanged.${status}`));
    onMutate();
  }

  if (appointments.length === 0) {
    return (
      <div className="text-center py-20 max-w-md mx-auto">
        <div className="w-12 h-12 mx-auto rounded-full bg-secondary flex items-center justify-center mb-4">
          <CalendarDays className="w-5 h-5 text-muted-foreground" />
        </div>
        <h3 className="font-editorial text-2xl mb-2">{t("list.emptyTitle")}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t("list.emptyBody")}
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
                : "bg-secondary/60 text-muted-foreground hover:text-accent"
            }`}
          >
            {opt.label}
            <span className="ml-2 tnum opacity-70">{opt.count}</span>
          </Button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">
          {t("list.noMatches")}
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((appt) => {
            const badgeClass = statusBadgeClass[appt.status];
            const when = new Date(appt.scheduled_at);
            const otherName = appt.host_name;
            // Host-less rows are manual, off-platform entries (personal
            // blocks, external bookings) — render them as "Personal", not
            // as a host meeting.
            const isPersonal = !appt.host_id;
            const heading = appt.title?.trim() || kindText(appt.kind);
            const needsMyResponse =
              appt.status === "proposed" && appt.proposed_by === "host";
            const canCancel =
              appt.status === "accepted" || appt.status === "proposed";
            const inPast = when.getTime() < Date.now();
            const canMarkComplete =
              appt.status === "accepted" && inPast;
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
                      {heading}
                      {otherName && (
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          {t("list.with", { name: otherName })}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground tnum">
                      {isPersonal
                        ? t("list.personalSubtitle")
                        : appt.proposed_by === "vendor"
                          ? t("list.proposedByYou")
                          : t("list.proposedByHost")}
                    </p>
                  </div>
                  {isPersonal ? (
                    <Badge className="bg-secondary text-secondary-foreground border border-border">
                      {t("list.personal")}
                    </Badge>
                  ) : (
                    <Badge className={badgeClass}>{t(`status.${appt.status}`)}</Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground mb-3">
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5" />
                    <span className="tnum">
                      {isEs
                        ? when.toLocaleDateString("es-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : formatDate(when, "short")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="tnum">
                      {isEs
                        ? when.toLocaleTimeString("es-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : formatTime(when)}
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
                  <p className="text-sm text-foreground leading-relaxed border-l-2 border-border pl-3 mb-3 whitespace-pre-wrap">
                    {appt.notes}
                  </p>
                )}

                {(needsMyResponse || canCancel || canMarkComplete || canExport) && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {needsMyResponse && (
                      <>
                        <Button
                          size="sm"
                          disabled={pendingId === appt.id}
                          onClick={() => setStatus(appt, "accepted")}
                          className="h-9 text-xs"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          {t("list.accept")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pendingId === appt.id}
                          onClick={() => setStatus(appt, "declined")}
                          className="rounded-full h-8 text-xs"
                        >
                          <X className="w-3 h-3 mr-1" />
                          {t("list.decline")}
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
                        {t("list.markComplete")}
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
                            {t("list.cancel")}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {t("list.cancelTitle")}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("list.cancelBody")}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-full">
                              {t("list.keep")}
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => setStatus(appt, "cancelled")}
                              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {t("list.cancelConfirm")}
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
                          const kindLabelText = kindText(appt.kind);
                          const counterparty = otherName
                            ? ` ${t("list.with", { name: otherName })}`
                            : "";
                          const summary = `${kindLabelText}${counterparty}`;
                          const desc = [
                            appt.notes,
                            appt.inquiry_id
                              ? t("ics.linkedInquiry", {
                                  url: `${window.location.origin}/vendor/inbox/${appt.inquiry_id}`,
                                })
                              : null,
                          ]
                            .filter(Boolean)
                            .join("\n\n");
                          downloadIcs(
                            slugForFile(
                              `vendora-${plainText(kindLabelText)}-${otherName ?? plainText(t("ics.meetingSlug"))}`,
                            ),
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
                        {t("list.addToCalendar")}
                      </Button>
                    )}
                    {appt.inquiry_id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        asChild
                        className="rounded-full h-8 text-xs ml-auto"
                      >
                        <a href={`/vendor/inbox/${appt.inquiry_id}`}>
                          {t("list.openInquiry")}
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
