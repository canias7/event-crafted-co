import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Loader2, Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type EventType = "wedding" | "birthday" | "holiday_dinner" | "other";

interface VendorOption {
  id: string;
  business_name: string;
  category: string;
}

interface InquiryFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select a vendor by business_name match (case-insensitive). */
  preferredVendorName?: string;
  /** Called after a successful insert with the new inquiry id. */
  onSuccess?: (inquiryId: string) => void;
}

const eventTypes: Array<{ value: EventType; label: string }> = [
  { value: "wedding", label: "Wedding" },
  { value: "birthday", label: "Birthday" },
  { value: "holiday_dinner", label: "Holiday dinner" },
  { value: "other", label: "Other" },
];

export function InquiryFormModal({
  open,
  onOpenChange,
  preferredVendorName,
  onSuccess,
}: InquiryFormModalProps) {
  const { user, activeEvent, profile } = useAuth();
  const navigate = useNavigate();

  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(new Set());
  // Dates the picked vendor has marked unavailable or already booked.
  // Drives the disabled days on the event-date picker.
  const [vendorBlockedDays, setVendorBlockedDays] = useState<Set<string>>(
    new Set(),
  );
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const [vendorId, setVendorId] = useState<string>("");
  const [eventType, setEventType] = useState<EventType>("wedding");
  const [eventDate, setEventDate] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [location, setLocation] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");

  // Vendor intake form (RFP-style structured questionnaire). Loaded
  // when the host picks a vendor; replaces the free-text "anything
  // else" field if present.
  interface IntakeQuestion {
    id: string;
    label: string;
    type: "text" | "number" | "select" | "multiselect" | "yesno";
    options?: string[];
    required?: boolean;
    helper?: string;
  }
  const [intakeIntro, setIntakeIntro] = useState<string | null>(null);
  const [intakeQuestions, setIntakeQuestions] = useState<IntakeQuestion[]>([]);
  const [intakeAnswers, setIntakeAnswers] = useState<
    Record<string, string | string[] | boolean>
  >({});

  // Pull the vendor's intake form when vendorId changes.
  useEffect(() => {
    if (!vendorId) {
      setIntakeIntro(null);
      setIntakeQuestions([]);
      setIntakeAnswers({});
      return;
    }
    let cancelled = false;
    supabase
      .from("vendor_intake_forms")
      .select("intro, questions, is_published")
      .eq("vendor_id", vendorId)
      .maybeSingle()
      .then(({ data }) => {
          if (cancelled) return;
          // questions is stored as Json; cast through unknown so the
          // narrowed IntakeQuestion[] shape lands correctly.
          const row = data as unknown as {
            intro: string | null;
            questions: IntakeQuestion[];
            is_published: boolean;
          } | null;
          if (row && row.is_published) {
            setIntakeIntro(row.intro);
            setIntakeQuestions(
              Array.isArray(row.questions) ? row.questions : [],
            );
            setIntakeAnswers({});
          } else {
            setIntakeIntro(null);
            setIntakeQuestions([]);
            setIntakeAnswers({});
          }
        },
      );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  function reset() {
    setVendorId("");
    setEventType("wedding");
    setEventDate("");
    setGuestCount("");
    setLocation("");
    setBudgetMin("");
    setBudgetMax("");
    setSpecialRequests("");
    setVendorBlockedDays(new Set());
    setDatePickerOpen(false);
  }

  // active_event / per-profile prefill removed when host_events was
  // dropped — every inquiry now starts empty. Host re-enters event
  // details once per inquiry, same as mobile.
  // eslint-disable-next-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setVendorsLoading(true);
    supabase
      .from("vendor_profiles")
      .select("id, business_name, category")
      .order("business_name", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast.error(`Couldn't load vendors: ${error.message}`);
          setVendors([]);
        } else {
          const list = (data ?? []) as VendorOption[];
          setVendors(list);
          if (preferredVendorName && !vendorId) {
            const match = list.find(
              (v) =>
                v.business_name.toLowerCase() ===
                preferredVendorName.toLowerCase(),
            );
            if (match) setVendorId(match.id);
          }
        }
        setVendorsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preferredVendorName]);

  // Refresh the unavailable-vendor set whenever the chosen event date changes
  // so we can disable booked vendors in the dropdown.
  useEffect(() => {
    if (!open || !eventDate) {
      setUnavailableIds(new Set());
      return;
    }
    let cancelled = false;
    supabase
      .from("vendor_unavailable_dates")
      .select("vendor_id")
      .eq("date", eventDate)
      .then(({ data }) => {
        if (cancelled) return;
        setUnavailableIds(new Set((data ?? []).map((r) => r.vendor_id)));
      });
    return () => {
      cancelled = true;
    };
  }, [open, eventDate]);

  // Fetch the picked vendor's blocked + booked dates so the event-date
  // picker can grey them out (and so the host can't pick one of them).
  useEffect(() => {
    if (!vendorId) {
      setVendorBlockedDays(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const horizon = new Date(today);
      horizon.setMonth(horizon.getMonth() + 12);
      const isoDay = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const [{ data: blocks }, { data: booked }] = await Promise.all([
        supabase
          .from("vendor_unavailable_dates")
          .select("date")
          .eq("vendor_id", vendorId)
          .gte("date", isoDay(today))
          .lte("date", isoDay(horizon)),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).rpc("vendor_booked_dates", { p_vendor_id: vendorId }),
      ]);
      if (cancelled) return;
      const all = new Set<string>();
      for (const r of (blocks as Array<{ date: string }> | null) ?? []) {
        all.add(r.date);
      }
      const bookedRaw = (booked as unknown) ?? [];
      if (Array.isArray(bookedRaw)) {
        for (const row of bookedRaw) {
          const d =
            typeof row === "string"
              ? row
              : (row as { vendor_booked_dates?: string }).vendor_booked_dates;
          if (typeof d === "string") all.add(d);
        }
      }
      setVendorBlockedDays(all);
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  const blockedDateObjects = useMemo(() => {
    return Array.from(vendorBlockedDays).map((s) => {
      const [y, m, d] = s.split("-").map(Number);
      return new Date(y, m - 1, d);
    });
  }, [vendorBlockedDays]);

  const todayStart = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const formattedEventDate = useMemo(() => {
    if (!eventDate) return "";
    const [y, m, d] = eventDate.split("-").map(Number);
    if (!y || !m || !d) return eventDate;
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [eventDate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      toast.error("Please sign in first");
      return;
    }
    if (!vendorId) {
      toast.error("Please choose a vendor");
      return;
    }

    const guestCountNum = guestCount ? Number.parseInt(guestCount, 10) : null;
    const minCents = budgetMin ? Math.round(Number.parseFloat(budgetMin) * 100) : null;
    const maxCents = budgetMax ? Math.round(Number.parseFloat(budgetMax) * 100) : null;

    if (minCents != null && maxCents != null && minCents > maxCents) {
      toast.error("Budget min must be less than budget max");
      return;
    }

    if (eventDate && unavailableIds.has(vendorId)) {
      toast.error("That vendor isn't available on the date you picked.");
      return;
    }

    // Validate every required intake question has a non-empty answer
    // before insert. The native HTML `required` attr is unreliable
    // (custom button groups don't fire constraint validation; users
    // can also bypass via DevTools), so we re-check here.
    const missingRequired = intakeQuestions.find((q) => {
      if (!q.required) return false;
      const v = intakeAnswers[q.id];
      if (q.type === "multiselect") return !Array.isArray(v) || v.length === 0;
      if (q.type === "yesno") return v == null;
      if (typeof v === "string") return v.trim().length === 0;
      return v == null;
    });
    if (missingRequired) {
      toast.error(`Please answer: ${missingRequired.label}`);
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase
      .from("inquiries")
      .insert({
        host_id: user.id,
        vendor_id: vendorId,
        event_type: eventType,
        event_date: eventDate || null,
        guest_count: guestCountNum,
        location: location.trim() || null,
        budget_min_cents: minCents,
        budget_max_cents: maxCents,
        special_requests: specialRequests.trim() || null,
        intake_answers:
          Object.keys(intakeAnswers).length > 0 ? intakeAnswers : null,
        status: "new",
      })
      .select("id")
      .single();
    setSubmitting(false);

    if (error) {
      toast.error(`Couldn't send inquiry: ${error.message}`);
      return;
    }

    // Fire-and-forget email to the vendor team. Don't block the user on it
    // — the in-app notification trigger already covers the inbox bell.
    // Log failures so they show up in Sentry / dashboard logs instead
    // of dying silently; the 3-hour reply SLA depends on these landing.
    supabase.functions
      .invoke("send-transactional-email", {
        body: { kind: "new_inquiry", inquiryId: data.id },
      })
      .then(({ error: emailErr }) => {
        if (emailErr) {
          console.error("[Inquiry] new_inquiry email failed", emailErr.message);
        }
      })
      .catch((e) => {
        console.error("[Inquiry] new_inquiry email threw", e);
      });

    toast.success("Inquiry sent — vendor will reply soon");
    onSuccess?.(data.id);
    reset();
    onOpenChange(false);
    navigate("/customer/inquiries");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-editorial text-3xl">Send an inquiry</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 text-xs leading-relaxed pt-1">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            Vendors typically reply within 3 hours via AI-assisted drafts.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          {/* Vendor */}
          <div className="space-y-2">
            <Label htmlFor="vendor">
              Vendor <span className="text-destructive">*</span>
            </Label>
            {vendorsLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : vendors.length === 0 ? (
              <div className="text-sm text-muted-foreground border border-border rounded-md p-3 bg-secondary/40">
                No vendors are accepting inquiries yet. We're onboarding new
                vendors weekly — check back soon.
              </div>
            ) : (
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger id="vendor" className="h-10">
                  <SelectValue placeholder="Choose a vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => {
                    const blocked = unavailableIds.has(v.id);
                    return (
                      <SelectItem
                        key={v.id}
                        value={v.id}
                        disabled={blocked}
                      >
                        {v.business_name}{" "}
                        <span className="text-muted-foreground">
                          · {v.category}
                        </span>
                        {blocked && (
                          <span className="ml-2 text-xs text-destructive">
                            (booked that day)
                          </span>
                        )}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Event type */}
          <div className="space-y-2">
            <Label htmlFor="event-type">
              Event type <span className="text-destructive">*</span>
            </Label>
            <Select
              value={eventType}
              onValueChange={(v) => setEventType(v as EventType)}
            >
              <SelectTrigger id="event-type" className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {eventTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date + guests */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="event-date">Event date</Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    id="event-date"
                    type="button"
                    className={cn(
                      "h-10 w-full inline-flex items-center justify-between gap-2 px-3 rounded-md border border-input bg-background text-sm font-normal text-left",
                      !eventDate && "text-muted-foreground",
                    )}
                    disabled={!vendorId}
                  >
                    <span className="truncate">
                      {eventDate
                        ? formattedEventDate
                        : vendorId
                          ? "Pick a date"
                          : "Pick a vendor first"}
                    </span>
                    <CalendarIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={
                      eventDate
                        ? (() => {
                            const [y, m, d] = eventDate.split("-").map(Number);
                            return new Date(y, m - 1, d);
                          })()
                        : undefined
                    }
                    onSelect={(d) => {
                      if (!d) return;
                      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                      setEventDate(iso);
                      setDatePickerOpen(false);
                    }}
                    disabled={[{ before: todayStart }, ...blockedDateObjects]}
                    modifiers={{ blocked: blockedDateObjects }}
                    modifiersClassNames={{
                      blocked:
                        "line-through text-muted-foreground/70 bg-muted/40",
                    }}
                  />
                  <div className="px-3 pb-3 pt-1 text-[11px] text-muted-foreground border-t border-border">
                    Struck-through dates are blocked by this vendor.
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-count">Guest count</Label>
              <Input
                id="guest-count"
                type="number"
                inputMode="numeric"
                min="1"
                value={guestCount}
                onChange={(e) => setGuestCount(e.target.value)}
                placeholder="120"
                className="h-10"
              />
            </div>
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City, neighborhood, or venue name"
              className="h-10"
            />
          </div>

          {/* Budget */}
          <div className="space-y-2">
            <Label>Budget range</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="100"
                  value={budgetMin}
                  onChange={(e) => setBudgetMin(e.target.value)}
                  placeholder="Min"
                  className="h-10 pl-7"
                />
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="100"
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(e.target.value)}
                  placeholder="Max"
                  className="h-10 pl-7"
                />
              </div>
            </div>
          </div>

          {/* Vendor intake form (RFP) — replaces special requests when published */}
          {intakeQuestions.length > 0 && (
            <div className="space-y-3 rounded-sm border border-accent/30 bg-accent/5 p-4">
              <div>
                <p className="font-label text-accent mb-1">
                  A few questions from this vendor
                </p>
                {intakeIntro && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {intakeIntro}
                  </p>
                )}
              </div>
              {intakeQuestions.map((q) => (
                <div key={q.id} className="space-y-1.5">
                  <Label htmlFor={`intake-${q.id}`}>
                    {q.label}
                    {q.required && (
                      <span className="text-destructive ml-1">*</span>
                    )}
                  </Label>
                  {q.type === "text" && (
                    <Input
                      id={`intake-${q.id}`}
                      value={(intakeAnswers[q.id] as string) ?? ""}
                      onChange={(e) =>
                        setIntakeAnswers((prev) => ({
                          ...prev,
                          [q.id]: e.target.value,
                        }))
                      }
                      required={q.required}
                      className="h-10"
                    />
                  )}
                  {q.type === "number" && (
                    <Input
                      id={`intake-${q.id}`}
                      type="number"
                      value={(intakeAnswers[q.id] as string) ?? ""}
                      onChange={(e) =>
                        setIntakeAnswers((prev) => ({
                          ...prev,
                          [q.id]: e.target.value,
                        }))
                      }
                      required={q.required}
                      className="h-10"
                    />
                  )}
                  {q.type === "yesno" && (
                    <div className="flex gap-2">
                      {["Yes", "No"].map((opt) => {
                        const active = intakeAnswers[q.id] === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() =>
                              setIntakeAnswers((prev) => ({
                                ...prev,
                                [q.id]: opt,
                              }))
                            }
                            className={`px-4 h-9 rounded-full text-xs font-medium ${
                              active
                                ? "bg-foreground text-background"
                                : "bg-secondary text-foreground"
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {q.type === "select" && (
                    <select
                      id={`intake-${q.id}`}
                      value={(intakeAnswers[q.id] as string) ?? ""}
                      onChange={(e) =>
                        setIntakeAnswers((prev) => ({
                          ...prev,
                          [q.id]: e.target.value,
                        }))
                      }
                      required={q.required}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                    >
                      <option value="">Choose…</option>
                      {(q.options ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  )}
                  {q.type === "multiselect" && (
                    <div className="flex flex-wrap gap-2">
                      {(q.options ?? []).map((o) => {
                        const arr = (intakeAnswers[q.id] as string[]) ?? [];
                        const active = arr.includes(o);
                        return (
                          <button
                            key={o}
                            type="button"
                            onClick={() =>
                              setIntakeAnswers((prev) => ({
                                ...prev,
                                [q.id]: active
                                  ? arr.filter((x) => x !== o)
                                  : [...arr, o],
                              }))
                            }
                            className={`px-3 h-8 rounded-full text-xs font-medium border ${
                              active
                                ? "bg-foreground text-background border-foreground"
                                : "bg-background border-border"
                            }`}
                          >
                            {o}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Special requests — always shown alongside intake (or alone) */}
          <div className="space-y-2">
            <Label htmlFor="special-requests">
              {intakeQuestions.length > 0
                ? "Anything else?"
                : "Tell us about your event"}
            </Label>
            <Textarea
              id="special-requests"
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              rows={intakeQuestions.length > 0 ? 2 : 4}
              placeholder="Color palette, vibe, must-haves, anything else the vendor should know."
            />
          </div>

          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || vendorsLoading || !vendorId}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending…
                </>
              ) : (
                "Send inquiry"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
