import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LayoutDashboard, User, CalendarDays, Clock, CreditCard, FileText,
  Star, Bell, TrendingUp, Users, DollarSign, Percent, Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { StatCard } from "@/components/shared/StatCard";
import { vendorNavItems as navItems } from "@/data/navItems";

export default function VendorDashboard() {
  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 flex items-center justify-between sticky top-0 z-40">
          <div>
            <h1 className="font-display text-xl">Luminara Photography</h1>
            <p className="text-sm text-muted-foreground">Vendor Dashboard</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9">
              <Bell className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="p-4 md:p-8 space-y-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="New Requests" value={5} icon={Bell} accent />
            <StatCard label="Upcoming Bookings" value={12} icon={CalendarDays} trend="3 this week" />
            <StatCard label="Revenue (MTD)" value="$8,420" icon={DollarSign} trend="+18% vs last month" />
            <StatCard label="Commission Owed" value="$842" icon={Percent} />
          </div>

          {/* Profile completeness */}
          <div className="bg-card rounded-2xl p-5 card-shadow">
            <div className="flex items-center justify-between mb-3">
              <p className="font-label text-muted-foreground">Profile Completeness</p>
              <span className="text-sm font-medium tnum">85%</span>
            </div>
            <Progress value={85} className="h-2 mb-3" />
            <p className="text-xs text-muted-foreground">Add portfolio images and FAQ to reach 100%</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Inbox shortcut */}
            <Link to="/vendor/inbox" className="bg-card rounded-2xl p-5 card-shadow hover:border-accent/40 border border-transparent transition-colors block">
              <div className="flex items-center justify-between mb-4">
                <p className="font-label text-muted-foreground">Inquiry Inbox</p>
                <span className="text-xs text-accent font-medium">Open inbox →</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                  <Inbox className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="font-display text-2xl">Real-time inquiries</p>
                  <p className="text-sm text-muted-foreground">Review new host inquiries and approve AI-drafted replies.</p>
                </div>
              </div>
            </Link>

            {/* Contract status */}
            <div className="bg-card rounded-2xl p-5 card-shadow">
              <p className="font-label text-muted-foreground mb-4">Contract & Commission</p>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <div>
                    <p className="text-sm font-medium">Contract Term</p>
                    <p className="text-xs text-muted-foreground">12 months</p>
                  </div>
                  <Badge className="bg-accent text-accent-foreground">Active</Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <div>
                    <p className="text-sm font-medium">Start Date</p>
                    <p className="text-xs text-muted-foreground tnum">Jan 15, 2026</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">End Date</p>
                    <p className="text-xs text-muted-foreground tnum">Jan 14, 2027</p>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <div>
                    <p className="text-sm font-medium">Platform Fee</p>
                    <p className="text-xs text-muted-foreground">Standard rate</p>
                  </div>
                  <span className="text-lg font-display tnum">10%</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <div>
                    <p className="text-sm font-medium">Total Earnings</p>
                    <p className="text-xs text-muted-foreground">Since contract start</p>
                  </div>
                  <span className="text-lg font-display tnum">$42,800</span>
                </div>
              </div>
            </div>
          </div>

          {/* Upcoming bookings */}
          <div className="bg-card rounded-2xl p-5 card-shadow">
            <p className="font-label text-muted-foreground mb-4">Upcoming Bookings</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 font-label text-muted-foreground">Client</th>
                    <th className="text-left py-2 font-label text-muted-foreground">Event</th>
                    <th className="text-left py-2 font-label text-muted-foreground">Package</th>
                    <th className="text-left py-2 font-label text-muted-foreground">Date</th>
                    <th className="text-right py-2 font-label text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { client: "Sarah Mitchell", event: "Wedding", pkg: "Premium", date: "Aug 15", amount: "$3,250" },
                    { client: "David Park", event: "Corporate Gala", pkg: "Full Day", date: "Aug 20", amount: "$2,800" },
                    { client: "Amanda Lee", event: "Engagement", pkg: "Standard", date: "Sep 5", amount: "$1,500" },
                  ].map((b, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-3 font-medium">{b.client}</td>
                      <td className="py-3 text-muted-foreground">{b.event}</td>
                      <td className="py-3"><Badge variant="secondary">{b.pkg}</Badge></td>
                      <td className="py-3 tnum text-muted-foreground">{b.date}</td>
                      <td className="py-3 text-right tnum font-medium">{b.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
