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
    icon: "bg-salmon-50 text-[#FF725C]",
    border: "border-l-[#FF725C]",
  },
  amber: {
    icon: "bg-amber-50 text-amber-500",
    border: "border-l-amber-400",
  },
  rose: {
    icon: "bg-red-50 text-red-500",
    border: "border-l-red-400",
  },
  emerald: {
    icon: "bg-emerald-50 text-emerald-500",
    border: "border-l-emerald-400",
  },
};

export function KPICard({ title, value, sub, icon: Icon, isCurrency, accent }: KPICardProps) {
  const display = isCurrency
    ? formatCurrency(typeof value === "number" ? value : parseFloat(String(value)))
    : value;
  const a = ACCENT[accent];

  return (
    <div className={cn(
      "rounded-xl bg-white border border-gray-200 border-l-4 p-5 shadow-sm hover:shadow-md transition-shadow",
      a.border
    )}>
      <div className="flex items-start justify-between mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
        <div className={cn("p-2 rounded-xl", a.icon)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-3xl font-bold tracking-tight text-gray-900">{display}</p>
      {sub && <p className="text-xs mt-1.5 text-gray-400">{sub}</p>}
    </div>
  );
}
