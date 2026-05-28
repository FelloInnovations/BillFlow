"use client";

import { useState } from "react";
import { Tool } from "@/types";
import { formatCurrency, cn } from "@/lib/utils";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Brain, Wrench, ChevronDown, ChevronUp,
  AlertTriangle, Ban, Trash2, X, Pencil, Loader2, Link2, Lock,
} from "lucide-react";

export type FlagType = "paying_not_in_use" | "never_used";

interface Props {
  tool: Tool;
  flagTypes?: FlagType[];
  onDelete?: (toolKey: string) => void;
  onEdit?: (toolKey: string, updates: { displayLabel: string; type: "llm" | "service"; notes: string }) => void;
  allProjectNames?: string[];
  onAttributeChange?: (toolKey: string, manualProjects: string[]) => void;
}

function ConfirmDelete({ label, onConfirm, onCancel }: { label: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900 dark:text-white text-sm">Delete this tool?</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">{label}</span> will be permanently removed from all views.
            </p>
          </div>
          <button onClick={onCancel} className="shrink-0 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-colors">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function EditModal({ tool, onSave, onCancel }: { tool: Tool; onSave: (updates: { displayLabel: string; type: "llm" | "service"; notes: string }) => Promise<void>; onCancel: () => void }) {
  const [label, setLabel] = useState(tool.displayLabel);
  const [type, setType] = useState<"llm" | "service">(tool.type);
  const [notes, setNotes] = useState(tool.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave({ displayLabel: label.trim() || tool.displayLabel, type, notes });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900 dark:text-white text-sm">Edit tool</p>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">{tool.name}</p>
          </div>
          <button onClick={onCancel} className="shrink-0 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Display Name</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Type</label>
            <div className="flex gap-2">
              {(["llm", "service"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={cn(
                    "flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors",
                    type === t
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-600"
                  )}
                >
                  {t === "llm" ? "LLM" : "Service"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Internal notes about this tool…"
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-60 flex items-center gap-1.5"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export function ToolCard({ tool, flagTypes, onDelete, onEdit, allProjectNames = [], onAttributeChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [attributeOpen, setAttributeOpen] = useState(false);
  const [attrSearch, setAttrSearch] = useState("");
  const [attrSelected, setAttrSelected] = useState<Set<string>>(new Set(tool.manualProjects ?? []));
  const [attrNotes, setAttrNotes] = useState("");
  const [savingAttribution, setSavingAttribution] = useState(false);

  const hasTrend = tool.monthlyTrend.length > 1;
  const isLLM = tool.type === "llm";
  const isPerKey = tool.name.startsWith("OpenRouter:");
  const isBilledInactive = flagTypes?.includes("paying_not_in_use");
  const isNeverUsed = flagTypes?.includes("never_used");

  const borderAccent = isNeverUsed
    ? "border-l-4 border-l-red-400"
    : isBilledInactive
    ? "border-l-4 border-l-amber-400"
    : "";

  async function handleDelete() {
    setConfirmDelete(false);
    try {
      await fetch("/api/tools/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolKey: tool.name }),
      });
      onDelete?.(tool.name);
    } catch {}
  }

  async function handleSaveEdit(updates: { displayLabel: string; type: "llm" | "service"; notes: string }) {
    await fetch("/api/tools/edit", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolKey: tool.name, displayLabel: updates.displayLabel, type: updates.type, notes: updates.notes }),
    });
    onEdit?.(tool.name, updates);
    setEditOpen(false);
  }

  async function handleSaveAttribution() {
    setSavingAttribution(true);
    const projects = [...attrSelected];
    await fetch("/api/tools/attribute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendor_name: tool.name, project_names: projects, notes: attrNotes || null }),
    });
    onAttributeChange?.(tool.name, projects);
    setSavingAttribution(false);
    setAttributeOpen(false);
  }

  return (
    <>
      {confirmDelete && (
        <ConfirmDelete
          label={tool.displayLabel}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
      {editOpen && (
        <EditModal
          tool={tool}
          onSave={handleSaveEdit}
          onCancel={() => setEditOpen(false)}
        />
      )}

      <div className={cn("group rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden hover:shadow-md transition-shadow", borderAccent)}>
        <div
          className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="shrink-0 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800">
              {isLLM ? (
                <Brain className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              ) : (
                <Wrench className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-slate-900 dark:text-white text-sm truncate">{tool.displayLabel}</p>
                {isPerKey && tool.rawKey && (
                  <span title={`OpenRouter key: ${tool.rawKey}`} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-help">
                    {tool.rawKey}
                  </span>
                )}
                {isBilledInactive && (
                  <span title="Being billed but not used in any currently active project" className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 cursor-help">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    No active project
                  </span>
                )}
                {isNeverUsed && (
                  <span title="This tool has never appeared in any project past or present" className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 cursor-help">
                    <Ban className="w-2.5 h-2.5" />
                    Never used
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                <span className="font-semibold text-slate-500">{isLLM ? "LLM" : "Service"}</span>
                {isPerKey ? " · API usage" : " · invoices"}
                {isLLM && " · "}
                {isLLM && (tool.projects.length > 0
                  ? `${tool.projects.length} project${tool.projects.length > 1 ? "s" : ""}`
                  : "No projects linked")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <p className="font-bold text-slate-900 dark:text-white">{formatCurrency(tool.totalSpend)}</p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setAttrSelected(new Set(tool.manualProjects ?? []));
                setAttrNotes("");
                setAttrSearch("");
                setAttributeOpen(v => !v);
              }}
              title="Attribute to project"
              className={cn(
                "p-1.5 rounded-lg transition-all",
                tool.hasManualOverride
                  ? "text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20"
                  : "text-slate-300 dark:text-slate-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-500 dark:hover:text-indigo-400 opacity-0 group-hover:opacity-100"
              )}
            >
              <Link2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setEditOpen(true); }}
              title="Edit this tool"
              className="p-1.5 rounded-lg text-slate-300 dark:text-slate-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-500 dark:hover:text-indigo-400 transition-all opacity-0 group-hover:opacity-100"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
              title="Delete this tool"
              className="p-1.5 rounded-lg text-slate-300 dark:text-slate-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-500 dark:hover:text-rose-400 transition-all opacity-0 group-hover:opacity-100"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <div className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </div>
          </div>
        </div>

        {expanded && (
          <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-4 space-y-4 bg-slate-50/50 dark:bg-slate-800/30">
            {tool.notes && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Notes</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">{tool.notes}</p>
              </div>
            )}
            {isLLM && (tool.autoProjects?.length ?? 0) > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Auto-linked Projects</p>
                <div className="flex flex-wrap gap-1.5">
                  {(tool.autoProjects ?? []).map((p) => (
                    <span key={p} title="Linked via OpenRouter key — metered" className="flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium border border-slate-200 dark:border-slate-700 px-2.5 py-0.5 rounded-full cursor-help">
                      <Lock className="w-2.5 h-2.5 text-slate-400" />
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {(tool.manualProjects?.length ?? 0) > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Manually Linked Projects</p>
                <div className="flex flex-wrap gap-1.5">
                  {(tool.manualProjects ?? []).map((p) => (
                    <span
                      key={p}
                      title={tool.type === "service" ? "Display link only — cost not attributed to this project" : undefined}
                      className={cn(
                        "text-xs font-medium border px-2.5 py-0.5 rounded-full",
                        tool.type === "service"
                          ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 cursor-help"
                          : "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800"
                      )}
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {hasTrend && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Monthly Spend</p>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={tool.monthlyTrend}>
                    <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} tickFormatter={(v) => `$${v}`} width={36} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Line type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Inline attribution editor */}
        {attributeOpen && (() => {
          const filtered = allProjectNames.filter(p =>
            p.toLowerCase().includes(attrSearch.toLowerCase())
          );
          return (
            <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-4 space-y-3 bg-indigo-50/30 dark:bg-indigo-950/10">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Attribute to projects</p>

              {/* Auto-linked (read-only) */}
              {(tool.autoProjects?.length ?? 0) > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Auto-linked via OpenRouter key</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(tool.autoProjects ?? []).map((p) => (
                      <span key={p} className="flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                        <Lock className="w-2.5 h-2.5" />
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Project multi-select */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  {(tool.autoProjects?.length ?? 0) > 0 ? "Add more projects" : "Link to projects"}
                </p>
                <input
                  type="text"
                  value={attrSearch}
                  onChange={e => setAttrSearch(e.target.value)}
                  placeholder="Search projects…"
                  className="w-full text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white mb-2 outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
                />
                <div className="max-h-36 overflow-y-auto space-y-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1">
                  {filtered.map(p => (
                    <label key={p} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={attrSelected.has(p)}
                        onChange={e => {
                          setAttrSelected(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(p); else next.delete(p);
                            return next;
                          });
                        }}
                        className="accent-indigo-600"
                      />
                      <span className="text-xs text-slate-700 dark:text-slate-300">{p}</span>
                    </label>
                  ))}
                  {filtered.length === 0 && (
                    <p className="text-xs text-slate-400 px-2 py-1.5">No projects found</p>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Notes (optional)</label>
                <input
                  type="text"
                  value={attrNotes}
                  onChange={e => setAttrNotes(e.target.value)}
                  placeholder="e.g. confirmed by Adarsh"
                  className="w-full text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
                />
              </div>

              {tool.type === "service" && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                  Display link only — cost stays in Shared Infrastructure, not attributed to these projects.
                </p>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setAttributeOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAttribution}
                  disabled={savingAttribution}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-60 flex items-center gap-1.5"
                >
                  {savingAttribution && <Loader2 className="w-3 h-3 animate-spin" />}
                  Save
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </>
  );
}
