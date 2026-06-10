"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { FinancialRecord, CostType } from "@/types";
import { formatCurrency, cn } from "@/lib/utils";

interface Props {
  invoice: FinancialRecord;
  onClose: () => void;
  onAllocated: (updated: FinancialRecord) => void;
}

const COST_TYPE_OPTIONS: { value: CostType; label: string; description: string }[] = [
  { value: "project_specific",      label: "Project Specific",      description: "Directly attributed to a single project" },
  { value: "shared_infrastructure", label: "Shared Infrastructure", description: "Platform costs (Railway, Supabase, Vercel, etc.)" },
  { value: "shared_tooling",        label: "Shared Tooling",        description: "Team tools (HubSpot, Slack, GitHub, etc.)" },
  { value: "unallocated",           label: "Unallocated",           description: "Cannot be attributed — excluded from project totals" },
];

export function AllocationDialog({ invoice, onClose, onAllocated }: Props) {
  const [costType, setCostType] = useState<CostType>((invoice.cost_type as CostType) ?? "unallocated");
  const [projectId, setProjectId] = useState<string>(invoice.project_id ?? "");
  const [projectSearch, setProjectSearch] = useState<string>(invoice.project_id ?? "");
  const [projects, setProjects] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/projects/names")
      .then((r) => r.json())
      .then((j) => setProjects(j.names ?? []))
      .catch(() => {});
  }, []);

  const filteredProjects = projects.filter((p) =>
    p.toLowerCase().includes(projectSearch.toLowerCase())
  );
  const showDropdown = costType === "project_specific" && projectSearch.length > 0 && !projectId;

  async function handleSave() {
    if (costType === "project_specific" && !projectId) {
      setError("Please select a project.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/allocate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cost_type: costType,
          project_id: costType === "project_specific" ? projectId : null,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        onAllocated(updated);
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to save. Try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-[440px] flex flex-col rounded-2xl bg-[#0e1219] border border-slate-700 shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Allocate Invoice</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {invoice.vendor_name} · {formatCurrency(invoice.total_amount, invoice.currency)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form */}
          <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Cost Type</p>
            <div className="space-y-2">
              {COST_TYPE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                    costType === opt.value
                      ? "border-indigo-500 bg-indigo-950/40"
                      : "border-slate-700 hover:border-slate-600"
                  )}
                >
                  <input
                    type="radio"
                    name="costType"
                    value={opt.value}
                    checked={costType === opt.value}
                    onChange={() => {
                      setCostType(opt.value);
                      setError(null);
                    }}
                    className="mt-0.5 accent-indigo-400"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-200">{opt.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>
                  </div>
                </label>
              ))}
            </div>

            {/* Project search (only when project_specific) */}
            {costType === "project_specific" && (
              <div className="mt-1">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Project *</p>
                <div className="relative">
                  <input
                    type="text"
                    value={projectSearch}
                    onChange={(e) => {
                      setProjectSearch(e.target.value);
                      setProjectId("");
                      setError(null);
                    }}
                    placeholder="Search projects…"
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm px-3 py-2 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
                  />
                  {showDropdown && filteredProjects.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-10 rounded-lg border border-slate-700 bg-slate-900 overflow-hidden max-h-40 overflow-y-auto">
                      {filteredProjects.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => {
                            setProjectId(p);
                            setProjectSearch(p);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {projectId && (
                  <p className="mt-1 text-xs text-indigo-400">Selected: {projectId}</p>
                )}
              </div>
            )}

            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-slate-800 flex items-center gap-3 shrink-0">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-slate-700 text-slate-400 text-sm font-medium hover:bg-slate-800 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-bold transition-colors"
            >
              {saving ? "Saving…" : "Save Allocation"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
