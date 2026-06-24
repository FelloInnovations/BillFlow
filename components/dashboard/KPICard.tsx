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
    icon: "bg-[var(--bg-brand-primary)] text-[var(--fg-brand-primary)]",
    border: "border-l-[var(--border-brand-solid)]",
  },
  amber: {
    icon: "bg-[var(--bg-warning-primary)] text-[var(--fg-warning-primary)]",
    border: "border-l-[var(--border-warning-solid)]",
  },
  rose: {
    icon: "bg-[var(--bg-error-primary)] text-[var(--fg-error-primary)]",
    border: "border-l-[var(--border-error-solid)]",
  },
  emerald: {
    icon: "bg-[var(--bg-success-primary)] text-[var(--fg-success-primary)]",
    border: "border-l-[var(--border-success-solid)]",
  },
};

export function KPICard({ title, value, sub, icon: Icon, isCurrency, accent }: KPICardProps) {
  const display = isCurrency
    ? formatCurrency(typeof value === "number" ? value : parseFloat(String(value)))
    : value;
  const a = ACCENT[accent];

  return (
    <div className={cn(
      "rounded-lg bg-[var(--bg-primary)] border border-[var(--border-tertiary)] border-l-4 p-5 shadow-sm hover:shadow-md transition-shadow",
      a.border
    )}>
      <div className="flex items-start justify-between mb-4">
        <p className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide">{title}</p>
        <div className={cn("p-2 rounded-xl", a.icon)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">{display}</p>
      {sub && <p className="text-xs mt-1.5 text-[var(--text-quaternary)]">{sub}</p>}
    </div>
  );
}
