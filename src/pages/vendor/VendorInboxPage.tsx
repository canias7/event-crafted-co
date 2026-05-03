import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LayoutDashboard, User, CalendarDays, Clock, CreditCard, FileText, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { label: "Dashboard", path: "/vendor/dashboard", icon: LayoutDashboard },
  { label: "Inbox", path: "/vendor/inbox", icon: Inbox },
  { label: "Profile", path: "/vendor/profile", icon: User },
  { label: "Appointments", path: "/vendor/appointments", icon: CalendarDays },
  { label: "Availability", path: "/vendor/availability", icon: Clock },
  { label: "Payments", path: "/vendor/payments", icon: CreditCard },
  { label: "Contract", path: "/vendor/contract", icon: FileText },
];

interface InquiryRow {
  id: string;
  event_type: string;
  event_date: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  status: string;
  quality_score: number | null;
  created_at: string;
  host: { display_name: string | null } | null;
}

function fmtMoney(cents: number | null) {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString()}`;
}

const statusVariant: Record<string, string> = {
  new: "bg-accent text-accent-foreground",
  drafted: "bg-secondary text-secondary-foreground",
  replied: "bg-primary text-primary-foreground",
  won: "bg-accent text-accent-foreground",
  lost: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
};

export default function VendorInboxPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: vp } = await supabase
        .from("vendor_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!vp) {
        setRows([]);
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("inquiries")
        .select("id,event_type,event_date,budget_min_cents,budget_max_cents,status,quality_score,created_at,host:profiles!inquiries_host_id_fkey(display_name)")
        .eq("vendor_id", vp.id)
        .order("created_at", { ascending: false });
      setRows((data as any) ?? []);
      setLoading(false);
    })();
  }, [user]);

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />
      <main className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <h1 className="font-display text-xl">Inbox</h1>
          <p className="text-sm text-muted-foreground">All inquiries from hosts</p>
        </div>

        <div className="p-4 md:p-8">
          <div className="bg-card rounded-2xl card-shadow overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-muted-foreground">Loading inquiries…</div>
            ) : rows.length === 0 ? (
              <div className="p-16 text-center">
                <Inbox className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="font-display text-xl mb-1">No inquiries yet</p>
                <p className="text-sm text-muted-foreground">When hosts reach out, you'll see them here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-4 font-label text-muted-foreground">Host</th>
                      <th className="text-left p-4 font-label text-muted-foreground">Event</th>
                      <th className="text-left p-4 font-label text-muted-foreground">Date</th>
                      <th className="text-left p-4 font-label text-muted-foreground">Budget</th>
                      <th className="text-left p-4 font-label text-muted-foreground">Status</th>
                      <th className="text-left p-4 font-label text-muted-foreground">Quality</th>
                      <th className="text-left p-4 font-label text-muted-foreground">Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/40 cursor-pointer">
                        <td className="p-4">
                          <Link to={`/vendor/inbox/${r.id}`} className="font-medium block">
                            {r.host?.display_name ?? "Unknown host"}
                          </Link>
                        </td>
                        <td className="p-4 capitalize text-muted-foreground">{r.event_type.replace("_", " ")}</td>
                        <td className="p-4 tnum text-muted-foreground">{r.event_date ?? "—"}</td>
                        <td className="p-4 tnum text-muted-foreground">
                          {fmtMoney(r.budget_min_cents)} – {fmtMoney(r.budget_max_cents)}
                        </td>
                        <td className="p-4">
                          <Badge className={statusVariant[r.status] ?? ""}>{r.status}</Badge>
                        </td>
                        <td className="p-4 tnum">{r.quality_score ?? "—"}</td>
                        <td className="p-4 tnum text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}