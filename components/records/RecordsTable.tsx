"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { FinancialRecord, PaginatedResult, CostType } from "@/types";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { InvoiceDrawer } from "./InvoiceDrawer";
import { AllocationDialog } from "./AllocationDialog";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ChevronDown,
  X,
  CheckCircle2,
  Plus,
} from "lucide-react";
import { AddInvoiceModal } from "./AddInvoiceModal";

interface Props {
  initial: PaginatedResult<FinancialRecord>;
  vendors: string[];
}

const STATUS_OPTIONS = ["", "unpaid", "pending", "paid", "overdue"];

const COST_TYPE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "",                    label: "All Allocations" },
  { value: "unallocated",         label: "Unallocated" },
  { value: "project_specific",    label: "Project Specific" },
  { value: "shared_infrastructure", label: "Shared Infrastructure" },
  { value: "shared_tooling",      label: "Shared Tooling" },
];

// ── Checkbox ──────────────────────────────────────────────────────────────────
function Checkbox({
  checked,
  indeterminate,
  disabled,
  onChange,
  onClick,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: () => void;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      onClick={onClick}
      className={cn(
        "w-4 h-4 rounded border bg-slate-800 focus:ring-2 focus:ring-cyan-500 focus:ring-offset-0 focus:ring-offset-transparent cursor-pointer accent-cyan-400",
        disabled
          ? "opacity-25 cursor-not-allowed"
          : "border-slate-500 hover:border-slate-400"
      )}
    />
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div
      className={cn(
        "fixed top-5 right-5 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl border shadow-xl text-sm font-medium",
        type === "success"
          ? "bg-emerald-950 border-emerald-700 text-emerald-300"
          : "bg-red-950 border-red-700 text-red-300"
      )}
    >
      {type === "success" ? (
        <CheckCircle2 className="w-4 h-4 shrink-0" />
      ) : (
        <X className="w-4 h-4 shrink-0" />
      )}
      {msg}
    </div>
  );
}

// ── AllocationBadge ───────────────────────────────────────────────────────────
function AllocationBadge({
  record,
  onAllocate,
}: {
  record: FinancialRecord;
  onAllocate: (e: React.MouseEvent) => void;
}) {
  const { cost_type, project_id } = record;

  if (cost_type === "project_specific" && project_id) {
    return (
      <button
        onClick={onAllocate}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800 hover:ring-indigo-400 transition-shadow max-w-[140px] truncate"
        title={project_id}
      >
        {project_id}
      </button>
    );
  }

  if (cost_type === "shared_infrastructure") {
    return (
      <button
        onClick={onAllocate}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-slate-700 hover:ring-slate-400 transition-shadow"
      >
        Shared Infra
      </button>
    );
  }

  if (cost_type === "shared_tooling") {
    return (
      <button
        onClick={onAllocate}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-slate-700 hover:ring-slate-400 transition-shadow"
      >
        Shared Tooling
      </button>
    );
  }

  // unallocated or null
  return (
    <button
      onClick={onAllocate}
      className="text-xs text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
    >
      Allocate →
    </button>
  );
}

// ── BulkAllocationDialog ──────────────────────────────────────────────────────
const BULK_COST_TYPE_OPTIONS: { value: CostType; label: string; description: string }[] = [
  { value: "project_specific",      label: "Project Specific",      description: "Directly attributed to a single project" },
  { value: "shared_infrastructure", label: "Shared Infrastructure", description: "Platform costs (Railway, Supabase, Vercel, etc.)" },
  { value: "shared_tooling",        label: "Shared Tooling",        description: "Team tools (HubSpot, Slack, GitHub, etc.)" },
  { value: "unallocated",           label: "Unallocated",           description: "Exclude from project attribution" },
];

