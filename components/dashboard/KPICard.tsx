import { cn, formatCurrency } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  isCurrency?: boolean;
  accent: "indigo" | "amber" | "rose" | "emerald";
}

const ACCENT = {
  indigo: {
    icon: "bg-indigo-50 dark:bg-indigo-950 text-indigo-500",
    border: "border-t-indigo-500",
  },
  amber: {
    icon: "bg-amber-50 dark:bg-amber-950 text-amber-500",
    border: "border-t-amber-500",
  },
  rose: {
    icon: "bg-rose-50 dark:bg-rose-950 text-rose-500",
    border: "border-t-rose-500",
  },
  emerald: {
    icon: "bg-emerald-50 dark:bg-emerald-950 text-emerald-500",
    border: "border-t-emerald-500",
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
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{title}</p>
        <div className={cn("p-2 rounded-xl", a.icon)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{display}</p>
      {sub && <p className="text-xs mt-1.5 text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  );
}
