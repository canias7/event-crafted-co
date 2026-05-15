import { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  accent?: boolean;
}

export function StatCard({ label, value, icon: Icon, trend, accent }: StatCardProps) {
  return (
    <div className="card-soft p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="font-label text-muted-foreground">{label}</p>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${accent ? "bg-accent/10" : "bg-secondary"}`}>
          <Icon className={`w-4 h-4 ${accent ? "text-accent" : "text-muted-foreground"}`} />
        </div>
      </div>
      <p className="text-2xl font-display tnum">{value}</p>
      {trend && <p className="text-xs text-muted-foreground mt-1">{trend}</p>}
    </div>
  );
}
