import { cn, formatCurrency } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  isCurrency?: boolean;
  accent: "salmon" | "amber" | "rose" | "emerald";
}

const ACCENT = {
  salmon: {
    icon: "bg-salmon-50 dark:bg-navy-950/60 text-salmon-400",
    border: "border-t-salmon-400",
  },
  amber: {
    icon: "bg-violet-50 dark:bg-violet-950/60 text-violet-400",
    border: "border-t-violet-400",
  },
  rose: {
    icon: "bg-purple-50 dark:bg-purple-950/60 text-purple-400",
    border: "border-t-purple-400",
  },
  emerald: {
    icon: "bg-blue-50 dark:bg-blue-950/60 text-blue-400",
    border: "border-t-blue-400",
  },
};

export function KPICard({ title, value, sub, icon: Icon, isCurrency, accent }: KPICardProps) {
  const display = isCurrency
    ? formatCurrency(typeof value === "number" ? value : parseFloat(String(value)))
    : value;
  const a = ACCENT[accent];

  return (
    <div className={cn(
      "rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 border-t-4 p-5 shadow-sm hover:shadow-md transition-shadow",
      a.border
    )}>
      <div className="flex items-start justify-between mb-4">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{title}</p>
        <div className={cn("p-2 rounded-xl", a.icon)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{display}</p>
      {sub && <p className="text-xs mt-1.5 text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  );
}
