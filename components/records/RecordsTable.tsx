"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { FinancialRecord, PaginatedResult } from "@/types";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { InvoiceDrawer } from "./InvoiceDrawer";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ChevronDown,
  X,
  CheckCircle2,
} from "lucide-react";

interface Props {
  initial: PaginatedResult<FinancialRecord>;
  vendors: string[];
}

const STATUS_OPTIONS = ["", "pending", "paid", "overdue"];

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
function Toast({
  msg,
  type,
}: {
  msg: string;
  type: "success" | "error";
}) {
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

// ── Main component ────────────────────────────────────────────────────────────
export function RecordsTable({ initial, vendors: initialVendors }: Props) {
  const [data, setData] = useState(initial);
  const [vendors, setVendors] = useState<string[]>(initialVendors);
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [vendorOpen, setVendorOpen] = useState(false);
  const vendorRef = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState({
    status: "",
    dateFrom: "",
    dateTo: "",
    page: 1,
  });
  const [selected, setSelected] = useState<FinancialRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // ── Selection state ──
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // Clear selection on data change (page / filter change)
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
        setToast({
          msg: "Failed to update invoices — please try again",
          type: "error",
        });
        setConfirming(false);
      }
    } finally {
      setMarkingPaid(false);
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
              {/* Checkbox header */}
              <th className="pl-4 pr-2 py-3.5 w-10">
                <Checkbox
                  checked={allChecked}
                  indeterminate={someChecked}
                  disabled={unpaidIds.length === 0}
                  onChange={toggleSelectAll}
                />
              </th>
              {["Vendor", "Invoice #", "Date", "Due Date", "Amount", "Status"].map((h) => (
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
                  {/* Checkbox cell — stops propagation so click doesn't open drawer */}
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
                </tr>
              );
            })}

            {data.data.length === 0 && (
              <tr>
                <td
                  colSpan={7}
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
    </div>
  );
}
