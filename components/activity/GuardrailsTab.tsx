"use client";

import { useState, useMemo } from "react";
import { Pencil, X, Check, ChevronRight, ChevronDown } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { ActivityData, ActivityKeyData, Guardrail } from "@/types";

function recommendedBudget(key: ActivityKeyData, currentMonth: string): number | null {
  const completed = key.monthly.filter(m => m.month < currentMonth);
  const last3 = completed.slice(-3);
  if (!last3.length) return null;
  const avg = last3.reduce((a, b) => a + b.spend, 0) / last3.length;
  return Math.round(avg * 1.3 * 100) / 100;
}

interface GuardrailsTabProps {
  activity: ActivityData;
  guardrails: Guardrail[];
  onSave: (projectName: string, budget: number, threshold: number) => Promise<void>;
  onDelete: (projectName: string) => Promise<void>;
}

export function GuardrailsTab({ activity, guardrails, onSave, onDelete }: GuardrailsTabProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [editBudget, setEditBudget] = useState("");
  const [editThreshold, setEditThreshold] = useState("80");
  const [saving, setSaving] = useState(false);
  const [unprotectedExpanded, setUnprotectedExpanded] = useState(false);

  const currentMonth = useMemo(() => new Date().toISOString().substring(0, 7), []);

  const now = new Date();
  const daysElapsed = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const guardrailByProject = useMemo(() => {
    const m: Record<string, Guardrail> = {};
    for (const g of guardrails) m[g.project_name] = g;
    return m;
  }, [guardrails]);

  const keyByProject = useMemo(() => {
    const m: Record<string, ActivityKeyData> = {};
    for (const k of activity.keys) m[k.project_name] = k;
    return m;
  }, [activity.keys]);

  const currentSpendByProject = useMemo(() => {
    const m: Record<string, number> = {};
    for (const k of activity.keys) m[k.project_name] = k.current_month_spend;
    return m;
  }, [activity.keys]);

  const protectedProjects = useMemo(() => {
    return guardrails
      .map(g => {
        const spend = currentSpendByProject[g.project_name] ?? 0;
        const pct = g.monthly_budget_usd ? (spend / g.monthly_budget_usd) * 100 : 0;
        return { g, spend, pct };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [guardrails, currentSpendByProject]);

  const unprotectedProjects = useMemo(() => {
    return activity.all_projects.filter(p => !guardrailByProject[p.project_name]);
  }, [activity.all_projects, guardrailByProject]);

  const totalBudget = useMemo(
    () => guardrails.reduce((s, g) => s + (g.monthly_budget_usd ?? 0), 0),
    [guardrails]
  );

  const totalSpentThisMonth = useMemo(() => {
    return guardrails.reduce((s, g) => s + (currentSpendByProject[g.project_name] ?? 0), 0);
  }, [guardrails, currentSpendByProject]);

  const avgThreshold = useMemo(() => {
    if (!guardrails.length) return 80;
    return Math.round(guardrails.reduce((s, g) => s + g.warning_threshold_pct, 0) / guardrails.length);
  }, [guardrails]);

  const overallPct = totalBudget > 0 ? (totalSpentThisMonth / totalBudget) * 100 : 0;

  function startEdit(project: string, g?: Guardrail) {
    setEditing(project);
    setEditBudget(g?.monthly_budget_usd?.toString() ?? "");
    setEditThreshold(g?.warning_threshold_pct?.toString() ?? "80");
  }

  async function handleSave(projectName: string) {
    const budget = parseFloat(editBudget);
    if (isNaN(budget) || budget <= 0) return;
    setSaving(true);
    try {
      await onSave(projectName, budget, parseInt(editThreshold) || 80);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  function EditForm({ projectName, recBudget }: { projectName: string; recBudget: number | null }) {
    return (
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wide">
            Monthly Budget ($)
          </label>
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
              Use recommended ({formatCurrency(recBudget)} — 3-mo avg × 1.3)
            </button>
          )}
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wide">
            Warning at (%)
          </label>
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
            onClick={() => handleSave(projectName)}
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
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Set monthly spend budgets per project. An alert email is sent when spend crosses the warning threshold.
        Current spend = live OR usage minus last month&apos;s snapshot baseline.
      </p>

      {/* Org-wide summary card */}
      {guardrails.some(g => g.monthly_budget_usd) && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">Total Budget</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(totalBudget)}</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">/month across {guardrails.filter(g => g.monthly_budget_usd).length} projects</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">Spent This Month</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(totalSpentThisMonth)}</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">across protected projects</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">% Used</p>
              <p className={cn(
                "text-xl font-bold",
                overallPct >= 100 ? "text-rose-600 dark:text-rose-400" :
                overallPct >= avgThreshold ? "text-amber-600 dark:text-amber-400" :
                "text-emerald-600 dark:text-emerald-400"
              )}>
                {overallPct.toFixed(1)}%
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">of total budget</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  overallPct >= 100 ? "bg-rose-500" :
                  overallPct >= avgThreshold ? "bg-amber-400" :
                  "bg-emerald-500"
                )}
                style={{ width: `${Math.min(100, overallPct)}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              threshold avg: {avgThreshold}%
            </p>
          </div>
        </div>
      )}

      {/* Protected projects */}
      {protectedProjects.length === 0 && unprotectedProjects.length === 0 && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-10 text-center">
          <p className="text-sm text-slate-400">No OpenRouter projects found.</p>
        </div>
      )}

      <div className="grid gap-3">
        {protectedProjects.map(({ g, spend, pct }) => {
          const keyData = keyByProject[g.project_name];
          const proj = activity.all_projects.find(p => p.project_name === g.project_name);
          const recBudget = keyData ? recommendedBudget(keyData, currentMonth) : null;
          const isEditing = editing === g.project_name;

          const dailyRate = daysElapsed > 0 ? spend / daysElapsed : 0;
          const projectedEOM = dailyRate * daysInMonth;

          const barColor =
            pct >= 100 ? "bg-rose-500" :
            pct >= g.warning_threshold_pct ? "bg-amber-400" :
            "bg-emerald-500";

          return (
            <div
              key={g.project_name}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">{g.project_name}</span>
                    {proj?.status && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 uppercase">
                        {proj.status}
                      </span>
                    )}
                    {pct >= 100 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
                        OVER BUDGET
                      </span>
                    )}
                    {pct >= g.warning_threshold_pct && pct < 100 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                        WARNING
                      </span>
                    )}
                  </div>
                  {proj?.key_name && (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 font-mono">{proj.key_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!isEditing && (
                    <button
                      onClick={() => startEdit(g.project_name, g)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                      Edit
                    </button>
                  )}
                  {!isEditing && (
                    <button
                      onClick={() => onDelete(g.project_name)}
                      className="p-1.5 rounded-lg text-slate-300 dark:text-slate-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {!isEditing && g.monthly_budget_usd && (
                <div className="mt-4 space-y-1.5">
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", barColor)}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatCurrency(spend)} spent · {pct.toFixed(0)}% of {formatCurrency(g.monthly_budget_usd)} budget · threshold {g.warning_threshold_pct}%
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    ~{formatCurrency(dailyRate)}/day · Projected: {formatCurrency(projectedEOM)} by month-end
                  </p>
                  {recBudget && (
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Recommended: {formatCurrency(recBudget)}/mo — Based on 3-month avg × 1.3
                    </p>
                  )}
                </div>
              )}

              {isEditing && <EditForm projectName={g.project_name} recBudget={recBudget} />}
            </div>
          );
        })}
      </div>

      {/* Unprotected section */}
      {unprotectedProjects.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <button
            onClick={() => setUnprotectedExpanded(e => !e)}
            className="w-full flex items-center gap-2 px-5 py-3.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
          >
            {unprotectedExpanded
              ? <ChevronDown className="w-3.5 h-3.5" />
              : <ChevronRight className="w-3.5 h-3.5" />
            }
            Unprotected Projects ({unprotectedProjects.length})
          </button>
          {unprotectedExpanded && (
            <div className="border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-50 dark:divide-slate-800/60">
              {unprotectedProjects.map(proj => {
                const spend = currentSpendByProject[proj.project_name] ?? 0;
                const keyData = keyByProject[proj.project_name];
                const recBudget = keyData ? recommendedBudget(keyData, currentMonth) : null;
                const isEditing = editing === proj.project_name;
                return (
                  <div key={proj.project_name} className="px-5 py-3.5">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div>
                        <span className="font-medium text-sm text-slate-700 dark:text-slate-300">{proj.project_name}</span>
                        {proj.key_name && (
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 font-mono">{proj.key_name}</p>
                        )}
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                          This month: <span className="font-medium text-slate-600 dark:text-slate-300">{formatCurrency(spend)}</span>
                        </p>
                      </div>
                      {!isEditing && (
                        <button
                          onClick={() => startEdit(proj.project_name)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shrink-0"
                        >
                          <Pencil className="w-3 h-3" />
                          Set budget
                        </button>
                      )}
                    </div>
                    {isEditing && <EditForm projectName={proj.project_name} recBudget={recBudget} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
