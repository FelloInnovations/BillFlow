"use client";

import { useState, useCallback, useEffect, useMemo, Fragment } from "react";
import { Bell, ChevronDown, ChevronRight, Plus, Trash2, Pencil, RefreshCw } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { ActivityData, SpendAlert, AlertDigestEntry, AlertPeriod, AlertFrequency } from "@/types";

interface GuardrailsTabProps {
  activity: ActivityData;
}

const FREQ_LABELS: Record<AlertFrequency, string> = {
  immediate: "Immediate",
  daily_digest: "Daily digest",
  weekly_digest: "Weekly digest",
};

function StatusBadge({ status, pct }: { status: SpendAlert["status"]; pct: number }) {
  if (status === "crossed") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />
        Crossed · {pct.toFixed(0)}%
      </span>
    );
  }
  if (status === "warning") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
        Warning · {pct.toFixed(0)}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
      OK · {pct.toFixed(0)}%
    </span>
  );
}

interface AlertFormState {
  project_name: string;
  openrouter_key_name: string;
  period_type: AlertPeriod;
  threshold_usd: string;
  notify_email: string;
  notify_frequency: AlertFrequency;
}

const EMPTY_FORM: AlertFormState = {
  project_name: "",
  openrouter_key_name: "",
  period_type: "monthly",
  threshold_usd: "",
  notify_email: "team",
  notify_frequency: "immediate",
};