function BulkAllocationDialog({
  count,
  onClose,
  onConfirm,
}: {
  count: number;
  onClose: () => void;
  onConfirm: (costType: CostType, projectId: string | null) => void;
}) {
  const [costType, setCostType] = useState<CostType>("unallocated");
  const [projectId, setProjectId] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [projects, setProjects] = useState<string[]>([]);
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

  function handleConfirm() {
    if (costType === "project_specific" && !projectId) {
      setError("Please select a project.");
      return;
    }
    onConfirm(costType, costType === "project_specific" ? projectId : null);
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-[420px] flex flex-col rounded-2xl bg-[#0e1219] border border-slate-700 shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Bulk Allocate</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Applying to {count} invoice{count !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-2 max-h-[60vh] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {BULK_COST_TYPE_OPTIONS.map((opt) => (
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
                  name="bulkCostType"
                  value={opt.value}
                  checked={costType === opt.value}
                  onChange={() => { setCostType(opt.value); setError(null); }}
                  className="mt-0.5 accent-indigo-400"
                />
                <div>
                  <p className="text-sm font-medium text-slate-200">{opt.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>
                </div>
              </label>
            ))}

            {costType === "project_specific" && (
              <div className="mt-1">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Project *</p>
                <div className="relative">
                  <input
                    type="text"
                    value={projectSearch}
                    onChange={(e) => { setProjectSearch(e.target.value); setProjectId(""); setError(null); }}
                    placeholder="Search projects…"
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm px-3 py-2 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
                  />
                  {projectSearch && !projectId && filteredProjects.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-10 rounded-lg border border-slate-700 bg-slate-900 overflow-hidden max-h-36 overflow-y-auto">
                      {filteredProjects.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => { setProjectId(p); setProjectSearch(p); }}
                          className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {projectId && <p className="mt-1 text-xs text-indigo-400">Selected: {projectId}</p>}
              </div>
            )}
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>

          <div className="px-5 py-4 border-t border-slate-800 flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-slate-700 text-slate-400 text-sm font-medium hover:bg-slate-800 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors"
            >
              Allocate {count}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function RecordsTable({ initial, vendors: initialVendors }: Props) {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status") ?? "";

  const [data, setData] = useState(initial);
  const [vendors, setVendors] = useState<string[]>(initialVendors);
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [vendorOpen, setVendorOpen] = useState(false);
  const vendorRef = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState({
    status: initialStatus,
    costType: "",
    dateFrom: "",
    dateTo: "",
    page: 1,
  });
  const [selected, setSelected] = useState<FinancialRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // ── Add invoice modal ──
  const [showAddModal, setShowAddModal] = useState(false);

  // ── Selection state ──
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // ── Allocation dialog ──
  const [allocationTarget, setAllocationTarget] = useState<FinancialRecord | null>(null);
  const [showBulkAllocate, setShowBulkAllocate] = useState(false);
  const [bulkAllocating, setBulkAllocating] = useState(false);

  // Clear selection on data change
  useEffect(() => {
    setCheckedIds(new Set());
    setConfirming(false);
  }, [data.page, filters]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Apply URL-provided status filter on mount
  useEffect(() => {
    if (initialStatus) {
      fetchData({ status: initialStatus, costType: "", dateFrom: "", dateTo: "", page: 1 }, []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close vendor dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (vendorRef.current && !vendorRef.current.contains(e.target as Node)) {
        setVendorOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // ── Data fetching ──
  const fetchVendors = useCallback(async () => {
    const res = await fetch("/api/invoices/vendors");
    if (res.ok) {
      const json = await res.json();
      setVendors(json.vendors ?? []);
    }
  }, []);

  const fetchData = useCallback(async (f: typeof filters, sv: string[]) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (sv.length > 0) params.set("vendor", sv.join(","));
    if (f.status) params.set("status", f.status);
    if (f.costType) params.set("costType", f.costType);
    if (f.dateFrom) params.set("dateFrom", f.dateFrom);
    if (f.dateTo) params.set("dateTo", f.dateTo);
    params.set("page", String(f.page));
    params.set("pageSize", "20");
    const res = await fetch(`/api/invoices?${params}`);
    const json = await res.json();
    setData(json);
    setLastRefreshed(new Date());
    setLoading(false);
  }, []);

  function applyFilter(key: string, value: string) {
    const next = { ...filters, [key]: value, page: 1 };
    setFilters(next);
    fetchData(next, selectedVendors);
  }

  function toggleVendor(v: string) {
    const next = selectedVendors.includes(v)
      ? selectedVendors.filter((x) => x !== v)
      : [...selectedVendors, v];
    setSelectedVendors(next);
    const nextFilters = { ...filters, page: 1 };
    setFilters(nextFilters);
    fetchData(nextFilters, next);
  }

  function clearVendors() {
    setSelectedVendors([]);
    const nextFilters = { ...filters, page: 1 };
    setFilters(nextFilters);
    fetchData(nextFilters, []);
  }

  function goPage(p: number) {
    const next = { ...filters, page: p };
    setFilters(next);
    fetchData(next, selectedVendors);
  }

  function handleRefresh() {
    fetchVendors();
    fetchData(filters, selectedVendors);
  }

  function handleInvoiceSaved() {
    setShowAddModal(false);
    const next = { ...filters, page: 1 };
    setFilters(next);
    fetchVendors();
    fetchData(next, selectedVendors);
    setToast({ msg: "Invoice added successfully", type: "success" });
  }

  // ── Local state update on paid ──
  function handleMarkedPaid(id: string) {
    setData((prev) => ({
      ...prev,
      data: prev.data.map((r) =>
        r.id === id ? { ...r, payment_status: "paid" } : r
      ),
    }));
    setSelected((prev) =>
      prev?.id === id ? { ...prev, payment_status: "paid" } : prev
    );
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  // ── Local state update on allocation ──
  function handleAllocationSaved(updated: FinancialRecord) {
    setData((prev) => ({
      ...prev,
      data: prev.data.map((r) => (r.id === updated.id ? updated : r)),
    }));
    setAllocationTarget(null);
    setToast({ msg: "Invoice allocated", type: "success" });
  }

  // ── Selection helpers ──
  const unpaidIds = data.data
    .filter((r) => r.payment_status !== "paid")
    .map((r) => r.id);
  const allChecked =
    unpaidIds.length > 0 && unpaidIds.every((id) => checkedIds.has(id));
  const someChecked =
    unpaidIds.some((id) => checkedIds.has(id)) && !allChecked;

  function toggleSelectAll() {
    if (allChecked) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(unpaidIds));
    }
  }

  function toggleRow(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Single mark-as-paid ──
  async function markSinglePaid(id: string) {
    const res = await fetch(`/api/invoices/${id}/paid`, { method: "PATCH" });
    if (res.ok) {
      handleMarkedPaid(id);
      setToast({ msg: "Invoice marked as paid", type: "success" });
    } else {
      setToast({ msg: "Failed to mark as paid — please try again", type: "error" });
    }
  }

  // ── Bulk mark-as-paid ──
  async function markBulkPaid() {
    const ids = [...checkedIds];
    setMarkingPaid(true);
    try {
      const res = await fetch("/api/invoices/bulk-paid", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        ids.forEach((id) => handleMarkedPaid(id));
        setCheckedIds(new Set());
        setConfirming(false);
        setToast({
          msg: `${ids.length} invoice${ids.length > 1 ? "s" : ""} marked as paid`,
          type: "success",
        });
      } else {
        setToast({ msg: "Failed to update invoices — please try again", type: "error" });
        setConfirming(false);
      }
    } finally {
      setMarkingPaid(false);
    }
  }

  // ── Bulk allocate ──
  async function handleBulkAllocate(costType: CostType, projectId: string | null) {
    const ids = [...checkedIds];
    setBulkAllocating(true);
    try {
      const res = await fetch("/api/invoices/bulk-allocate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, cost_type: costType, project_id: projectId }),
      });
      if (res.ok) {
        const { records } = await res.json();
        setData((prev) => ({
          ...prev,
          data: prev.data.map((r) => {
            const updated = (records as FinancialRecord[])?.find((u) => u.id === r.id);
            return updated ? { ...r, ...updated } : r;
          }),
        }));
        setCheckedIds(new Set());
        setShowBulkAllocate(false);
        setToast({
          msg: `${ids.length} invoice${ids.length > 1 ? "s" : ""} allocated`,
          type: "success",
        });
      } else {
        setToast({ msg: "Failed to allocate — please try again", type: "error" });
        setShowBulkAllocate(false);
      }
    } finally {
      setBulkAllocating(false);
    }
  }

  const vendorLabel =
    selectedVendors.length === 0
      ? "All Vendors"
      : selectedVendors.length === 1
      ? selectedVendors[0]
      : `${selectedVendors.length} vendors`;

  const selCount = checkedIds.size;

  return (
    <div className="space-y-4">
      {/* ── Filters ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">

          {/* Vendor multiselect */}
          <div className="relative" ref={vendorRef}>
            <button
              onClick={() => setVendorOpen((o) => !o)}
              className={cn(
                "flex items-center gap-2 text-sm border rounded-md px-3 py-1.5 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors",
                selectedVendors.length > 0
                  ? "border-indigo-400 dark:border-indigo-500 text-indigo-700 dark:text-indigo-300"
                  : "border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              )}
            >
              <span>{vendorLabel}</span>
              {selectedVendors.length > 0 ? (
                <X
                  className="w-3.5 h-3.5 opacity-60"
                  onClick={(e) => { e.stopPropagation(); clearVendors(); }}
                />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 opacity-50" />
              )}
            </button>
            {vendorOpen && (
              <div className="absolute top-full left-0 mt-1 z-50 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
                <div className="max-h-60 overflow-y-auto py-1">
                  {vendors.map((v) => (
                    <button
                      key={v}
                      onClick={() => toggleVendor(v)}
                      className={cn(
                        "w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm transition-colors",
                        selectedVendors.includes(v)
                          ? "bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      )}
                    >
                      <span
                        className={cn(
                          "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                          selectedVendors.includes(v)
                            ? "bg-indigo-600 border-indigo-600 text-white"
                            : "border-slate-300 dark:border-slate-600"
                        )}
                      >
                        {selectedVendors.includes(v) && (
                          <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none">
                            <path
                              d="M2 5l2.5 2.5L8 3"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </span>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <select
            value={filters.status}
            onChange={(e) => applyFilter("status", e.target.value)}
            className="text-sm border border-slate-200 dark:border-slate-700 rounded-md px-3 py-1.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s || "All Statuses"}</option>
            ))}
          </select>

          <select
            value={filters.costType}
            onChange={(e) => applyFilter("costType", e.target.value)}
            className={cn(
              "text-sm border rounded-md px-3 py-1.5 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors",
              filters.costType
                ? "border-indigo-400 dark:border-indigo-500 text-indigo-700 dark:text-indigo-300"
                : "border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
            )}
          >
            {COST_TYPE_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => applyFilter("dateFrom", e.target.value)}
            className="text-sm border border-slate-200 dark:border-slate-700 rounded-md px-3 py-1.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => applyFilter("dateTo", e.target.value)}
            className="text-sm border border-slate-200 dark:border-slate-700 rounded-md px-3 py-1.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
            Updated{" "}
            {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Refresh
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-500/50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Invoice
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div
        className={cn(
          "rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden",
          loading && "opacity-60"
        )}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50">
              <th className="pl-4 pr-2 py-3.5 w-10">
                <Checkbox
                  checked={allChecked}
                  indeterminate={someChecked}
                  disabled={unpaidIds.length === 0}
                  onChange={toggleSelectAll}
                />
              </th>
              {["Vendor", "Invoice #", "Date", "Due Date", "Amount", "Status", "Allocation"].map((h) => (
                <th
                  key={h}
                  className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.data.map((row) => {
              const isPaid = row.payment_status === "paid";
              const isChecked = checkedIds.has(row.id);

              return (
                <tr
                  key={row.id}
                  className={cn(
                    "group cursor-pointer transition-colors",
                    isChecked
                      ? "bg-indigo-50/40 dark:bg-indigo-950/20 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/30"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  )}
                  onClick={() => {
                    if (!isPaid) toggleRow(row.id);
                    setSelected(row);
                  }}
                >
                  <td
                    className="pl-4 pr-2 py-3.5 w-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isPaid) toggleRow(row.id);
                    }}
                  >
                    <Checkbox
                      checked={isChecked}
                      disabled={isPaid}
                      onChange={() => { /* handled by td onClick */ }}
                    />
                  </td>

                  <td className="px-5 py-3.5 font-semibold text-slate-800 dark:text-slate-200">
                    {row.vendor_name ?? "—"}
                  </td>
                  <td className="px-5 py-3.5 text-slate-400 dark:text-slate-500 font-mono text-xs">
                    {row.invoice_number ?? "—"}
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400">
                    {formatDate(row.invoice_date)}
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400">
                    {formatDate(row.due_date)}
                  </td>
                  <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-white">
                    {formatCurrency(row.total_amount, row.currency)}
                  </td>

                  {/* Status cell with hover Mark-as-Paid button */}
                  <td className="px-4 py-3 relative">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold",
                        isPaid
                          ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200 dark:ring-emerald-800"
                          : row.payment_status === "overdue"
                          ? "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 ring-1 ring-red-200 dark:ring-red-800"
                          : "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 ring-1 ring-amber-200 dark:ring-amber-800"
                      )}
                    >
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          isPaid
                            ? "bg-emerald-500"
                            : row.payment_status === "overdue"
                            ? "bg-red-500"
                            : "bg-amber-500"
                        )}
                      />
                      {row.payment_status}
                    </span>
                    {!isPaid && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markSinglePaid(row.id);
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-opacity whitespace-nowrap"
                      >
                        Mark paid
                      </button>
                    )}
                  </td>

                  {/* Allocation cell */}
                  <td
                    className="px-5 py-3.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <AllocationBadge
                      record={row}
                      onAllocate={(e) => {
                        e.stopPropagation();
                        setAllocationTarget(row);
                      }}
                    />
                  </td>
                </tr>
              );
            })}

            {data.data.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-slate-400 dark:text-slate-500"
                >
                  No records found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <span>
          {data.total} records · Page {data.page} of {data.totalPages}
        </span>
        <div className="flex gap-1">
          <button
            disabled={data.page <= 1}
            onClick={() => goPage(data.page - 1)}
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            disabled={data.page >= data.totalPages}
            onClick={() => goPage(data.page + 1)}
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Floating bulk action toolbar ── */}
      <div
        className={cn(
          "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-200",
          selCount > 0
            ? "translate-y-0 opacity-100 pointer-events-auto"
            : "translate-y-4 opacity-0 pointer-events-none"
        )}
      >
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl border border-slate-700 bg-[#111827] shadow-2xl text-sm whitespace-nowrap">
          {confirming ? (
            <>
              <span className="text-slate-300">
                Mark {selCount} invoice{selCount > 1 ? "s" : ""} as paid?{" "}
                <span className="text-slate-500">This cannot be undone.</span>
              </span>
              <button
                onClick={markBulkPaid}
                disabled={markingPaid}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition-colors"
              >
                {markingPaid ? "Marking…" : "Confirm"}
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <span className="text-slate-300 font-medium">
                {selCount} invoice{selCount > 1 ? "s" : ""} selected
              </span>
              <button
                onClick={() => setConfirming(true)}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors"
              >
                Mark as Paid
              </button>
              <button
                onClick={() => setShowBulkAllocate(true)}
                disabled={bulkAllocating}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition-colors"
              >
                {bulkAllocating ? "Allocating…" : "Allocate"}
              </button>
              <button
                onClick={() => setCheckedIds(new Set())}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                Clear selection
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Toast ── */}
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* ── Invoice drawer ── */}
      <InvoiceDrawer
        invoice={selected}
        onClose={() => setSelected(null)}
        onMarkedPaid={handleMarkedPaid}
      />

      {/* ── Add Invoice modal ── */}
      {showAddModal && (
        <AddInvoiceModal
          onClose={() => setShowAddModal(false)}
          onSaved={handleInvoiceSaved}
        />
      )}

      {/* ── Allocation dialog (single) ── */}
      {allocationTarget && (
        <AllocationDialog
          invoice={allocationTarget}
          onClose={() => setAllocationTarget(null)}
          onAllocated={handleAllocationSaved}
        />
      )}

      {/* ── Bulk allocation dialog ── */}
      {showBulkAllocate && (
        <BulkAllocationDialog
          count={selCount}
          onClose={() => setShowBulkAllocate(false)}
          onConfirm={handleBulkAllocate}
        />
      )}
    </div>
  );
}
