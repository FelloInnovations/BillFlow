"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as RTooltip from "@radix-ui/react-tooltip";
import { Project } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { Brain, User, ChevronDown } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  let cls = "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400";
  if (s.includes("shut") || s.includes("cancelled") || s.includes("dead")) {
    cls = "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400";
  } else if (s.includes("live") || s.includes("active") || s.includes("production")) {
    cls = "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400";
  } else if (s.includes("progress") || s.includes("dev") || s.includes("build")) {
    cls = "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400";
  } else if (s.includes("pause") || s.includes("hold") || s.includes("stop")) {
    cls = "bg-orange-100 text-orange-500 dark:bg-orange-900/40 dark:text-orange-400";
  } else if (s.includes("plan") || s.includes("backlog") || s.includes("queue")) {
    cls = "bg-blue-100 text-blue-500 dark:bg-blue-900/40 dark:text-blue-400";
  }
  return (
    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {status}
    </span>
  );
}

const TOOLTIP_CONTENT_CLS =
  "z-50 max-w-[260px] rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-slate-200 shadow-xl leading-snug";

function SpendDisplay({ project, pctOfTotal }: { project: Project; pctOfTotal?: number }) {
  const expense = project.expenseBreakdown;
  const { totalSpend } = project;
  const method = expense?.breakdown.openrouter.allocationMethod ?? "none";

  // No linked OR key → "No spend data" with explanation tooltip
  if (method === "none") {
    return (
      <div className="text-right shrink-0">
        <RTooltip.Root delayDuration={150}>
          <RTooltip.Trigger asChild>
            <p className="text-xs text-slate-400 dark:text-slate-500 italic cursor-help">No spend data</p>
          </RTooltip.Trigger>
          <RTooltip.Portal>
            <RTooltip.Content className={TOOLTIP_CONTENT_CLS} sideOffset={6} side="left">
              No OpenRouter API key linked to this project. Spend cannot be tracked here.
              <RTooltip.Arrow className="fill-slate-700" />
            </RTooltip.Content>
          </RTooltip.Portal>
        </RTooltip.Root>
      </div>
    );
  }

  // Has a linked key but zero recorded spend
  if (!expense || totalSpend == null || totalSpend === 0) {
    return (
      <div className="text-right shrink-0">
        <p className="font-bold text-slate-900 dark:text-white text-sm">$0.00</p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">OpenRouter $0.00</p>
      </div>
    );
  }

  const orValue = expense.breakdown.openrouter.value;
  const invoiceValue = expense.breakdown.allocated_invoices.value;
  const invoiceCount = expense.breakdown.allocated_invoices.count;
  const { allocationMethod, sharedKeyName, sharePercent } = expense.breakdown.openrouter;

  const orTooltip = (() => {
    if (allocationMethod === "dedicated") return "OpenRouter API usage on a dedicated key for this project.";
    if (allocationMethod === "volume_split")
      return `OpenRouter API usage — ${sharePercent?.toFixed(1)}% share of shared key ${sharedKeyName}, split by invocation volume.`;
    if (allocationMethod === "equal_split_fallback")
      return `OpenRouter API usage — equal split of shared key ${sharedKeyName} (no per-project volume data).`;
    return null;
  })();

  const invoiceTooltip = invoiceCount > 0
    ? `${invoiceCount} invoice${invoiceCount !== 1 ? "s" : ""} manually allocated to this project. View in Financial Records.`
    : null;

  return (
    <div className="text-right shrink-0">
      <div className="flex items-center justify-end gap-1.5">
        <p className="font-bold text-slate-900 dark:text-white text-sm">{formatCurrency(totalSpend)}</p>
        {pctOfTotal != null && (
          <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full whitespace-nowrap">
            {pctOfTotal.toFixed(1)}%
          </span>
        )}
      </div>

      {(orValue > 0 || invoiceValue > 0) && (
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 flex items-center justify-end gap-1 flex-wrap">
          {orValue > 0 && (
            <RTooltip.Root delayDuration={150}>
              <RTooltip.Trigger asChild>
                <span className="cursor-help whitespace-nowrap">OpenRouter {formatCurrency(orValue)}</span>
              </RTooltip.Trigger>
              {orTooltip && (
                <RTooltip.Portal>
                  <RTooltip.Content className={TOOLTIP_CONTENT_CLS} sideOffset={6} side="left">
                    {orTooltip}
                    <RTooltip.Arrow className="fill-slate-700" />
                  </RTooltip.Content>
                </RTooltip.Portal>
              )}
            </RTooltip.Root>
          )}
          {orValue > 0 && invoiceValue > 0 && <span className="text-slate-300 dark:text-slate-600">·</span>}
          {invoiceValue > 0 && (
            <RTooltip.Root delayDuration={150}>
              <RTooltip.Trigger asChild>
                <span className="cursor-help text-indigo-500 dark:text-indigo-400 whitespace-nowrap">
                  Invoices {formatCurrency(invoiceValue)}
                </span>
              </RTooltip.Trigger>
              {invoiceTooltip && (
                <RTooltip.Portal>
                  <RTooltip.Content className={TOOLTIP_CONTENT_CLS} sideOffset={6} side="left">
                    {invoiceTooltip}
                    <RTooltip.Arrow className="fill-slate-700" />
                  </RTooltip.Content>
                </RTooltip.Portal>
              )}
            </RTooltip.Root>
          )}
        </p>
      )}
    </div>
  );
}

