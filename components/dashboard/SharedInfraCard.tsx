"use client";

import { Server } from "lucide-react";
import { SharedInfrastructure } from "@/types";
import { formatCurrency } from "@/lib/utils";

interface Props {
  data: SharedInfrastructure;
}

export function SharedInfraCard({ data }: Props) {
  if (data.services.length === 0) return null;

  return (
    <div className="rounded-lg bg-[var(--bg-primary)] border border-[var(--border-tertiary)] shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-tertiary)]">
        <div className="flex items-center gap-2.5">
          <Server className="w-4 h-4 text-[var(--fg-brand-primary)]" />
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Shared Infrastructure</h3>
            <p className="text-[11px] text-[var(--text-quaternary)] mt-0.5">Org-wide · not attributed to projects</p>
          </div>
        </div>
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          {formatCurrency(data.total)}
        </span>
      </div>
      <div className="divide-y divide-[var(--border-tertiary)]">
        {data.services.map((svc) => (
          <div key={svc.name} className="flex items-center justify-between px-6 py-3">
            <span className="text-sm text-[var(--text-tertiary)]">{svc.name}</span>
            <span className="text-sm font-semibold text-[var(--text-secondary)]">{formatCurrency(svc.total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
