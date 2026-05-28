"use client";

import { useState } from "react";
import { Tool } from "@/types";
import { formatCurrency, cn } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Brain,
  Wrench,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Ban,
  Trash2,
  X,
} from "lucide-react";

export type FlagType = "paying_not_in_use" | "never_used";

interface Props {
  tool: Tool;
  flagTypes?: FlagType[];
  onHide?: (toolKey: string) => void;
}

function ConfirmDialog({
  label,
  onConfirm,
  onCancel,
}: {
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900 dark:text-white text-sm">Hide this tool?</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">{label}</span> will
              be removed from the Tools list. You can restore it later from the hidden tools link.
            </p>
          </div>
          <button onClick={onCancel} className="shrink-0 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-colors"
          >
            Hide
          </button>
        </div>
      </div>
    </div>
  );
}

export function ToolCard({ tool, flagTypes, onHide }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [confirmHide, setConfirmHide] = useState(false);

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

  async function handleHide() {
    setConfirmHide(false);
    try {
      await fetch("/api/tools/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolKey: tool.name }),
      });
      onHide?.(tool.name);
    } catch {}
  }

  return (
    <>
      {confirmHide && (
        <ConfirmDialog
          label={tool.displayLabel}
          onConfirm={handleHide}
          onCancel={() => setConfirmHide(false)}
        />
      )}

      <div
        className={cn(
          "group rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden hover:shadow-md transition-shadow",
          borderAccent
        )}
      >
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
                <p className="font-bold text-slate-900 dark:text-white text-sm truncate">
                  {tool.displayLabel}
                </p>
                {isPerKey && tool.rawKey && (
                  <span
                    title={`OpenRouter key: ${tool.rawKey}`}
                    className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-help"
                  >
                    {tool.rawKey}
                  </span>
                )}
                {isBilledInactive && (
                  <span
                    title="Being billed but not used in any currently active project"
                    className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 cursor-help"
                  >
                    <AlertTriangle className="w-2.5 h-2.5" />
                    No active project
                  </span>
                )}
                {isNeverUsed && (
                  <span
                    title="This tool has never appeared in any project past or present"
                    className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 cursor-help"
                  >
                    <Ban className="w-2.5 h-2.5" />
                    Never used
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                <span className="font-semibold text-slate-500">
                  {isLLM ? "LLM" : "Service"}
                </span>
                {isPerKey ? " · API usage" : " · invoices"}
                {" · "}
                {tool.projects.length > 0
                  ? `${tool.projects.length} project${tool.projects.length > 1 ? "s" : ""}`
                  : "No projects linked"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <p className="font-bold text-slate-900 dark:text-white">{formatCurrency(tool.totalSpend)}</p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmHide(true);
              }}
              title="Hide this tool"
              className="p-1.5 rounded-lg text-slate-300 dark:text-slate-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-500 dark:hover:text-rose-400 transition-all opacity-0 group-hover:opacity-100"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <div className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              {expanded ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </div>
          </div>
        </div>

        {expanded && (
          <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-4 space-y-4 bg-slate-50/50 dark:bg-slate-800/30">
            {tool.projects.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Linked Projects
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {tool.projects.map((p) => (
                    <span
                      key={p}
                      className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium border border-slate-200 dark:border-slate-700 px-2.5 py-0.5 rounded-full"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {hasTrend && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Monthly Spend
                </p>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={tool.monthlyTrend}>
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 9, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "#94a3b8" }}
                      tickFormatter={(v) => `$${v}`}
                      width={36}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