interface Props {
  project: Project;
  index: number;
  maxSpend: number;
  arthurLastSynced?: string | null;
  pctOfTotal?: number;
}

function timeAgo(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 60_000);
  if (diff < 1)  return "just now";
  if (diff < 60) return `${diff} min ago`;
  const h = Math.floor(diff / 60);
  if (h < 24)    return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function ProjectCard({ project, index, maxSpend, arthurLastSynced, pctOfTotal }: Props) {
  const spendPct = project.totalSpend != null && maxSpend > 0
    ? (project.totalSpend / maxSpend) * 100 : 0;

  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [barWidth, setBarWidth] = useState(0);
  const barTriggered = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), index * 60);
    return () => clearTimeout(t);
  }, [index]);

  useEffect(() => {
    if (!cardRef.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !barTriggered.current) {
        barTriggered.current = true;
        setTimeout(() => setBarWidth(spendPct), index * 60 + 200);
      }
    }, { threshold: 0.2 });
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [spendPct, index]);

  const llmAccounts = project.llms[0]?.owner || null;

  const method = project.expenseBreakdown?.breakdown.openrouter.allocationMethod ?? "none";
  const barColor =
    method === "volume_split"        ? "from-amber-400 to-orange-400" :
    method === "equal_split_fallback" ? "from-orange-400 to-rose-400"  :
    "from-indigo-400 to-violet-400";

  return (
    <div
      ref={cardRef}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        transition: `opacity 0.4s ease ${index * 60}ms, transform 0.4s ease ${index * 60}ms`,
      }}
      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.09),0_2px_6px_rgba(0,0,0,0.05)] transition-shadow"
    >
      <div className="p-5 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm leading-snug">{project.name}</h3>
              {project.status && <StatusBadge status={project.status} />}
            </div>
            {project.description && (
              <div className="relative group mt-1.5">
                <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed line-clamp-2 cursor-default">
                  {project.description}
                </p>
                <div className="pointer-events-none absolute left-0 top-full z-50 mt-1.5 hidden group-hover:block w-72 rounded-xl bg-slate-900 dark:bg-slate-700 border border-slate-700 dark:border-slate-600 px-3 py-2.5 shadow-xl">
                  <p className="text-xs text-slate-200 leading-relaxed whitespace-normal">
                    {project.description}
                  </p>
                </div>
              </div>
            )}
          </div>
          <SpendDisplay project={project} pctOfTotal={pctOfTotal} />
        </div>

        {/* LLMs */}
        {project.llms.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Brain className="w-3 h-3 text-indigo-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">LLMs</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {project.llms.map((llm, i) => (
                <span key={i} className="text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 font-medium border border-indigo-100 dark:border-indigo-800 px-2.5 py-0.5 rounded-full">
                  {llm.provider}{llm.model ? ` · ${llm.model}` : ""}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Expandable account row */}
        {llmAccounts && (
          <div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <ChevronDown
                className="w-3 h-3 transition-transform duration-200"
                style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
              />
              {expanded ? "Hide details" : "Show account details"}
            </button>

            {expanded && (
              <div className="mt-2 flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <User className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Account</p>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mt-0.5">{llmAccounts}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Arthur outcomes link */}
      {arthurLastSynced !== undefined && (
        <div className="flex items-center justify-between pt-1 px-5 pb-3">
          <Link
            href="/projects/arthur/outcomes"
            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
          >
            Outcomes →
          </Link>
          {arthurLastSynced && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              Outcomes synced {timeAgo(arthurLastSynced)}
            </p>
          )}
        </div>
      )}

      {/* Spend bar */}
      {spendPct > 0 && (
        <div className="h-1 bg-slate-100 dark:bg-slate-800 overflow-hidden rounded-b-2xl">
          <div
            className={`h-full bg-gradient-to-r ${barColor}`}
            style={{ width: `${barWidth}%`, transition: "width 0.8s cubic-bezier(0.22,1,0.36,1)" }}
          />
        </div>
      )}
    </div>
  );
}
