import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { VendoraLogo } from "@/components/shared/VendoraLogo";

// /my-sites — list every ai_sites row owned by the signed-in user.
// Each card links to /s/<slug> (live) and back into the builder
// (TODO when we add an /website-builder?site=<id> entry point).
// For now editing means going back to /website-builder and starting
// over — the in-place edit endpoint exists, the UI is the next step.

type SiteRow = {
  id: string;
  slug: string;
  title: string;
  view_count: number;
  edit_count: number;
  created_at: string;
  updated_at: string;
};

// deno-lint-ignore-file no-explicit-any
const sb = supabase as unknown as {
  from: (t: string) => any;
};

export default function MySitesPage() {
  const { session, loading: authLoading } = useAuth() as {
    session: { user: { id: string } } | null;
    loading?: boolean;
  };
  const [sites, setSites] = useState<SiteRow[] | null>(null);
  const [rsvpCounts, setRsvpCounts] = useState<Record<string, number>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await sb
        .from("ai_sites")
        .select("id, slug, title, view_count, edit_count, created_at, updated_at")
        .eq("owner_user_id", session.user.id)
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        setSites([]);
        return;
      }
      const rows = (data as SiteRow[]) ?? [];
      setSites(rows);

      // Fetch RSVP counts per site (RLS lets owners read).
      if (rows.length > 0) {
        const ids = rows.map((s) => s.id);
        const { data: rsvps } = await sb
          .from("ai_site_rsvps")
          .select("site_id")
          .in("site_id", ids);
        const counts: Record<string, number> = {};
        for (const r of (rsvps as { site_id: string }[]) ?? []) {
          counts[r.site_id] = (counts[r.site_id] ?? 0) + 1;
        }
        if (!cancelled) setRsvpCounts(counts);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  async function deleteSite(siteId: string) {
    if (!confirm("Delete this site? Guests using the link will see a 404.")) return;
    setDeletingId(siteId);
    const { error } = await sb.from("ai_sites").delete().eq("id", siteId);
    setDeletingId(null);
    if (!error) {
      setSites((prev) => prev?.filter((s) => s.id !== siteId) ?? null);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa]">
        <div className="text-[13px] text-black/40">Loading…</div>
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-[#fafafa] text-black">
      <header className="flex items-center justify-between px-6 py-5 md:px-10 md:py-6 border-b border-black/10">
        <Link to="/" className="flex items-center gap-3">
          <VendoraLogo size="sm" color="#000" />
          <span className="text-[12px] uppercase tracking-[2px] text-black/50">
            My sites
          </span>
        </Link>
        <Link
          to="/website-builder"
          className="text-[13px] bg-black text-white rounded-full px-5 py-2.5 hover:bg-black/90 transition-colors"
        >
          + New site
        </Link>
      </header>

      <main className="max-w-5xl mx-auto px-6 md:px-10 py-10">
        {sites === null && (
          <div className="text-center text-black/40 text-[13px]">Loading your sites…</div>
        )}

        {sites !== null && sites.length === 0 && (
          <div className="text-center py-20">
            <div className="text-[20px] font-medium mb-2">No sites yet</div>
            <div className="text-[14px] text-black/60 mb-6">
              Build your first event site — wedding, birthday, baby shower…
            </div>
            <Link
              to="/website-builder"
              className="inline-block bg-black text-white rounded-full px-6 py-3 text-[13px] hover:bg-black/90 transition-colors"
            >
              Start building
            </Link>
          </div>
        )}

        {sites && sites.length > 0 && (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sites.map((s) => {
              const rsvps = rsvpCounts[s.id] ?? 0;
              const updated = new Date(s.updated_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              });
              return (
                <li
                  key={s.id}
                  className="bg-white rounded-2xl border border-black/10 p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="min-w-0">
                      <div className="text-[16px] font-medium truncate">{s.title}</div>
                      <code className="text-[11px] text-black/50 truncate block mt-0.5">
                        /s/{s.slug}
                      </code>
                    </div>
                    <button
                      onClick={() => deleteSite(s.id)}
                      disabled={deletingId === s.id}
                      className="text-[11px] text-black/40 hover:text-red-600 transition-colors flex-shrink-0"
                      aria-label="Delete site"
                    >
                      {deletingId === s.id ? "…" : "Delete"}
                    </button>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-black/50 mb-4">
                    <span>{s.view_count} views</span>
                    <span>{rsvps} RSVP{rsvps === 1 ? "" : "s"}</span>
                    <span>{s.edit_count} edits</span>
                    <span>Updated {updated}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <Link
                      to={`/website-builder?site=${s.id}`}
                      className="text-center text-[12px] bg-black text-white rounded-full px-4 py-2 hover:bg-black/90 transition-colors"
                    >
                      Edit
                    </Link>
                    <Link
                      to={`/my-sites/${s.slug}/rsvps`}
                      className="text-center text-[12px] border border-black/15 rounded-full px-4 py-2 hover:bg-black/5 transition-colors"
                    >
                      RSVPs ({rsvps})
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      to={`/s/${s.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-center text-[12px] border border-black/15 rounded-full px-4 py-2 hover:bg-black/5 transition-colors"
                    >
                      View live
                    </Link>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            `${window.location.origin}/s/${s.slug}`,
                          );
                        } catch {
                          // older browsers
                        }
                      }}
                      className="text-center text-[12px] border border-black/15 rounded-full px-4 py-2 hover:bg-black/5 transition-colors"
                    >
                      Copy link
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
