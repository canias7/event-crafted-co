import { useEffect, useState } from "react";
import { User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { vendorImageUrl } from "@/lib/storage";

// Public-facing Team section for the vendor detail page. Renders a
// grid of team-member cards (photo + name + role + bio) ordered by
// display_order. Returns null when the vendor hasn't added anyone.

interface TeamMember {
  id: string;
  display_name: string;
  role: string | null;
  bio: string | null;
  photo_storage_path: string | null;
  is_owner: boolean;
}

export function VendorTeamPublic({ vendorId }: { vendorId: string }) {
  const [members, setMembers] = useState<TeamMember[] | null>(null);

  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;
    supabase
      .from("vendor_team_bios")
      .select("id, display_name, role, bio, photo_storage_path, is_owner, display_order")
      .eq("vendor_id", vendorId)
      .order("is_owner", { ascending: false })
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setMembers((data as TeamMember[] | null) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  if (!members || members.length === 0) return null;

  return (
    <div>
      <p className="font-label text-accent mb-4">Team</p>
      <h2 className="font-display text-3xl mb-8">Meet the team</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-8">
        {members.map((m) => (
          <div key={m.id} className="space-y-3">
            {m.photo_storage_path ? (
              <img
                src={vendorImageUrl(m.photo_storage_path, { width: 600, height: 600 })}
                alt={m.display_name}
                loading="lazy"
                className="aspect-square w-full rounded-sm object-cover bg-muted"
              />
            ) : (
              <div className="aspect-square w-full rounded-sm bg-muted flex items-center justify-center text-muted-foreground">
                <User className="w-10 h-10" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-display text-lg leading-tight">
                  {m.display_name}
                </p>
                {m.is_owner && (
                  <span className="text-[10px] uppercase tracking-wide bg-accent/15 text-accent rounded-full px-1.5 py-0.5">
                    Owner
                  </span>
                )}
              </div>
              {m.role && (
                <p className="text-xs text-muted-foreground mt-0.5">{m.role}</p>
              )}
              {m.bio && (
                <p className="text-sm text-foreground/75 mt-2 leading-relaxed">
                  {m.bio}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
