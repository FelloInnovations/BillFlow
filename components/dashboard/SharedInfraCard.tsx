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
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <Server className="w-4 h-4 text-violet-400" />
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Shared Infrastructure</h3>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Org-wide · not attributed to projects</p>
          </div>
        </div>
        <span className="text-sm font-bold text-slate-900 dark:text-white">
          {formatCurrency(data.total)}
        </span>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {data.services.map((svc) => (
          <div key={svc.name} className="flex items-center justify-between px-6 py-3">
            <span className="text-sm text-slate-600 dark:text-slate-300">{svc.name}</span>
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(svc.total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
