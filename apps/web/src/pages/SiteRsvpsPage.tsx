import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { VendoraLogo } from "@/components/shared/VendoraLogo";

// /my-sites/:slug/rsvps — owner-only dashboard showing every RSVP
// for a single site. RLS gates the SELECT to the owner; if the user
// isn't signed in we redirect to /login.

type RsvpRow = {
  id: string;
  guest_name: string;
  guest_email: string | null;
  attending: "yes" | "no" | "maybe";
  guests_count: number;
  message: string | null;
  created_at: string;
};

// deno-lint-ignore-file no-explicit-any
const sb = supabase as unknown as { from: (t: string) => any };

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function attendingPill(value: "yes" | "no" | "maybe") {
  const cfg = {
    yes: { bg: "bg-green-100", text: "text-green-800", label: "Going" },
    maybe: { bg: "bg-zinc-100", text: "text-zinc-800", label: "Maybe" },
    no: { bg: "bg-red-100", text: "text-red-700", label: "Not going" },
  }[value];
  return (
    <span
      className={`inline-block ${cfg.bg} ${cfg.text} text-[11px] uppercase tracking-wider rounded-full px-2 py-0.5`}
    >
      {cfg.label}
    </span>
  );
}

export default function SiteRsvpsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { session, loading: authLoading } = useAuth() as {
    session: { user: { id: string } } | null;
    loading?: boolean;
  };
  const [site, setSite] = useState<{ id: string; title: string } | null>(null);
  const [rsvps, setRsvps] = useState<RsvpRow[] | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug || !session?.user?.id) return;
    let cancelled = false;
    (async () => {
      const { data: siteRow, error: siteErr } = await sb
        .from("ai_sites")
        .select("id, title, owner_user_id")
        .eq("slug", slug)
        .maybeSingle();
      if (cancelled) return;
      if (
        siteErr ||
        !siteRow ||
        (siteRow as { owner_user_id: string | null }).owner_user_id !==
          session.user.id
      ) {
        setNotFound(true);
        return;
      }
      const s = siteRow as { id: string; title: string };
      setSite({ id: s.id, title: s.title });
      const { data: rsvpRows } = await sb
        .from("ai_site_rsvps")
        .select(
          "id, guest_name, guest_email, attending, guests_count, message, created_at",
        )
        .eq("site_id", s.id)
        .order("created_at", { ascending: false });
      if (!cancelled) setRsvps((rsvpRows as RsvpRow[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, session?.user?.id]);

  const counts = useMemo(() => {
    if (!rsvps) return { total: 0, yes: 0, maybe: 0, no: 0, guests: 0 };
    return rsvps.reduce(
      (acc, r) => {
        acc.total += 1;
        acc[r.attending] += 1;
        if (r.attending === "yes") acc.guests += r.guests_count;
        return acc;
      },
      { total: 0, yes: 0, maybe: 0, no: 0, guests: 0 },
    );
  }, [rsvps]);

  function exportCsv() {
    if (!rsvps || rsvps.length === 0) return;
    const headers = [
      "Name",
      "Email",
      "Attending",
      "Party size",
      "Message",
      "Submitted",
    ];
    const rows = rsvps.map((r) =>
      [
        csvEscape(r.guest_name),
        csvEscape(r.guest_email ?? ""),
        r.attending,
        String(r.guests_count),
        csvEscape(r.message ?? ""),
        new Date(r.created_at).toISOString(),
      ].join(","),
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}-rsvps.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa]">
        <div className="text-[13px] text-black/40">Loading…</div>
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-[#fafafa]">
        <div className="text-[14px] uppercase tracking-[2px] text-black/40 mb-4">
          Not found
        </div>
        <h1 className="text-[24px] font-medium mb-3">
          We couldn't find that site (or it isn't yours).
        </h1>
        <Link
          to="/my-sites"
          className="mt-4 bg-black text-white rounded-full px-5 py-2.5 text-[13px] hover:bg-black/90 transition-colors"
        >
          Back to my sites
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa] text-black">
      <header className="flex items-center justify-between px-6 py-5 md:px-10 md:py-6 border-b border-black/10 gap-3 flex-wrap">
        <Link to="/" className="flex items-center gap-3">
          <VendoraLogo size="sm" color="#000" />
          <span className="text-[12px] uppercase tracking-[2px] text-black/50">
            RSVPs
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            to="/my-sites"
            className="text-[13px] text-black/60 hover:text-black"
          >
            ← My sites
          </Link>
          <button
            onClick={exportCsv}
            disabled={!rsvps || rsvps.length === 0}
            className="text-[13px] bg-black text-white rounded-full px-4 py-2 hover:bg-black/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Export CSV
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 md:px-10 py-10">
        <div className="mb-8">
          <div className="text-[11px] uppercase tracking-[2px] text-black/40 mb-1">
            RSVPs for
          </div>
          <h1 className="text-[28px] font-medium">{site?.title ?? slug}</h1>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="bg-white rounded-2xl border border-black/10 p-4">
            <div className="text-[11px] uppercase tracking-wider text-black/50 mb-1">
              Total replies
            </div>
            <div className="text-[28px] font-medium">{counts.total}</div>
          </div>
          <div className="bg-white rounded-2xl border border-black/10 p-4">
            <div className="text-[11px] uppercase tracking-wider text-green-700 mb-1">
              Going
            </div>
            <div className="text-[28px] font-medium">{counts.yes}</div>
          </div>
          <div className="bg-white rounded-2xl border border-black/10 p-4">
            <div className="text-[11px] uppercase tracking-wider text-zinc-800 mb-1">
              Maybe
            </div>
            <div className="text-[28px] font-medium">{counts.maybe}</div>
          </div>
          <div className="bg-white rounded-2xl border border-black/10 p-4">
            <div className="text-[11px] uppercase tracking-wider text-black/50 mb-1">
              Expected guests
            </div>
            <div className="text-[28px] font-medium">{counts.guests}</div>
          </div>
        </div>

        {rsvps === null && (
          <div className="text-center text-black/40 text-[13px] py-12">
            Loading replies…
          </div>
        )}

        {rsvps !== null && rsvps.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-black/10">
            <div className="text-[16px] font-medium mb-2">No RSVPs yet</div>
            <div className="text-[13px] text-black/50">
              Share your site link — replies will appear here.
            </div>
          </div>
        )}

        {rsvps && rsvps.length > 0 && (
          <div className="bg-white rounded-2xl border border-black/10 overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-black/5 text-[11px] uppercase tracking-wider text-black/50">
                <tr>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">
                    Email
                  </th>
                  <th className="text-left px-4 py-3">Reply</th>
                  <th className="text-left px-4 py-3">Party</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">
                    Note
                  </th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">
                    When
                  </th>
                </tr>
              </thead>
              <tbody>
                {rsvps.map((r) => (
                  <tr key={r.id} className="border-t border-black/5">
                    <td className="px-4 py-3 font-medium">{r.guest_name}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-black/60">
                      {r.guest_email ?? "—"}
                    </td>
                    <td className="px-4 py-3">{attendingPill(r.attending)}</td>
                    <td className="px-4 py-3 text-black/60">{r.guests_count}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-black/60 max-w-[260px] truncate">
                      {r.message ?? "—"}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-black/40 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
