// Vendora CRM — web twin of the app's Clients screen (More → Vendora
// CRM). Same feature set and vocabulary as mobile — client book built
// from inquiries, private notes, one follow-up reminder per client —
// but laid out for the desktop: client list on the left, the selected
// client's full record on the right. Gated server-side to Pro+ via the
// vendor_crm_clients() RPC (crm_requires_pro), same as the app.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { usePriceLabels } from "@/lib/priceLabels";
import {
  Bell,
  Crown,
  Loader2,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { vendorNavItems as navItems } from "@/data/navItems";

interface ClientRow {
  host_id: string;
  host_name: string;
  host_avatar: string | null;
  inquiries_count: number;
  booked_count: number;
  first_inquiry_at: string;
  last_activity_at: string;
  next_event_date: string | null;
  last_event_date: string | null;
  follow_up_at: string | null;
  follow_up_note: string | null;
  notes_count: number;
}

interface EventRow {
  id: string;
  event_type: string | null;
  event_date: string | null;
  guest_count: number | null;
  location: string | null;
  status: string | null;
  created_at: string;
  vendor_confirmed_booked_at: string | null;
  paid_booked_at: string | null;
}

interface NoteRow {
  id: string;
  body: string;
  created_at: string;
}

// Label: t(`followUp.options.${key}`) in the vendorCrm namespace.
const FOLLOW_UPS = [
  { key: "tomorrow", days: 1 },
  { key: "in3Days", days: 3 },
  { key: "nextWeek", days: 7 },
  { key: "in2Weeks", days: 14 },
  { key: "inAMonth", days: 30 },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// In the vendor's language; callers re-render on a language switch
// through their useTranslation hook.
function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString(i18n.language, { month: "short", day: "numeric", year: "numeric" });
}

export default function VendorCrmPage() {
  const { t } = useTranslation("vendorCrm");
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [gated, setGated] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [listingIds, setListingIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const [{ data: rows, error }, { data: listings }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("vendor_crm_clients"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("vendor_profiles").select("id").eq("user_id", userId),
    ]);
    setListingIds(((listings ?? []) as { id: string }[]).map((l) => l.id));
    if (error) {
      setGated(!!error.message?.includes("crm_requires_pro"));
      setClients([]);
    } else {
      setGated(false);
      setClients((rows ?? []) as ClientRow[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.host_name.toLowerCase().includes(q));
  }, [clients, query]);

  const selected = clients.find((c) => c.host_id === selectedId) ?? filtered[0] ?? null;

  return (
    <div className="min-h-screen flex relative bg-[var(--vendor-canvas)]">
      <DashboardSidebar items={navItems} title={t("sidebarTitle")} backPath="/" />
      <main className="flex-1 min-w-0 pb-24 lg:pb-0">
        <div
          className="px-5 md:px-8 pt-8 pb-6"
          style={{ borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}
        >
          <h1 className="text-3xl md:text-4xl tracking-tight">
            {t("title")} <span className="text-accent">✦</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("subtitle")}
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-[1400px]">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pt-8">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("loading")}
            </div>
          ) : gated ? (
            <div className="card-soft mx-auto mt-6 max-w-xl p-8 text-center">
              <Crown className="mx-auto h-8 w-8 text-accent" />
              <h2 className="font-editorial text-3xl mt-4">{t("gate.title")}</h2>
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                {t("gate.body")}
              </p>
              <Link
                to="/vendor/subscription"
                className="inline-flex justify-center items-center mt-6 rounded-full bg-gold px-6 text-sm font-bold text-foreground hover:bg-gold-hover transition-colors h-11"
              >
                {t("gate.cta")}
              </Link>
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
              {/* ── Client list ── */}
              <div className="card-soft p-4 self-start">
                <div className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("list.search")}
                    className="w-full bg-transparent text-sm outline-none"
                  />
                </div>
                <div className="mt-3 max-h-[62vh] space-y-1 overflow-y-auto pr-1">
                  {filtered.length === 0 ? (
                    <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                      {query
                        ? t("list.noMatch")
                        : t("list.empty")}
                    </p>
                  ) : (
                    filtered.map((c) => {
                      const active = selected?.host_id === c.host_id;
                      return (
                        <button
                          key={c.host_id}
                          onClick={() => setSelectedId(c.host_id)}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                            active ? "bg-secondary" : "hover:bg-secondary/60"
                          }`}
                        >
                          {c.host_avatar ? (
                            <img
                              src={c.host_avatar}
                              alt=""
                              className="h-9 w-9 rounded-full object-cover"
                            />
                          ) : (
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted font-editorial not-italic text-sm">
                              {initials(c.host_name)}
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {c.host_name}
                            </span>
                            <span className="block text-[11.5px] text-muted-foreground">
                              {t("list.inquiries", { count: c.inquiries_count })}
                              {c.booked_count > 0 ? t("list.booked", { count: c.booked_count }) : ""}
                            </span>
                          </span>
                          {c.follow_up_at ? (
                            <Bell className="h-3.5 w-3.5 shrink-0 text-accent" />
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* ── Client record ── */}
              {selected ? (
                <ClientRecord
                  key={selected.host_id}
                  client={selected}
                  listingIds={listingIds}
                  userId={userId!}
                  onChanged={() => void load()}
                />
              ) : (
                <div className="card-soft flex items-center justify-center p-12 text-sm text-muted-foreground">
                  {t("list.selectPrompt")}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}

function ClientRecord({
  client,
  listingIds,
  userId,
  onChanged,
}: {
  client: ClientRow;
  listingIds: string[];
  userId: string;
  onChanged: () => void;
}) {
  const { t } = useTranslation("vendorCrm");
  const { eventType } = usePriceLabels();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [followUpAt, setFollowUpAt] = useState<string | null>(client.follow_up_at);
  const [savingFollow, setSavingFollow] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: evs }, { data: ns }] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("inquiries")
          .select(
            "id, event_type, event_date, guest_count, location, status, created_at, vendor_confirmed_booked_at, paid_booked_at",
          )
          .eq("host_id", client.host_id)
          .in("vendor_id", listingIds.length ? listingIds : ["00000000-0000-0000-0000-000000000000"])
          .order("created_at", { ascending: false })
          .limit(25),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("vendor_crm_notes")
          .select("id, body, created_at")
          .eq("host_id", client.host_id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (!alive) return;
      setEvents((evs ?? []) as EventRow[]);
      setNotes((ns ?? []) as NoteRow[]);
    })();
    return () => {
      alive = false;
    };
  }, [client.host_id, listingIds]);

  async function addNote() {
    const body = noteText.trim();
    if (!body || savingNote) return;
    setSavingNote(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("vendor_crm_notes")
      .insert({ user_id: userId, host_id: client.host_id, body })
      .select("id, body, created_at")
      .single();
    setSavingNote(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNotes((prev) => [data as NoteRow, ...prev]);
    setNoteText("");
    onChanged();
  }

  async function removeNote(n: NoteRow) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("vendor_crm_notes").delete().eq("id", n.id);
    setNotes((prev) => prev.filter((x) => x.id !== n.id));
    onChanged();
  }

  async function setFollowUp(days: number | null) {
    if (savingFollow) return;
    setSavingFollow(true);
    const at = days === null ? null : new Date(Date.now() + days * 86400_000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("vendor_crm_meta").upsert(
      {
        user_id: userId,
        host_id: client.host_id,
        follow_up_at: at,
        follow_up_note: at ? `Follow up with ${client.host_name}.` : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,host_id" },
    );
    setSavingFollow(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setFollowUpAt(at);
    onChanged();
    if (at) toast.success(t("followUp.toast", { date: fmtDate(at) }));
  }

  return (
    <div className="space-y-5">
      {/* Header card */}
      <div className="card-soft flex flex-wrap items-center gap-4 p-6">
        {client.host_avatar ? (
          <img src={client.host_avatar} alt="" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted font-editorial not-italic text-lg">
            {initials(client.host_name)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="font-editorial not-italic text-2xl">{client.host_name}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("record.clientSince", { date: fmtDate(client.first_inquiry_at) })}
            {client.next_event_date
              ? t("record.nextEvent", { date: fmtDate(client.next_event_date) })
              : ""}
          </p>
        </div>
        <Link
          to="/vendor/inbox"
          className="inline-flex justify-center items-center rounded-full bg-gold px-5 text-sm font-bold text-foreground hover:bg-gold-hover transition-colors h-9"
        >
          {t("record.openInbox")}
        </Link>
      </div>

      {/* Follow-up */}
      <div className="card-soft p-6">
        <p className="font-label text-accent mb-3">{t("followUp.title")}</p>
        {followUpAt ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
            <p className="m-0 flex items-center gap-2 text-sm">
              <Bell className="h-4 w-4 text-accent" />
              {t("followUp.scheduled", { date: fmtDate(followUpAt) })}
            </p>
            <button
              onClick={() => void setFollowUp(null)}
              disabled={savingFollow}
              className="text-xs font-semibold text-muted-foreground hover:text-accent"
            >
              {t("followUp.clear")}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {FOLLOW_UPS.map((f) => (
              <button
                key={f.days}
                onClick={() => void setFollowUp(f.days)}
                disabled={savingFollow}
                className="rounded-full bg-secondary px-4 py-1.5 text-[13px] font-medium hover:bg-muted transition-colors"
              >
                {t(`followUp.options.${f.key}`)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="card-soft p-6">
        <p className="font-label text-accent mb-3">{t("notes.title")}</p>
        <div className="rounded-xl border border-border bg-background p-3">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={2}
            placeholder={t("notes.placeholder")}
            className="w-full resize-none bg-transparent text-sm outline-none"
          />
          <div className="flex justify-end">
            <button
              onClick={() => void addNote()}
              disabled={!noteText.trim() || savingNote}
              className="inline-flex justify-center items-center rounded-full bg-gold px-4 text-xs font-bold text-foreground disabled:bg-gold-muted hover:bg-gold-hover transition-colors h-9"
            >
              {savingNote ? t("notes.saving") : t("notes.save")}
            </button>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="rounded-xl border border-border bg-background px-4 py-3">
              <p className="m-0 text-sm leading-relaxed">{n.body}</p>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{fmtDate(n.created_at)}</span>
                <button
                  onClick={() => void removeNote(n)}
                  aria-label={t("notes.delete")}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Events */}
      <div className="card-soft p-6">
        <p className="font-label text-accent mb-3">{t("events.title")}</p>
        {events.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">{t("events.empty")}</p>
        ) : (
          <div className="space-y-2">
            {events.map((e) => {
              const booked =
                e.status === "won" || !!e.vendor_confirmed_booked_at || !!e.paid_booked_at;
              return (
                <div
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="m-0 truncate text-sm font-medium">
                      {eventType(e.event_type, t("events.fallback"))}
                    </p>
                    <p className="m-0 mt-0.5 text-[11.5px] text-muted-foreground">
                      {[
                        e.event_date ? fmtDate(e.event_date) : null,
                        e.guest_count ? t("events.guests", { count: e.guest_count }) : null,
                        e.location?.trim() || null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || t("events.received", { date: fmtDate(e.created_at) })}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      booked
                        ? "bg-foreground text-background"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {booked ? (
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3 w-3 fill-current text-accent" /> {t("events.booked")}
                      </span>
                    ) : (
                      t("events.inquiry")
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
