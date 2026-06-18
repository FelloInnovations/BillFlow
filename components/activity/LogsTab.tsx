"use client";

import { useState, useEffect, useRef } from "react";
import { Clock, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { LogEntry, PaginatedResult } from "@/types";

interface LogsTabProps {
  allKeyNames: string[];
  initialData: PaginatedResult<LogEntry>;
}

const PAGE_SIZE = 50;

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

export function LogsTab({ allKeyNames, initialData }: LogsTabProps) {
  const [data, setData] = useState<PaginatedResult<LogEntry>>(initialData);
  const [page, setPage] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [modelFilter, setModelFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [pendingModel, setPendingModel] = useState("");
  const [pendingFrom, setPendingFrom] = useState("");
  const [pendingTo, setPendingTo] = useState("");
  const [keyPickerOpen, setKeyPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setKeyPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchLogs() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
        if (selectedKeys.size > 0) params.set("key_name", Array.from(selectedKeys).join(","));
        if (modelFilter) params.set("model", modelFilter);
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);
        const res = await fetch(`/api/logs?${params.toString()}`);
        if (!res.ok) return;
        const json: PaginatedResult<LogEntry> = await res.json();
        if (!cancelled) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchLogs();
    return () => { cancelled = true; };
  }, [page, selectedKeys, modelFilter, dateFrom, dateTo]);

  function applyFilters() {
    setSelectedKeys(new Set(pendingKeys));
    setModelFilter(pendingModel);
    setDateFrom(pendingFrom);
    setDateTo(pendingTo);
    setPage(1);
    setKeyPickerOpen(false);
  }

  function clearFilters() {
    setPendingKeys(new Set());
    setPendingModel("");
    setPendingFrom("");
    setPendingTo("");
    setSelectedKeys(new Set());
    setModelFilter("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  const hasFilters = selectedKeys.size > 0 || modelFilter || dateFrom || dateTo;
  const start = (data.page - 1) * data.pageSize + 1;
  const end = Math.min(data.page * data.pageSize, data.total);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">
          {/* Key multi-select */}
          <div ref={pickerRef} className="relative">
            <label className="block text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">Key</label>
            <button
              onClick={() => setKeyPickerOpen(o => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors min-w-[120px]"
            >
              {pendingKeys.size === 0 ? "All keys" : `${pendingKeys.size} selected`}
              <ChevronDown className="w-3 h-3 ml-auto" />
            </button>
            {keyPickerOpen && (
              <div className="absolute top-full mt-1 left-0 z-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-2 min-w-[200px] max-h-56 overflow-y-auto">
                {allKeyNames.map(key => (
                  <label
                    key={key}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={pendingKeys.has(key)}
                      onChange={e => {
                        setPendingKeys(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(key);
                          else next.delete(key);
                          return next;
                        });
                      }}
                      className="accent-salmon-600"
                    />
                    <span className="text-xs text-slate-700 dark:text-slate-300 font-mono truncate">{key}</span>
                  </label>
                ))}
                {allKeyNames.length === 0 && (
                  <p className="text-xs text-slate-400 px-2 py-1.5">No keys available</p>
                )}
              </div>
            )}
          </div>

          {/* Model text filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">Model</label>
            <input
              type="text"
              value={pendingModel}
              onChange={e => setPendingModel(e.target.value)}
              placeholder="e.g. gpt-4o"
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-salmon-400 w-36"
            />
          </div>

          {/* Date From */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">From</label>
            <input
              type="date"
              value={pendingFrom}
              onChange={e => setPendingFrom(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-salmon-400"
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">To</label>
            <input
              type="date"
              value={pendingTo}
              onChange={e => setPendingTo(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-salmon-400"
            />
          </div>

          <div className="flex gap-2 items-end">
            <button
              onClick={applyFilters}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-salmon-600 hover:bg-salmon-700 text-white transition-colors"
            >
              Apply
            </button>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>

        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        {data.total === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Clock className="w-10 h-10 text-slate-200 dark:text-slate-700" />
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center max-w-sm">
              Logs are synced hourly by n8n. Data will appear after the next scheduled run.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Timestamp</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Project</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Key</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Model</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Tokens</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Cost</th>
                  </tr>
                </thead>
                <tbody className={cn("divide-y divide-slate-50 dark:divide-slate-800/60 transition-opacity", loading ? "opacity-40" : "opacity-100")}>
                  {data.data.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap font-mono">
                        <span>{formatTimestamp(log.invoked_at)}</span>
                        {log.source === "live_today" && (
                          <span className="ml-1.5 text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 uppercase tracking-wider align-middle">
                            live
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-600 dark:text-slate-300 max-w-[140px] truncate">
                        {log.project_name ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-5 py-3 text-xs font-mono text-slate-500 dark:text-slate-400 max-w-[160px] truncate">
                        {log.key_name}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-600 dark:text-slate-300 max-w-[180px] truncate">
                        {log.model ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap font-mono">
                        {log.prompt_tokens !== null && log.completion_tokens !== null
                          ? `${log.prompt_tokens}+${log.completion_tokens}`
                          : log.total_tokens !== null
                          ? String(log.total_tokens)
                          : <span className="text-slate-300 dark:text-slate-600">—</span>
                        }
                      </td>
                      <td className="px-5 py-3 text-xs font-semibold text-salmon-600 dark:text-salmon-400">
                        {log.cost_usd !== null ? formatCurrency(log.cost_usd) : <span className="text-slate-300 dark:text-slate-600 font-normal">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {data.total > 0 ? `Showing ${start}–${end} of ${data.total} results` : "No results"}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Prev
                </button>
                <span className="text-xs text-slate-400 dark:text-slate-500 px-1">
                  {page} / {Math.max(1, data.totalPages)}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                  disabled={page >= data.totalPages || loading}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
