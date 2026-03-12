import {
  LayoutDashboard, Store, CalendarDays, FileText, Mail, CheckSquare,
  ListTodo, CreditCard, Heart, DollarSign, Download, Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { StatCard } from "@/components/shared/StatCard";

const navItems = [
  { label: "Dashboard", path: "/customer/dashboard", icon: LayoutDashboard },
  { label: "Vendors", path: "/vendors", icon: Store },
  { label: "Appointments", path: "/customer/appointments", icon: CalendarDays },
  { label: "Event Details", path: "/customer/event", icon: FileText },
  { label: "Invitations", path: "/customer/invitations", icon: Mail },
  { label: "Checklist", path: "/customer/checklist", icon: CheckSquare },
  { label: "Tasks", path: "/customer/tasks", icon: ListTodo },
  { label: "Payments", path: "/customer/payments", icon: CreditCard },
  { label: "Favorites", path: "/customer/favorites", icon: Heart },
];

const payments = [
  { id: "1", vendor: "Luminara Photography", service: "Wedding Package", amount: 3250, status: "paid", type: "Full", due: "Jun 1, 2026", paid: "May 28, 2026" },
  { id: "2", vendor: "The Grand Atelier", service: "Venue Deposit", amount: 4500, status: "paid", type: "Deposit", due: "May 15, 2026", paid: "May 12, 2026" },
  { id: "3", vendor: "Bloom & Petal Studio", service: "Floral Arrangement", amount: 1800, status: "pending", type: "Full", due: "Jul 10, 2026", paid: null },
  { id: "4", vendor: "Savor & Co. Catering", service: "Catering Deposit", amount: 2900, status: "overdue", type: "Deposit", due: "Jun 22, 2026", paid: null },
  { id: "5", vendor: "DJ Marco Stellare", service: "DJ Services — Installment 1", amount: 600, status: "paid", type: "Installment", due: "Jun 5, 2026", paid: "Jun 3, 2026" },
  { id: "6", vendor: "DJ Marco Stellare", service: "DJ Services — Installment 2", amount: 600, status: "pending", type: "Installment", due: "Jul 5, 2026", paid: null },
];

const totalSpent = payments.filter(p => p.status === "paid").reduce((sum, p) => sum + p.amount, 0);
const totalDue = payments.filter(p => p.status !== "paid").reduce((sum, p) => sum + p.amount, 0);

export default function PaymentsPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <h1 className="font-display text-xl">Payments</h1>
          <p className="text-sm text-muted-foreground">Manage your event payments</p>
        </div>

        <div className="p-4 md:p-8 space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Spent" value={`$${totalSpent.toLocaleString()}`} icon={DollarSign} />
            <StatCard label="Amount Due" value={`$${totalDue.toLocaleString()}`} icon={CreditCard} accent />
            <StatCard label="Payments Made" value={payments.filter(p => p.status === "paid").length} icon={Receipt} />
            <StatCard label="Pending" value={payments.filter(p => p.status !== "paid").length} icon={CreditCard} />
          </div>

          <div className="bg-card rounded-2xl card-shadow overflow-hidden">
            <div className="p-5 border-b border-border">
              <p className="font-label text-muted-foreground">All Payments</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="text-left py-3 px-5 font-label text-muted-foreground">Vendor</th>
                    <th className="text-left py-3 px-5 font-label text-muted-foreground">Service</th>
                    <th className="text-left py-3 px-5 font-label text-muted-foreground">Type</th>
                    <th className="text-left py-3 px-5 font-label text-muted-foreground">Amount</th>
                    <th className="text-left py-3 px-5 font-label text-muted-foreground">Due Date</th>
                    <th className="text-left py-3 px-5 font-label text-muted-foreground">Status</th>
                    <th className="text-right py-3 px-5 font-label text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                      <td className="py-3 px-5 font-medium">{p.vendor}</td>
                      <td className="py-3 px-5 text-muted-foreground">{p.service}</td>
                      <td className="py-3 px-5"><Badge variant="secondary" className="text-[10px]">{p.type}</Badge></td>
                      <td className="py-3 px-5 tnum font-medium">${p.amount.toLocaleString()}</td>
                      <td className="py-3 px-5 tnum text-muted-foreground">{p.due}</td>
                      <td className="py-3 px-5">
                        <Badge variant={p.status === "paid" ? "secondary" : p.status === "overdue" ? "destructive" : "outline"}>
                          {p.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-5 text-right">
                        {p.status === "paid" ? (
                          <Button variant="ghost" size="sm" className="h-7 text-xs"><Download className="w-3 h-3 mr-1" /> Receipt</Button>
                        ) : (
                          <Button size="sm" className="h-7 text-xs bg-accent text-accent-foreground hover:bg-accent/90">Pay Now</Button>
                        )}
                      </td>
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