export function GuardrailsTab({ activity }: GuardrailsTabProps) {
  const [alerts, setAlerts] = useState<SpendAlert[]>([]);
  const [history, setHistory] = useState<AlertDigestEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{ thresholds_crossed?: number; immediate_sent?: number } | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<"new" | string | null>(null);
  const [form, setForm] = useState<AlertFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const projectKeyMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of activity.all_projects) {
      if (p.key_name) m[p.project_name] = p.key_name;
    }
    return m;
  }, [activity.all_projects]);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts");
      if (res.ok) {
        const json = await res.json();
        setAlerts(json.alerts ?? []);
        setHistory(json.history ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  async function handleCheck() {
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await fetch("/api/alerts/check", { method: "POST" });
      const json = await res.json();
      setCheckResult(json);
      setLastCheckedAt(new Date().toISOString());
      await fetchAlerts();
    } finally {
      setChecking(false);
    }
  }

  function openNew() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditingId("new");
  }

  function openEdit(alert: SpendAlert) {
    setForm({
      project_name: alert.project_name,
      openrouter_key_name: alert.openrouter_key_name,
      period_type: alert.period_type,
      threshold_usd: alert.threshold_usd.toString(),
      notify_email: alert.notify_email,
      notify_frequency: alert.notify_frequency,
    });
    setFormError(null);
    setEditingId(alert.id);
  }

  function cancelForm() {
    setEditingId(null);
    setFormError(null);
  }

  function handleProjectChange(name: string) {
    const key = projectKeyMap[name] ?? "";
    setForm(f => ({ ...f, project_name: name, openrouter_key_name: key }));
  }

  async function handleSave() {
    const threshold = parseFloat(form.threshold_usd);
    if (!form.project_name) { setFormError("Project is required"); return; }
    if (!form.openrouter_key_name) { setFormError("OpenRouter key is required"); return; }
    if (isNaN(threshold) || threshold <= 0) { setFormError("Threshold must be a positive number"); return; }

    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_name: form.project_name,
          openrouter_key_name: form.openrouter_key_name,
          period_type: form.period_type,
          threshold_usd: threshold,
          notify_email: form.notify_email,
          notify_frequency: form.notify_frequency,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setFormError(err.error ?? "Failed to save");
        return;
      }
      setEditingId(null);
      await fetchAlerts();
    } finally {
      setSaving(false);
    }
  }

  async function handleDisable(id: string) {
    const res = await fetch(`/api/alerts?id=${id}`, { method: "DELETE" });
    if (res.ok) setAlerts(prev => prev.filter(a => a.id !== id));
  }

  const crossedCount = alerts.filter(a => a.status === "crossed").length;
  const warningCount = alerts.filter(a => a.status === "warning").length;

  // Inline form row — rendered as a plain JSX expression so it doesn't re-mount
  const formRow = (
    <tr className="bg-indigo-50/60 dark:bg-indigo-950/20 border-t border-b border-indigo-100 dark:border-indigo-900/40">
      <td colSpan={8} className="px-4 py-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Project */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Project</label>
            <select
              value={form.project_name}
              onChange={e => handleProjectChange(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[160px]"
            >
              <option value="">— select —</option>
              {activity.all_projects.map(p => (
                <option key={p.project_name} value={p.project_name}>{p.project_name}</option>
              ))}
            </select>
          </div>
          {/* OR Key */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">OR Key</label>
            <input
              type="text"
              value={form.openrouter_key_name}
              onChange={e => setForm(f => ({ ...f, openrouter_key_name: e.target.value }))}
              placeholder="key name"
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-44 font-mono"
            />
          </div>
          {/* Period */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Period</label>
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
              {(["daily", "weekly", "monthly"] as AlertPeriod[]).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, period_type: p }))}
                  className={cn(
                    "px-3 py-1.5 font-medium transition-colors capitalize",
                    form.period_type === p
                      ? "bg-indigo-600 text-white"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          {/* Threshold */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Threshold ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.threshold_usd}
              onChange={e => setForm(f => ({ ...f, threshold_usd: e.target.value }))}
              placeholder="e.g. 50"
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-28"
            />
          </div>
          {/* Notify */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Notify</label>
            <select
              value={form.notify_email}
              onChange={e => setForm(f => ({ ...f, notify_email: e.target.value }))}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="team">Whole team</option>
              <option value="shailja.dwivedi@fello.ai">Shailja only</option>
            </select>
          </div>
          {/* Frequency */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Frequency</label>
            <select
              value={form.notify_frequency}
              onChange={e => setForm(f => ({ ...f, notify_frequency: e.target.value as AlertFrequency }))}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="immediate">Immediate</option>
              <option value="daily_digest">Daily digest</option>
              <option value="weekly_digest">Weekly digest</option>
            </select>
          </div>
          {/* Actions */}
          <div className="flex gap-2 pb-0.5">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={cancelForm}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
        {formError && (
          <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{formError}</p>
        )}
      </td>
    </tr>
  );

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-8 text-center">
        <p className="text-xs text-slate-400">Loading alerts…</p>
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (alerts.length === 0 && editingId !== "new") {
    return (
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-10 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950/40 mb-4">
          <Bell className="w-6 h-6 text-indigo-500" />
        </div>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">No spend alerts set</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 max-w-xs mx-auto">
          Set a threshold and get notified immediately or via digest when a project exceeds its spend limit.
        </p>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
        >
          <Plus className="w-4 h-4" />
          Set your first alert
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs">
          <span className="font-semibold text-slate-700 dark:text-slate-300">{alerts.length} active</span>
          {crossedCount > 0 && (
            <span className="font-semibold text-rose-600 dark:text-rose-400">{crossedCount} crossed</span>
          )}
          {warningCount > 0 && (
            <span className="font-semibold text-amber-600 dark:text-amber-400">{warningCount} warning</span>
          )}
          {lastCheckedAt && (
            <span className="text-slate-400">
              · checked {new Date(lastCheckedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {checkResult && (
            <span className="text-slate-400">
              — {checkResult.thresholds_crossed ?? 0} crossed, {checkResult.immediate_sent ?? 0} sent
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCheck}
            disabled={checking}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", checking && "animate-spin")} />
            {checking ? "Checking…" : "Check Now"}
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Alert
          </button>
        </div>
      </div>

      {/* Main table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left">Project</th>
              <th className="px-4 py-2.5 text-left">Key</th>
              <th className="px-4 py-2.5 text-left">Period</th>
              <th className="px-4 py-2.5 text-right">Threshold</th>
              <th className="px-4 py-2.5 text-right">Current Spend</th>
              <th className="px-4 py-2.5 text-left">Status</th>
              <th className="px-4 py-2.5 text-left">Frequency</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
            {editingId === "new" && formRow}
            {alerts.map(alert => (
              <Fragment key={alert.id}>
                <tr
                  className={cn(
                    "hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors",
                    alert.status === "crossed" && "bg-rose-50/40 dark:bg-rose-950/10",
                    alert.status === "warning" && "bg-amber-50/40 dark:bg-amber-950/10",
                  )}
                >
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{alert.project_name}</td>
                  <td className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500 font-mono max-w-[140px] truncate">{alert.openrouter_key_name}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{alert.period_label}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700 dark:text-slate-300">{formatCurrency(alert.threshold_usd)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <span className={cn(
                        "font-semibold",
                        alert.status === "crossed" ? "text-rose-600 dark:text-rose-400" :
                        alert.status === "warning" ? "text-amber-600 dark:text-amber-400" :
                        "text-slate-700 dark:text-slate-300"
                      )}>
                        {formatCurrency(alert.current_spend)}
                      </span>
                      <div className="w-20 h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            alert.status === "crossed" ? "bg-rose-500" :
                            alert.status === "warning" ? "bg-amber-400" :
                            "bg-emerald-500"
                          )}
                          style={{ width: `${Math.min(100, alert.pct_of_threshold)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={alert.status} pct={alert.pct_of_threshold} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{FREQ_LABELS[alert.notify_frequency]}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(alert)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDisable(alert.id)}
                        className="p-1.5 rounded-lg text-slate-300 dark:text-slate-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                        title="Disable"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
                {editingId === alert.id && formRow}
              </Fragment>
            ))}
          </tbody>
        </table>

        {alerts.length === 0 && editingId === "new" && (
          <div className="px-4 py-2 text-center text-xs text-slate-400">Fill in the form above to create your first alert.</div>
        )}
      </div>

      {/* Alert history accordion */}
      {history.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <button
            onClick={() => setHistoryExpanded(e => !e)}
            className="w-full flex items-center gap-2 px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
          >
            {historyExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Alert History ({history.length})
          </button>
          {historyExpanded && (
            <div className="border-t border-slate-100 dark:border-slate-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    <th className="px-4 py-2 text-left">Project</th>
                    <th className="px-4 py-2 text-left">Period</th>
                    <th className="px-4 py-2 text-right">Threshold</th>
                    <th className="px-4 py-2 text-right">Actual</th>
                    <th className="px-4 py-2 text-left">Type</th>
                    <th className="px-4 py-2 text-left">Detected</th>
                    <th className="px-4 py-2 text-left">Sent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                  {history.map(h => (
                    <tr key={h.id} className="text-slate-600 dark:text-slate-400">
                      <td className="px-4 py-2">{h.project_name}</td>
                      <td className="px-4 py-2 capitalize">{h.period_type}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(h.threshold_usd)}</td>
                      <td className="px-4 py-2 text-right font-semibold text-rose-600 dark:text-rose-400">{formatCurrency(h.actual_spend)}</td>
                      <td className="px-4 py-2">{FREQ_LABELS[h.digest_type] ?? h.digest_type}</td>
                      <td className="px-4 py-2 text-slate-400">{new Date(h.detected_at).toLocaleDateString()}</td>
                      <td className="px-4 py-2">
                        {h.sent
                          ? <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Yes</span>
                          : <span className="text-slate-300 dark:text-slate-600">Pending</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
