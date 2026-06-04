"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Bell, Plus, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { ActivityData, SpendAlert, AlertStatus } from "@/types";

interface GuardrailsTabProps {
  activity: ActivityData;
}

function statusColor(status: AlertStatus) {
  if (status === "breached") return "rose";
  if (status === "warning")  return "amber";
  return "emerald";
}

function StatusBadge({ alert }: { alert: SpendAlert }) {
  const color = statusColor(alert.status);
  const label =
    alert.status === "breached" ? "Limit reached" :
    alert.status === "warning"  ? `Warning — ${alert.warning_pct}% reached` :
    "ok";
  const dot =
    alert.status === "breached" ? "🔴" :
    alert.status === "warning"  ? "🟡" : "🟢";

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 text-xs font-semibold",
      color === "rose"    && "text-rose-600 dark:text-rose-400",
      color === "amber"   && "text-amber-600 dark:text-amber-400",
      color === "emerald" && "text-emerald-600 dark:text-emerald-400",
    )}>
      {dot} {label}
    </span>
  );
}

function ProgressBar({ pct, status }: { pct: number; status: AlertStatus }) {
  return (
    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
      <div
        className={cn(
          "h-full rounded-full transition-all",
          status === "breached" ? "bg-rose-500" :
          status === "warning"  ? "bg-amber-400" :
          "bg-emerald-500"
        )}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

function formatCheckedAt(ts: string | null): { label: string; stale: boolean } {
  if (!ts) return { label: "Never checked by n8n", stale: true };
  const d = new Date(ts);
  const minsAgo = (Date.now() - d.getTime()) / 60000;
  const label =
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) +
    ", " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) +
    " UTC";
  return { label, stale: minsAgo > 90 };
}

interface NewFormState {
  project_name: string;
  openrouter_key_name: string;
  limit_usd: string;
  warning_pct: string;
}

interface EditFormState {
  limit_usd: string;
  warning_pct: string;
}

const EMPTY_NEW: NewFormState = {
  project_name: "",
  openrouter_key_name: "",
  limit_usd: "",
  warning_pct: "80",
};

