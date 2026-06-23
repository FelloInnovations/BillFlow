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
      <div className="relative z-10 w-full max-w-sm rounded-lg bg-[var(--bg-primary)] border border-[var(--border-tertiary)] shadow-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-[var(--text-primary)] text-sm">Delete this tool?</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              <span className="font-medium text-[var(--text-secondary)]">{label}</span> will be permanently removed from all views.
            </p>
          </div>
          <button onClick={onCancel} className="shrink-0 p-1 rounded-lg hover:bg-[var(--bg-primary\_hover)]">
            <X className="w-4 h-4 text-[var(--text-quaternary)]" />
          </button>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-tertiary)] text-[var(--text-tertiary)] hover:bg-[var(--bg-primary\_hover)] transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--bg-error-solid)] hover:bg-[var(--bg-error-solid\_hover)] text-white transition-colors">
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
      <div className="relative z-10 w-full max-w-md rounded-lg bg-[var(--bg-primary)] border border-[var(--border-tertiary)] shadow-2xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-[var(--text-primary)] text-sm">Edit tool</p>
            <p className="text-xs text-[var(--text-quaternary)] mt-0.5 font-mono">{tool.name}</p>
          </div>
          <button onClick={onCancel} className="shrink-0 p-1 rounded-lg hover:bg-[var(--bg-primary\_hover)]">
            <X className="w-4 h-4 text-[var(--text-quaternary)]" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-quaternary)] mb-1.5">Display Name</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full text-sm rounded-lg border border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)] px-3 py-2 outline-none focus:ring-2 focus:border-[var(--border-brand-solid)]"
              style={{ "--tw-ring-color": "var(--ring-brand-primary)" } as React.CSSProperties}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-quaternary)] mb-1.5">Type</label>
            <div className="flex gap-2">
              {(["llm", "service"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={cn(
                    "flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors",
                    type === t
                      ? "bg-[var(--bg-brand-solid)] border-[var(--border-brand-solid)] text-white"
                      : "border-[var(--border-tertiary)] text-[var(--text-tertiary)] hover:border-[var(--border-brand-solid)] hover:text-[var(--text-brand-primary)]"
                  )}
                >
                  {t === "llm" ? "LLM" : "Service"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-quaternary)] mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Internal notes about this tool…"
              className="w-full text-sm rounded-lg border border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)] px-3 py-2 outline-none focus:ring-2 focus:border-[var(--border-brand-solid)] resize-none"
              style={{ "--tw-ring-color": "var(--ring-brand-primary)" } as React.CSSProperties}
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-tertiary)] text-[var(--text-tertiary)] hover:bg-[var(--bg-primary\_hover)] transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[var(--bg-brand-solid)] hover:bg-[var(--bg-brand-solid\_hover)] text-white transition-colors disabled:opacity-60 flex items-center gap-1.5"
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

      <div className={cn("group rounded-lg bg-[var(--bg-primary)] border border-[var(--border-tertiary)] shadow-sm overflow-hidden hover:shadow-md transition-shadow", borderAccent)}>
        <div
          className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-[var(--bg-primary\_hover)] transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="shrink-0 p-2.5 rounded-lg bg-[var(--bg-secondary)]">
              {isLLM ? (
                <Brain className="w-4 h-4 text-[var(--text-tertiary)]" />
              ) : (
                <Wrench className="w-4 h-4 text-[var(--text-tertiary)]" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-[var(--text-primary)] text-sm truncate">{tool.displayLabel}</p>
                {isPerKey && tool.rawKey && (
                  <span title={`OpenRouter key: ${tool.rawKey}`} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-quaternary)] cursor-help">
                    {tool.rawKey}
                  </span>
                )}
                {isBilledInactive && (
                  <span title="Being billed but not used in any currently active project" className="flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--bg-warning-primary)] text-[var(--text-warning-primary)] cursor-help">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    No active project
                  </span>
                )}
                {isNeverUsed && (
                  <span title="This tool has never appeared in any project past or present" className="flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--bg-error-primary)] text-[var(--text-error-primary)] cursor-help">
                    <Ban className="w-2.5 h-2.5" />
                    Never used
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-quaternary)] mt-0.5">
                <span className="font-semibold text-[var(--text-tertiary)]">{isLLM ? "LLM" : "Service"}</span>
                {isPerKey ? " · API usage" : tool.name === "OpenRouter" ? " · wallet top-ups" : " · invoices"}
                {isLLM && " · "}
                {isLLM && (tool.projects.length > 0
                  ? `${tool.projects.length} project${tool.projects.length > 1 ? "s" : ""}`
                  : "No projects linked")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex flex-col items-end">
              <p className="font-semibold text-[var(--text-primary)]">{formatCurrency(tool.totalSpend)}</p>
              {!isPerKey && tool.name === "OpenRouter" && (
                <p className="text-[10px] text-[var(--text-quaternary)] font-normal mt-0.5 text-right leading-snug">
                  Credit deposited into OR wallet.<br />See per-key rows below for actual usage.
                </p>
              )}
            </div>
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
                  ? "text-[var(--text-brand-primary)] bg-[var(--bg-brand-primary)]"
                  : "text-[var(--text-disabled)] hover:bg-[var(--bg-brand-primary)] hover:text-[var(--text-brand-primary)] opacity-0 group-hover:opacity-100"
              )}
            >
              <Link2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setEditOpen(true); }}
              title="Edit this tool"
              className="p-1.5 rounded-lg text-[var(--text-disabled)] hover:bg-[var(--bg-brand-primary)] hover:text-[var(--text-brand-primary)] transition-all opacity-0 group-hover:opacity-100"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
              title="Delete this tool"
              className="p-1.5 rounded-lg text-[var(--text-disabled)] hover:bg-[var(--bg-error-primary)] hover:text-[var(--text-error-primary)] transition-all opacity-0 group-hover:opacity-100"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <div className="p-1 rounded-lg hover:bg-[var(--bg-primary\_hover)] transition-colors">
              {expanded ? <ChevronUp className="w-4 h-4 text-[var(--text-quaternary)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-quaternary)]" />}
            </div>
          </div>
        </div>

        {expanded && (
          <div className="border-t border-[var(--border-tertiary)] px-5 py-4 space-y-4 bg-[var(--bg-secondary\_subtle)]">
            {tool.notes && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-quaternary)] mb-1">Notes</p>
                <p className="text-xs text-[var(--text-tertiary)]">{tool.notes}</p>
              </div>
            )}
            {isLLM && (tool.autoProjects?.length ?? 0) > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-quaternary)] mb-2">Auto-linked Projects</p>
                <div className="flex flex-wrap gap-1.5">
                  {(tool.autoProjects ?? []).map((p) => (
                    <span key={p} title="Linked via OpenRouter key — metered" className="flex items-center gap-1 text-xs bg-[var(--bg-secondary)] text-[var(--text-tertiary)] font-medium border border-[var(--border-tertiary)] px-2.5 py-0.5 rounded-full cursor-help">
                      <Lock className="w-2.5 h-2.5 text-[var(--text-quaternary)]" />
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {(tool.manualProjects?.length ?? 0) > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-quaternary)] mb-2">Manually Linked Projects</p>
                <div className="flex flex-wrap gap-1.5">
                  {(tool.manualProjects ?? []).map((p) => (
                    <span
                      key={p}
                      title={tool.type === "service" ? "Display link only — cost not attributed to this project" : undefined}
                      className={cn(
                        "text-xs font-medium border px-2.5 py-0.5 rounded-full",
                        tool.type === "service"
                          ? "bg-[var(--bg-warning-primary)] text-[var(--text-warning-primary)] border-[var(--border-warning\_subtle)] cursor-help"
                          : "bg-[var(--bg-brand-primary)] text-[var(--text-brand-primary)] border-[var(--border-brand)]"
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
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-quaternary)] mb-2">Monthly Spend</p>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={tool.monthlyTrend}>
                    <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} tickFormatter={(v) => `$${v}`} width={36} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Line type="monotone" dataKey="total" stroke="#ff725c" strokeWidth={2} dot={false} />
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
            <div className="border-t border-[var(--border-tertiary)] px-5 py-4 space-y-3 bg-[var(--bg-brand-primary)]">
              <p className="text-xs font-semibold text-[var(--text-secondary)]">Attribute to projects</p>

              {/* Auto-linked (read-only) */}
              {(tool.autoProjects?.length ?? 0) > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-quaternary)] mb-1.5">Auto-linked via OpenRouter key</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(tool.autoProjects ?? []).map((p) => (
                      <span key={p} className="flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-[var(--bg-secondary)] text-[var(--text-tertiary)] border border-[var(--border-tertiary)]">
                        <Lock className="w-2.5 h-2.5" />
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Project multi-select */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-quaternary)] mb-1.5">
                  {(tool.autoProjects?.length ?? 0) > 0 ? "Add more projects" : "Link to projects"}
                </p>
                <input
                  type="text"
                  value={attrSearch}
                  onChange={e => setAttrSearch(e.target.value)}
                  placeholder="Search projects…"
                  className="w-full text-xs px-3 py-1.5 rounded-lg border border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)] mb-2 outline-none focus:ring-2 focus:border-[var(--border-brand-solid)]"
                  style={{ "--tw-ring-color": "var(--ring-brand-primary)" } as React.CSSProperties}
                />
                <div className="max-h-36 overflow-y-auto space-y-0.5 rounded-lg border border-[var(--border-tertiary)] bg-[var(--bg-primary)] p-1">
                  {filtered.map(p => (
                    <label key={p} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--bg-primary\_hover)] cursor-pointer">
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
                        className="accent-[var(--bg-brand-solid)]"
                      />
                      <span className="text-xs text-[var(--text-secondary)]">{p}</span>
                    </label>
                  ))}
                  {filtered.length === 0 && (
                    <p className="text-xs text-[var(--text-quaternary)] px-2 py-1.5">No projects found</p>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-quaternary)] mb-1">Notes (optional)</label>
                <input
                  type="text"
                  value={attrNotes}
                  onChange={e => setAttrNotes(e.target.value)}
                  placeholder="e.g. confirmed by Adarsh"
                  className="w-full text-xs px-3 py-1.5 rounded-lg border border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)] outline-none focus:ring-2 focus:border-[var(--border-brand-solid)]"
                  style={{ "--tw-ring-color": "var(--ring-brand-primary)" } as React.CSSProperties}
                />
              </div>

              {tool.type === "service" && (
                <p className="text-[10px] text-[var(--text-warning-primary)]">
                  Display link only — cost stays in Shared Infrastructure, not attributed to these projects.
                </p>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setAttributeOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-tertiary)] text-[var(--text-tertiary)] hover:bg-[var(--bg-primary\_hover)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAttribution}
                  disabled={savingAttribution}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[var(--bg-brand-solid)] hover:bg-[var(--bg-brand-solid\_hover)] text-white transition-colors disabled:opacity-60 flex items-center gap-1.5"
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
