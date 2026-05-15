import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Loader2,
  Sparkles,
  Check,
  ArrowRight,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRequireVerifiedEmail } from "@/hooks/useRequireVerifiedEmail";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { SubNavTabs } from "@/components/shared/SubNavTabs";
import { INQUIRIES_HUB_TABS } from "@/data/hubTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { customerNavItems as navItems } from "@/data/navItems";
import type { EventType } from "@/hooks/useAuth";
import { HostInquiryTemplatePicker } from "@/components/customer/HostInquiryTemplatePicker";
import {
  loadDraft,
  clearDraft,
  useAutoSaveDraft,
} from "@/hooks/useInquiryDraft";
import {
  buildBlastStarter,
  type EventTypeKey,
} from "@/data/inquiryStarters";

interface VendorOption {
  id: string;
  business_name: string;
  category: string;
  location: string | null;
}

const eventTypes: Array<{ value: EventType; label: string }> = [
  { value: "wedding", label: "Wedding" },
  { value: "birthday", label: "Birthday" },
  { value: "holiday_dinner", label: "Holiday dinner" },
  { value: "other", label: "Other" },
];

export default function InquiryBlastPage() {
  const { user, profile, activeEvent } = useAuth();
  const requireVerified = useRequireVerifiedEmail();
  const navigate = useNavigate();

  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Hydrate from any localStorage draft so abandoning the page
  // doesn't lose progress. clearDraft fires after a successful send.
  const draft = loadDraft("blast");
  const [eventType, setEventType] = useState<EventType>(
    (draft?.eventType as EventType) ?? "wedding",
  );
  const [eventDate, setEventDate] = useState(draft?.eventDate ?? "");
  const [guestCount, setGuestCount] = useState(draft?.guestCount ?? "");
  const [location, setLocation] = useState(draft?.location ?? "");
  const [budgetMin, setBudgetMin] = useState(draft?.budgetMin ?? "");
  const [budgetMax, setBudgetMax] = useState(draft?.budgetMax ?? "");
  const [specialRequests, setSpecialRequests] = useState(
    draft?.specialRequests ?? "",
  );
  const [submitting, setSubmitting] = useState(false);

  useAutoSaveDraft("blast", {
    eventType,
    eventDate,
    guestCount,
    location,
    budgetMin,
    budgetMax,
    specialRequests,
  });

  // Pre-fill from the host's active event
  useEffect(() => {
    if (activeEvent) {
      if (activeEvent.event_type) setEventType(activeEvent.event_type);
      if (activeEvent.event_date) setEventDate(activeEvent.event_date);
      if (activeEvent.event_location) setLocation(activeEvent.event_location);
      if (activeEvent.budget_min_cents != null)
        setBudgetMin((activeEvent.budget_min_cents / 100).toString());
      if (activeEvent.budget_max_cents != null)
        setBudgetMax((activeEvent.budget_max_cents / 100).toString());
    } else if (profile) {
      if (profile.event_type) setEventType(profile.event_type);
      if (profile.event_date) setEventDate(profile.event_date);
      if (profile.event_location) setLocation(profile.event_location);
      if (profile.budget_min_cents != null)
        setBudgetMin((profile.budget_min_cents / 100).toString());
      if (profile.budget_max_cents != null)
        setBudgetMax((profile.budget_max_cents / 100).toString());
    }
  }, [activeEvent, profile]);

  useEffect(() => {
    let cancelled = false;
    setVendorsLoading(true);
    supabase
      .from("vendor_profiles")
      .select("id, business_name, category, location")
      .order("business_name", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setVendors((data as VendorOption[] | null) ?? []);
        setVendorsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => {
    const set = new Set(vendors.map((v) => v.category));
    return ["All", ...Array.from(set).sort()];
  }, [vendors]);

  const filteredVendors = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors.filter((v) => {
      if (category !== "All" && v.category !== category) return false;
      if (!q) return true;
      return (
        v.business_name.toLowerCase().includes(q) ||
        v.category.toLowerCase().includes(q) ||
        (v.location ?? "").toLowerCase().includes(q)
      );
    });
  }, [vendors, search, category]);

  function togglePicked(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send() {
    if (!user) return;
    if (picked.size === 0) {
      toast.error("Pick at least one vendor");
      return;
    }
    if (!requireVerified("sending an inquiry")) return;
    setSubmitting(true);
    const minCents = budgetMin
      ? Math.round(Number.parseFloat(budgetMin) * 100)
      : null;
    const maxCents = budgetMax
      ? Math.round(Number.parseFloat(budgetMax) * 100)
      : null;
    const guestCountNum = guestCount ? Number.parseInt(guestCount, 10) : null;

    const rows = Array.from(picked).map((vendor_id) => ({
      host_id: user.id,
      vendor_id,
      event_type: eventType,
      event_date: eventDate || null,
      guest_count: guestCountNum,
      location: location.trim() || null,
      budget_min_cents: minCents,
      budget_max_cents: maxCents,
      special_requests: specialRequests.trim() || null,
      status: "new",
    }));

    const { data, error } = await supabase
      .from("inquiries")
      .insert(rows)
      .select("id");
    setSubmitting(false);
    if (error) {
      toast.error(`Couldn't send: ${error.message}`);
      return;
    }
    // Fire new-inquiry email per inquiry, fire-and-forget
    for (const i of (data as { id: string }[] | null) ?? []) {
      supabase.functions
        .invoke("send-transactional-email", {
          body: { kind: "new_inquiry", inquiryId: i.id },
        })
        .catch(() => {});
    }
    toast.success(`Inquiry sent to ${rows.length} vendors`);
    clearDraft("blast");
    navigate("/customer/inquiries");
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40 space-y-3">
          <div>
            <h1 className="font-editorial text-3xl flex items-center gap-2">
              Inquiry blast
              <Sparkles className="w-4 h-4 text-accent" />
            </h1>
            <p className="text-sm text-muted-foreground">
              Send the same inquiry to multiple vendors at once. Each gets
              their own thread — replies stay separate.
            </p>
          </div>
          <SubNavTabs tabs={INQUIRIES_HUB_TABS} />
        </div>

        <div className="grid lg:grid-cols-[1fr_360px] gap-6 p-4 md:p-8">
          {/* Left: vendor picker */}
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search vendors"
                  className="h-10 pl-10 rounded-full bg-secondary/60 border-none"
                />
              </div>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full sm:w-44 h-10 rounded-full bg-secondary/60 border-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="card-soft divide-y divide-border max-h-[60vh] overflow-y-auto">
              {vendorsLoading ? (
                <div className="p-4 space-y-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-12 rounded-sm" />
                  ))}
                </div>
              ) : filteredVendors.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">
                  No vendors match.
                </p>
              ) : (
                filteredVendors.map((v) => {
                  const active = picked.has(v.id);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => togglePicked(v.id)}
                      className={`w-full text-left flex items-center gap-3 px-4 py-3 transition-colors ${
                        active ? "bg-accent/10" : "hover:bg-secondary/40"
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                          active
                            ? "bg-foreground border-foreground"
                            : "border-border"
                        }`}
                      >
                        {active && (
                          <Check className="w-3 h-3 text-background" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {v.business_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {v.category}
                          {v.location ? ` · ${v.location}` : ""}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* Right: inquiry form */}
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="card-soft p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-accent" />
                <p className="font-label text-muted-foreground">
                  Selected
                </p>
                <span className="text-sm font-medium tnum ml-auto">
                  {picked.size}
                </span>
              </div>
              {picked.size === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Pick at least one vendor on the left.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Each selected vendor gets their own copy of this inquiry,
                  with their own conversation thread.
                </p>
              )}
            </div>

            <div className="space-y-3 card-soft p-4">
              <div className="space-y-2">
                <Label htmlFor="b-event">Event type</Label>
                <Select
                  value={eventType}
                  onValueChange={(v) => setEventType(v as EventType)}
                >
                  <SelectTrigger id="b-event" className="h-10">
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
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="b-date">Date</Label>
                  <Input
                    id="b-date"
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="b-guests">Guests</Label>
                  <Input
                    id="b-guests"
                    type="number"
                    min="0"
                    value={guestCount}
                    onChange={(e) => setGuestCount(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-loc">Location</Label>
                <Input
                  id="b-loc"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Brooklyn, NY"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="b-bmin">Budget min</Label>
                  <Input
                    id="b-bmin"
                    type="number"
                    value={budgetMin}
                    onChange={(e) => setBudgetMin(e.target.value)}
                    placeholder="2500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="b-bmax">Budget max</Label>
                  <Input
                    id="b-bmax"
                    type="number"
                    value={budgetMax}
                    onChange={(e) => setBudgetMax(e.target.value)}
                    placeholder="5000"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <Label htmlFor="b-notes">Tell vendors about your event</Label>
                  <div className="flex gap-2 flex-wrap">
                    {picked.size > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="rounded-full h-8 text-xs"
                        onClick={() => {
                          const cats = Array.from(picked).map(
                            (id) =>
                              vendors.find((v) => v.id === id)?.category ?? "",
                          );
                          setSpecialRequests(
                            buildBlastStarter(
                              eventType as EventTypeKey,
                              cats.filter(Boolean),
                            ),
                          );
                        }}
                      >
                        <Sparkles className="w-3 h-3 mr-1.5" />
                        Starter for this event
                      </Button>
                    )}
                    <HostInquiryTemplatePicker
                      currentBody={specialRequests}
                      onApply={setSpecialRequests}
                    />
                  </div>
                </div>
                <Textarea
                  id="b-notes"
                  rows={4}
                  value={specialRequests}
                  onChange={(e) => setSpecialRequests(e.target.value)}
                  placeholder="Color palette, vibe, must-haves."
                />
              </div>
              <Button
                onClick={send}
                disabled={submitting || picked.size === 0}
                className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90 h-11"
              >
                {submitting && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Send to {picked.size}{" "}
                {picked.size === 1 ? "vendor" : "vendors"}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                Only the vendors you pick see your event details and your
                first name. Your email and phone stay private until you
                accept a proposal.
              </p>
            </div>
          </aside>
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
