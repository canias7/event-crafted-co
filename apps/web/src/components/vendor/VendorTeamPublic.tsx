// Meet the Team — public section on the vendor detail page, per the
// reference mock. Renders the brand's visible team members (RLS also
// enforces the account-level profiles.show_team toggle, so an anon
// visitor only ever receives rows the vendor wants shown). Hidden
// entirely when there's nothing to show.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TeamMember {
  id: string;
  full_name: string;
  role_title: string;
  bio: string | null;
  specialty: string | null;
  years_with_business: string | null;
  fun_fact: string | null;
  link_url: string | null;
  photo_url: string | null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function externalHref(link: string): string {
  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
}

export function VendorTeamPublic({ userId }: { userId: string }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [ownerHides, setOwnerHides] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: rows }, { data: prof }] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("vendor_team_profiles")
          .select(
            "id, full_name, role_title, bio, specialty, years_with_business, fun_fact, link_url, photo_url",
          )
          .eq("user_id", userId)
          .eq("visible", true)
          .order("display_order", { ascending: true })
          .order("created_at", { ascending: true }),
        // Owner preview: RLS lets owners read their own hidden rows, so
        // also respect the toggle client-side when it's readable (anon
        // gets null here and relies on the RLS enforcement instead).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("profiles")
          .select("show_team")
          .eq("id", userId)
          .maybeSingle(),
      ]);
      if (!alive) return;
      setMembers((rows ?? []) as TeamMember[]);
      setOwnerHides((prof as { show_team?: boolean } | null)?.show_team === false);
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  if (ownerHides || members.length === 0) return null;

  return (
    <div>
      <p className="font-label text-accent mb-4">The people behind the details</p>
      <h2 className="font-editorial text-4xl mb-6">
        Meet the Team <span className="text-accent">✦</span>
      </h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map((m) => {
          const open = expanded === m.id;
          const hasMore =
            !!m.specialty || !!m.years_with_business || !!m.fun_fact || !!m.link_url;
          return (
            <div key={m.id} className="card-soft overflow-hidden">
              {m.photo_url ? (
                <img
                  src={m.photo_url}
                  alt={m.full_name}
                  loading="lazy"
                  className="w-full aspect-[4/3] object-cover"
                />
              ) : (
                <div className="w-full aspect-[4/3] bg-muted flex items-center justify-center">
                  <span className="font-editorial text-4xl text-muted-foreground">
                    {initials(m.full_name)}
                  </span>
                </div>
              )}
              <div className="p-4">
                <p className="font-editorial text-xl">{m.full_name}</p>
                <p className="text-xs text-accent mt-0.5">{m.role_title}</p>
                {m.bio && (
                  <p
                    className={`text-sm text-foreground/75 leading-relaxed mt-3 ${
                      open ? "" : "line-clamp-3"
                    }`}
                  >
                    {m.bio}
                  </p>
                )}
                {open && (
                  <div className="mt-3 space-y-1.5">
                    {m.specialty && (
                      <p className="text-xs text-muted-foreground">
                        <span className="text-foreground/80 font-medium">Specialty:</span>{" "}
                        {m.specialty}
                      </p>
                    )}
                    {m.years_with_business && (
                      <p className="text-xs text-muted-foreground">
                        <span className="text-foreground/80 font-medium">
                          With the business:
                        </span>{" "}
                        {m.years_with_business}
                      </p>
                    )}
                    {m.fun_fact && (
                      <p className="text-xs text-muted-foreground italic">
                        ✦ {m.fun_fact}
                      </p>
                    )}
                    {m.link_url && (
                      <a
                        href={externalHref(m.link_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-accent underline underline-offset-2 break-all"
                      >
                        {m.link_url}
                      </a>
                    )}
                  </div>
                )}
                {(hasMore || (m.bio ?? "").length > 140) && (
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : m.id)}
                    className="mt-3 text-xs font-medium text-foreground/80 hover:text-accent transition-colors"
                  >
                    {open ? "Show less" : "View bio →"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
