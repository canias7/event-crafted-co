import { useState } from "react";
import { Link } from "react-router-dom";
import {
  LayoutDashboard, Users, Store, FileText, Percent, CalendarDays,
  CreditCard, UserCheck, BarChart3, Settings, Eye, Check, X, MoreHorizontal,
  TrendingUp, AlertTriangle, Clock, DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { StatCard } from "@/components/shared/StatCard";
import { adminStats, vendorApplications } from "@/data/sampleData";

const navItems = [
  { label: "Overview", path: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Applications", path: "/admin/applications", icon: UserCheck },
  { label: "Vendors", path: "/admin/vendors", icon: Store },
  { label: "Contracts", path: "/admin/contracts", icon: FileText },
  { label: "Fees", path: "/admin/fees", icon: Percent },
  { label: "Bookings", path: "/admin/bookings", icon: CalendarDays },
  { label: "Payments", path: "/admin/payments", icon: CreditCard },
  { label: "Customers", path: "/admin/customers", icon: Users },
  { label: "Reports", path: "/admin/reports", icon: BarChart3 },
  { label: "Settings", path: "/admin/settings", icon: Settings },
];

export default function AdminDashboard() {
  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Management" backPath="/" />

      <main className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <h1 className="font-display text-xl">Platform Overview</h1>
          <p className="text-sm text-muted-foreground">Admin Dashboard</p>
        </div>

        <div className="p-4 md:p-8 space-y-8">
          {/* Stats grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Vendors" value={adminStats.totalVendors} icon={Store} />
            <StatCard label="Pending Approvals" value={adminStats.pendingApprovals} icon={UserCheck} accent />
            <StatCard label="Active Customers" value={adminStats.activeCustomers.toLocaleString()} icon={Users} trend="+124 this month" />
            <StatCard label="Platform Revenue" value={`$${(adminStats.platformRevenue / 1000).toFixed(0)}k`} icon={DollarSign} trend="+22% vs last month" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Bookings" value={adminStats.totalBookings.toLocaleString()} icon={CalendarDays} />
            <StatCard label="Commission Total" value={`$${(adminStats.commissionTotal / 1000).toFixed(0)}k`} icon={Percent} />
            <StatCard label="Expiring Contracts" value={adminStats.expiringContracts} icon={AlertTriangle} />
            <StatCard label="Recent Payments" value={adminStats.recentPayments} icon={CreditCard} trend="Last 7 days" />
          </div>

          {/* Pending vendor approvals */}
          <div className="bg-card rounded-2xl p-5 card-shadow">
            <div className="flex items-center justify-between mb-4">
              <p className="font-label text-muted-foreground">Pending Vendor Applications</p>
              <Link to="/admin/applications" className="text-xs text-accent font-medium">View all ({adminStats.pendingApprovals})</Link>
            </div>
            <div className="space-y-3">
              {vendorApplications.map((app) => (
                <div key={app.id} className="flex items-center gap-4 p-4 rounded-xl bg-secondary/50">
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                    <Store className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{app.businessName}</p>
                      <Badge variant={app.status === "pending" ? "outline" : "secondary"}>
                        {app.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {app.ownerName} · {app.category} · {app.experience} experience · {app.location}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground tnum hidden sm:block">Applied {app.appliedDate}</p>
                    <Button size="sm" variant="ghost" className="h-8"><Eye className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" className="h-8 bg-accent text-accent-foreground hover:bg-accent/90"><Check className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-8 text-destructive"><X className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Recent bookings */}
            <div className="bg-card rounded-2xl p-5 card-shadow">
              <p className="font-label text-muted-foreground mb-4">Recent Bookings</p>
              <div className="space-y-3">
                {[
                  { customer: "Sarah Mitchell", vendor: "Luminara Photography", amount: "$3,250", status: "confirmed" },
                  { customer: "David Park", vendor: "The Grand Atelier", amount: "$8,500", status: "pending" },
                  { customer: "Lisa Chen", vendor: "Bloom & Petal", amount: "$1,800", status: "confirmed" },
                  { customer: "James Wilson", vendor: "DJ Marco Stellare", amount: "$1,800", status: "confirmed" },
                ].map((b, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                    <div>
                      <p className="text-sm font-medium">{b.customer}</p>
                      <p className="text-xs text-muted-foreground">{b.vendor}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm tnum font-medium">{b.amount}</p>
                      <Badge variant={b.status === "confirmed" ? "secondary" : "outline"} className="text-[10px]">
                        {b.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Expiring contracts */}
            <div className="bg-card rounded-2xl p-5 card-shadow">
              <p className="font-label text-muted-foreground mb-4">Expiring Contracts</p>
              <div className="space-y-3">
                {[
                  { vendor: "Harmony Sound Co.", expires: "Mar 28, 2026", term: "6 months", fee: "10%" },
                  { vendor: "Sweet Creations Bakery", expires: "Apr 5, 2026", term: "3 months", fee: "12%" },
                  { vendor: "Stellar Events", expires: "Apr 12, 2026", term: "1 year", fee: "8%" },
                ].map((c, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                    <div>
                      <p className="text-sm font-medium">{c.vendor}</p>
                      <p className="text-xs text-muted-foreground">{c.term} · {c.fee} fee</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs tnum text-destructive font-medium">{c.expires}</p>
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] mt-1">Renew</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Revenue breakdown */}
          <div className="bg-card rounded-2xl p-5 card-shadow">
            <p className="font-label text-muted-foreground mb-4">Revenue & Commission Summary</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Gross Bookings", value: "$284,750" },
                { label: "Platform Commission", value: "$42,712" },
                { label: "Avg. Fee Rate", value: "10.2%" },
                { label: "Net Vendor Payouts", value: "$242,038" },
              ].map((item, i) => (
                <div key={i} className="p-4 rounded-xl bg-secondary/50 text-center">
                  <p className="font-label text-muted-foreground mb-1">{item.label}</p>
                  <p className="text-xl font-display tnum">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
