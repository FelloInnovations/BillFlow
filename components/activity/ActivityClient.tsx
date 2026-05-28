"use client";

import { useState, useMemo, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ChevronUp, ChevronDown, Pencil, X, Check, ShieldAlert, BarChart2 } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { ActivityData, ActivityKeyData, Guardrail } from "@/types";

const KEY_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#f43f5e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6",
  "#f97316", "#06b6d4",
];

function formatMonth(m: string) {
  const [y, mo] = m.split("-");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${names[parseInt(mo) - 1]} '${y.slice(2)}`;
}

function recommendedBudget(key: ActivityKeyData, currentMonth: string): number | null {
  const completed = key.monthly.filter(m => m.month < currentMonth);
  const last3 = completed.slice(-3);
  if (!last3.length) return null;
  const avg = last3.reduce((a, b) => a + b.spend, 0) / last3.length;
  return Math.round(avg * 1.3 * 100) / 100;
}

interface Props {
  initialActivity: ActivityData;
  initialGuardrails: Guardrail[];
}

type SortKey = "project_name" | "total" | "min" | "max" | "avg" | "current_month_spend";

export function ActivityClient({ initialActivity, initialGuardrails }: Props) {
  const [tab, setTab] = useState<"spend" | "guardrails">("spend");
  const [monthRange, setMonthRange] = useState<3 | 6 | 12>(6);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    new Set(initialActivity.keys.map(k => k.key_name))
  );
  const [keyPickerOpen, setKeyPickerOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [guardrails, setGuardrails] = useState<Guardrail[]>(initialGuardrails);
  const [editing, setEditing] = useState<string | null>(null);
  const [editBudget, setEditBudget] = useState("");
  const [editThreshold, setEditThreshold] = useState("80");
  const [saving, setSaving] = useState(false);

  const currentMonth = new Date().toISOString().substring(0, 7);

  // Filter months to the selected range
  const cutoffMonth = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - monthRange + 1);
    return d.toISOString().substring(0, 7);
  }, [monthRange]);

  const visibleMonths = useMemo(
    () => initialActivity.months.filter(m => m >= cutoffMonth),
    [initialActivity.months, cutoffMonth]
  );

  const activeKeys = useMemo(
    () => initialActivity.keys.filter(k => selectedKeys.has(k.key_name)),
    [initialActivity.keys, selectedKeys]
  );

  // Build Recharts-compatible chart data
  const chartData = useMemo(() => {
    return visibleMonths.map(month => {
      const entry: Record<string, string | number> = { month: formatMonth(month) };
      for (const key of activeKeys) {
        const m = key.monthly.find(x => x.month === month);
        entry[key.project_name] = m?.spend ?? 0;
      }
      return entry;
    });
  }, [visibleMonths, activeKeys]);

  // Summary table data
  const tableData = useMemo(() => {
    return [...initialActivity.keys].sort((a, b) => {
      const va = a[sortBy];
      const vb = b[sortBy];
      if (typeof va === "string" && typeof vb === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }, [initialActivity.keys, sortBy, sortDir]);

  function toggleSort(col: SortKey) {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortBy !== col) return <ChevronDown className="w-3 h-3 text-slate-300" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 text-indigo-500" />
      : <ChevronDown className="w-3 h-3 text-indigo-500" />;
  }

  // Guardrails map
  const guardrailByProject = useMemo(() => {
    const m: Record<string, Guardrail> = {};
    for (const g of guardrails) m[g.project_name] = g;
    return m;
  }, [guardrails]);

  const currentSpendByProject = useMemo(() => {
    const m: Record<string, number> = {};
    for (const k of initialActivity.keys) {
      m[k.project_name] = k.current_month_spend;
    }
    return m;
  }, [initialActivity.keys]);

  const startEdit = useCallback((project: string, g?: Guardrail) => {
    setEditing(project);
    setEditBudget(g?.monthly_budget_usd?.toString() ?? "");
    setEditThreshold(g?.warning_threshold_pct?.toString() ?? "80");
  }, []);

  const saveGuardrail = useCallback(async (projectName: string) => {
    const budget = parseFloat(editBudget);
    if (isNaN(budget) || budget <= 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/guardrails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_name: projectName,
          monthly_budget_usd: budget,
          warning_threshold_pct: parseInt(editThreshold) || 80,
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        setGuardrails(prev => {
          const existing = prev.findIndex(g => g.project_name === projectName);
          if (existing >= 0) {
            const next = [...prev];
            next[existing] = saved;
            return next;
          }
          return [...prev, saved];
        });
        setEditing(null);
      }
    } finally {
      setSaving(false);
    }
  }, [editBudget, editThreshold]);

  const deleteGuardrail = useCallback(async (projectName: string) => {
    const res = await fetch(`/api/guardrails?project_name=${encodeURIComponent(projectName)}`, { method: "DELETE" });
    if (res.ok) {
      setGuardrails(prev => prev.filter(g => g.project_name !== projectName));
    }
  }, []);

  // Projects in guardrails tab = all OR projects
  const allProjects = initialActivity.all_projects;

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-fit">
        {(["spend", "guardrails"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
              tab === t
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            )}
          >
            {t === "spend" ? <BarChart2 className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
            {t === "spend" ? "Spend" : "Guardrails"}
          </button>
        ))}
      </div>

      {tab === "spend" && (
        <>
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              {([3, 6, 12] as const).map(n => (
                <button
                  key={n}
                  onClick={() => setMonthRange(n)}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-semibold transition-all",
                    monthRange === n
                      ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
                  )}
                >
                  {n}M
                </button>
              ))}
            </div>

            {/* Key selector */}
            <div className="relative">
              <button
                onClick={() => setKeyPickerOpen(o => !o)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Keys: {selectedKeys.size === initialActivity.keys.length ? "All" : selectedKeys.size}
                <ChevronDown className="w-3 h-3" />
              </button>
              {keyPickerOpen && (
                <div className="absolute top-full mt-1 left-0 z-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-2 min-w-[180px]">
                  {initialActivity.keys.map((k, i) => (
                    <label key={k.key_name} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedKeys.has(k.key_name)}
                        onChange={e => {
                          setSelectedKeys(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(k.key_name);
                            else next.delete(k.key_name);
                            return next;
                          });
                        }}
                        className="accent-indigo-600"
                      />
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: KEY_COLORS[i % KEY_COLORS.length] }}
                      />
                      <span className="text-xs text-slate-700 dark:text-slate-300">{k.project_name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Chart */}
          {chartData.length > 0 ? (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">Monthly Spend by Key</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:[stroke:#334155]" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={v => `$${v}`}
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatCurrency(value),
                      name,
                    ]}
                    contentStyle={{
                      borderRadius: "0.75rem",
                      border: "1px solid #e2e8f0",
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {activeKeys.map((k, i) => (
                    <Bar
                      key={k.key_name}
                      dataKey={k.project_name}
                      stackId="stack"
                      fill={KEY_COLORS[initialActivity.keys.indexOf(k) % KEY_COLORS.length]}
                      radius={i === activeKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-10 text-center">
              <p className="text-sm text-slate-400">No usage data yet. Snapshots are captured monthly.</p>
            </div>
          )}

          {/* Summary table */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Summary</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    {(
                      [
                        { key: "project_name" as SortKey, label: "Project" },
                        { key: "current_month_spend" as SortKey, label: "This Month" },
                        { key: "total" as SortKey, label: "All-Time Total" },
                        { key: "avg" as SortKey, label: "Avg/Month" },
                        { key: "min" as SortKey, label: "Min Month" },
                        { key: "max" as SortKey, label: "Max Month" },
                      ] as { key: SortKey; label: string }[]
                    ).map(col => (
                      <th
                        key={col.key}
                        onClick={() => toggleSort(col.key)}
                        className="px-5 py-3 text-left text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 select-none"
                      >
                        <span className="flex items-center gap-1">
                          {col.label}
                          <SortIcon col={col.key} />
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                  {tableData.map((k, i) => (
                    <tr key={k.key_name} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: KEY_COLORS[initialActivity.keys.findIndex(x => x.key_name === k.key_name) % KEY_COLORS.length] }}
                          />
                          <span className="font-medium text-slate-800 dark:text-slate-200">{k.project_name}</span>
                          {k.project_status && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 uppercase">
                              {k.project_status}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 pl-4.5 mt-0.5">{k.key_name}</p>
                      </td>
                      <td className="px-5 py-3 font-semibold text-indigo-600 dark:text-indigo-400">
                        {formatCurrency(k.current_month_spend)}
                      </td>
                      <td className="px-5 py-3 font-semibold text-slate-800 dark:text-slate-200">
                        {formatCurrency(k.total)}
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{formatCurrency(k.avg)}</td>
                      <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{formatCurrency(k.min)}</td>
                      <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{formatCurrency(k.max)}</td>
                    </tr>
                  ))}
                  {tableData.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400">No keys found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === "guardrails" && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Set monthly spend budgets per project. An alert email is sent when spend crosses the warning threshold.
            Current spend = live OR usage minus last month&apos;s snapshot baseline.
          </p>

          {allProjects.length === 0 && (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-10 text-center">
              <p className="text-sm text-slate-400">No OpenRouter projects found.</p>
            </div>
          )}

          <div className="grid gap-3">
            {allProjects.map(proj => {
              const g = guardrailByProject[proj.project_name];
              const currentSpend = currentSpendByProject[proj.project_name] ?? 0;
              const keyData = initialActivity.keys.find(k => k.project_name === proj.project_name);
              const recBudget = keyData ? recommendedBudget(keyData, currentMonth) : null;
              const isEditing = editing === proj.project_name;

              const pct = g?.monthly_budget_usd ? (currentSpend / g.monthly_budget_usd) * 100 : null;
              const barColor =
                pct === null ? "bg-slate-200 dark:bg-slate-700" :
                pct >= 100 ? "bg-rose-500" :
                pct >= (g?.warning_threshold_pct ?? 80) ? "bg-amber-400" :
                "bg-emerald-500";

              return (
                <div
                  key={proj.project_name}
                  className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">{proj.project_name}</span>
                        {proj.status && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 uppercase">
                            {proj.status}
                          </span>
                        )}
                        {pct !== null && pct >= 100 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">OVER BUDGET</span>
                        )}
                        {pct !== null && pct >= (g?.warning_threshold_pct ?? 80) && pct < 100 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">WARNING</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 font-mono">{proj.key_name}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!isEditing && (
                        <button
                          onClick={() => startEdit(proj.project_name, g)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                        >
                          <Pencil className="w-3 h-3" />
                          {g ? "Edit" : "Set budget"}
                        </button>
                      )}
                      {g && !isEditing && (
                        <button
                          onClick={() => deleteGuardrail(proj.project_name)}
                          className="p-1.5 rounded-lg text-slate-300 dark:text-slate-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Budget progress */}
                  {g?.monthly_budget_usd && !isEditing && (
                    <div className="mt-4 space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400">
                          {formatCurrency(currentSpend)} spent
                        </span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {pct!.toFixed(0)}% of {formatCurrency(g.monthly_budget_usd)} budget
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", barColor)}
                          style={{ width: `${Math.min(100, pct!)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Threshold: {g.warning_threshold_pct}%</span>
                        {recBudget && (
                          <span>Recommended: {formatCurrency(recBudget)}/mo</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* No guardrail yet */}
                  {!g && !isEditing && (
                    <div className="mt-3 flex items-center gap-3">
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        No budget set · This month: <strong className="text-slate-600 dark:text-slate-300">{formatCurrency(currentSpend)}</strong>
                      </p>
                      {recBudget && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">· Recommended: {formatCurrency(recBudget)}/mo</span>
                      )}
                    </div>
                  )}

                  {/* Edit form */}
                  {isEditing && (
                    <div className="mt-4 flex flex-wrap items-end gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wide">Monthly Budget ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editBudget}
                          onChange={e => setEditBudget(e.target.value)}
                          placeholder={recBudget ? recBudget.toString() : "e.g. 100"}
                          className="w-36 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                        {recBudget && (
                          <button
                            onClick={() => setEditBudget(recBudget.toString())}
                            className="block mt-1 text-[11px] text-indigo-500 hover:underline"
                          >
                            Use recommended ({formatCurrency(recBudget)})
                          </button>
                        )}
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wide">Warning at (%)</label>
                        <input
                          type="number"
                          min="1"
                          max="99"
                          value={editThreshold}
                          onChange={e => setEditThreshold(e.target.value)}
                          className="w-20 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveGuardrail(proj.project_name)}
                          disabled={saving || !editBudget}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Save
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