export function GuardrailsTab({ activity }: GuardrailsTabProps) {
  const [alerts, setAlerts] = useState<SpendAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState<NewFormState>(EMPTY_NEW);
  const [newError, setNewError] = useState<string | null>(null);
  const [savingNew, setSavingNew] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({ limit_usd: "", warning_pct: "80" });
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const orProjects = useMemo(
    () => activity.all_projects.filter(p => p.key_name),
    [activity.all_projects]
  );

  const projectKeyMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of orProjects) m[p.project_name] = p.key_name!;
    return m;
  }, [orProjects]);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts");
      if (res.ok) {
        const data = await res.json();
        setAlerts(Array.isArray(data) ? data : []);
      } else {
        setAlerts([]);
      }
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  // ── New alert ────────────────────────────────────────────────────────────────

  function openNew() {
    setNewForm(EMPTY_NEW);
    setNewError(null);
    setShowNewForm(true);
  }

  function handleNewProjectChange(name: string) {
    setNewForm(f => ({ ...f, project_name: name, openrouter_key_name: projectKeyMap[name] ?? "" }));
  }

  async function handleSaveNew() {
    const limit = parseFloat(newForm.limit_usd);
    const warnPct = parseInt(newForm.warning_pct);
    if (!newForm.project_name)          { setNewError("Project is required"); return; }
    if (!newForm.openrouter_key_name)   { setNewError("OpenRouter key is required"); return; }
    if (isNaN(limit) || limit <= 0)     { setNewError("Limit must be a positive number"); return; }
    if (isNaN(warnPct) || warnPct <= 0 || warnPct >= 100) { setNewError("Warning % must be between 1–99"); return; }

    setSavingNew(true);
    setNewError(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_name: newForm.project_name,
          openrouter_key_name: newForm.openrouter_key_name,
          limit_usd: limit,
          limit_period: 'monthly',
          warning_pct: warnPct,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setNewError(err.error ?? "Failed to save");
        return;
      }
      setShowNewForm(false);
      await fetchAlerts();
    } finally {
      setSavingNew(false);
    }
  }

  // ── Edit alert ───────────────────────────────────────────────────────────────

  function openEdit(alert: SpendAlert) {
    setEditForm({
      limit_usd: alert.limit_usd.toString(),
      warning_pct: alert.warning_pct.toString(),
    });
    setEditError(null);
    setEditingId(alert.id);
  }

  async function handleSaveEdit(id: string) {
    const limit = parseFloat(editForm.limit_usd);
    const warnPct = parseInt(editForm.warning_pct);
    if (isNaN(limit) || limit <= 0)     { setEditError("Limit must be a positive number"); return; }
    if (isNaN(warnPct) || warnPct <= 0 || warnPct >= 100) { setEditError("Warning % must be between 1–99"); return; }

    setSavingEdit(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limit_usd: limit,
          warning_pct: warnPct,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setEditError(err.error ?? "Failed to save");
        return;
      }
      setEditingId(null);
      await fetchAlerts();
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/alerts/${id}`, { method: "DELETE" });
    if (res.ok) setAlerts(prev => prev.filter(a => a.id !== id));
  }

  // ── Status summary counts ────────────────────────────────────────────────────
  const breachedCount = alerts.filter(a => a.status === "breached").length;
  const warningCount  = alerts.filter(a => a.status === "warning").length;

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-8 text-center">
        <p className="text-xs text-slate-400">Loading alerts…</p>
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (alerts.length === 0 && !showNewForm) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-10 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950/40 mb-4">
            <Bell className="w-6 h-6 text-indigo-500" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">No spend alerts set</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 max-w-xs mx-auto">
            Set a limit per project. n8n checks hourly and emails the team when a threshold is crossed.
          </p>
          <button
            onClick={openNew}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            Set your first alert
          </button>
        </div>
      </div>
    );
  }

  // ── New alert form card ──────────────────────────────────────────────────────
  const newFormCard = showNewForm && (
    <div className="rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/40 shadow-sm p-5 space-y-4">
      <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide">New Alert</p>
      <div className="flex flex-wrap gap-3 items-end">
        {/* Project */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Project</label>
          <select
            value={newForm.project_name}
            onChange={e => handleNewProjectChange(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[160px]"
          >
            <option value="">— select —</option>
            {orProjects.map(p => (
              <option key={p.project_name} value={p.project_name}>{p.project_name}</option>
            ))}
          </select>
        </div>
        {/* Limit */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Limit ($)</label>
          <input
            type="number"
            min="0"
            step="1"
            value={newForm.limit_usd}
            onChange={e => setNewForm(f => ({ ...f, limit_usd: e.target.value }))}
            placeholder="e.g. 750"
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-28"
          />
        </div>
        {/* Warning pct */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Email alert at</label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min="1"
              max="99"
              value={newForm.warning_pct}
              onChange={e => setNewForm(f => ({ ...f, warning_pct: e.target.value }))}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-16"
            />
            <span className="text-xs text-slate-500">% of limit</span>
          </div>
        </div>
        {/* Buttons */}
        <div className="flex gap-2 pb-0.5">
          <button
            onClick={handleSaveNew}
            disabled={savingNew}
            className="px-4 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 transition-colors"
          >
            {savingNew ? "Saving…" : "Save Alert"}
          </button>
          <button
            onClick={() => setShowNewForm(false)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
      {newError && <p className="text-xs text-rose-600 dark:text-rose-400">{newError}</p>}
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
        Alerts are sent to all team members via n8n hourly.
      </p>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs">
          <span className="font-semibold text-slate-700 dark:text-slate-300">{alerts.length} active</span>
          {breachedCount > 0 && (
            <span className="font-semibold text-rose-600 dark:text-rose-400">{breachedCount} breached</span>
          )}
          {warningCount > 0 && (
            <span className="font-semibold text-amber-600 dark:text-amber-400">{warningCount} warning</span>
          )}
          <span className="text-slate-400">· checked by n8n hourly</span>
        </div>
        {!showNewForm && (
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Alert
          </button>
        )}
      </div>

      {newFormCard}

      {/* Alert cards */}
      <div className="grid gap-3">
        {alerts.map(alert => {
          const { label: checkedLabel, stale } = formatCheckedAt(alert.last_checked_at);
          const isEditing = editingId === alert.id;

          return (
            <div
              key={alert.id}
              className={cn(
                "rounded-2xl bg-white dark:bg-slate-900 border shadow-sm p-5",
                alert.status === "breached" ? "border-rose-200 dark:border-rose-800/50" :
                alert.status === "warning"  ? "border-amber-200 dark:border-amber-800/50" :
                "border-slate-200 dark:border-slate-700"
              )}
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 dark:text-slate-200">{alert.project_name}</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mt-0.5 truncate">{alert.openrouter_key_name}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!isEditing && (
                    <>
                      <button
                        onClick={() => openEdit(alert)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      >
                        <Pencil className="w-3 h-3" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(alert.id)}
                        className="p-1.5 rounded-lg text-slate-300 dark:text-slate-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                        title="Remove alert"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Limit label (or edit form) */}
              {isEditing ? (
                <div className="mb-3 space-y-3">
                  <div className="flex flex-wrap gap-3 items-end">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Limit ($)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={editForm.limit_usd}
                        onChange={e => setEditForm(f => ({ ...f, limit_usd: e.target.value }))}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-28"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Email alert at</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="1"
                          max="99"
                          value={editForm.warning_pct}
                          onChange={e => setEditForm(f => ({ ...f, warning_pct: e.target.value }))}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-16"
                        />
                        <span className="text-xs text-slate-500">% of limit</span>
                      </div>
                    </div>
                    <div className="flex gap-2 pb-0.5">
                      <button
                        onClick={() => handleSaveEdit(alert.id)}
                        disabled={savingEdit}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 transition-colors"
                      >
                        {savingEdit ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                  {editError && <p className="text-xs text-rose-600 dark:text-rose-400">{editError}</p>}
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  Monthly limit:{" "}
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {formatCurrency(alert.limit_usd)}
                  </span>
                  {" "}· email alert at {alert.warning_pct}%
                </p>
              )}

              {/* Spend / progress */}
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <span className={cn(
                    "text-sm font-semibold",
                    alert.status === "breached" ? "text-rose-600 dark:text-rose-400" :
                    alert.status === "warning"  ? "text-amber-600 dark:text-amber-400" :
                    "text-slate-800 dark:text-slate-200"
                  )}>
                    {formatCurrency(alert.current_spend)}
                    <span className="font-normal text-slate-400 dark:text-slate-500"> / {formatCurrency(alert.limit_usd)}</span>
                  </span>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {Number(alert.current_pct).toFixed(1)}%
                  </span>
                </div>
                <ProgressBar pct={Number(alert.current_pct)} status={alert.status} />
                <div className="flex items-center justify-between">
                  <StatusBadge alert={alert} />
                </div>
              </div>

              {/* Last checked */}
              <div className="mt-3 flex items-center gap-1.5">
                {stale && <AlertTriangle className="w-3 h-3 text-slate-300 dark:text-slate-600 shrink-0" />}
                <p className={cn(
                  "text-[11px]",
                  stale ? "text-slate-400 dark:text-slate-500" : "text-slate-400 dark:text-slate-500"
                )}>
                  {stale ? (
                    <><span className="text-amber-500 dark:text-amber-400 font-medium">n8n sync may be inactive</span> · last: {checkedLabel}</>
                  ) : (
                    <>Last checked: {checkedLabel}</>
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
