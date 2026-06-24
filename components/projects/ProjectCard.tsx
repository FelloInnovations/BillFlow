"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as RTooltip from "@radix-ui/react-tooltip";
import { Project } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { Brain, User, ChevronDown } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  let cls = "bg-[var(--bg-secondary)] text-[var(--text-tertiary)]";
  if (s.includes("shut") || s.includes("cancelled") || s.includes("dead")) {
    cls = "bg-[var(--bg-error-primary)] text-[var(--text-error-primary)]";
  } else if (s.includes("live") || s.includes("active") || s.includes("production")) {
    cls = "bg-[var(--bg-success-primary)] text-[var(--text-success-primary)]";
  } else if (s.includes("progress") || s.includes("dev") || s.includes("build")) {
    cls = "bg-[var(--bg-warning-primary)] text-[var(--text-warning-primary)]";
  } else if (s.includes("pause") || s.includes("hold") || s.includes("stop")) {
    cls = "bg-[var(--bg-warning-primary)] text-[var(--text-warning-primary)]";
  } else if (s.includes("plan") || s.includes("backlog") || s.includes("queue")) {
    cls = "bg-[var(--bg-brand-primary)] text-[var(--text-brand-primary)]";
  }
  return (
    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {status}
    </span>
  );
}

const TOOLTIP_CONTENT_CLS =
  "z-50 max-w-[260px] rounded-lg bg-[var(--bg-primary-solid)] border border-[var(--border-brand-solid)] px-3 py-2 text-xs text-white shadow-xl leading-snug";

function SpendDisplay({ project, pctOfTotal }: { project: Project; pctOfTotal?: number }) {
  const expense = project.expenseBreakdown;
  const or = expense?.breakdown.openrouter;
  const attributionNote = or?.attributionNote ?? "none";

  if (attributionNote === "none") {
    return (
      <div className="text-right shrink-0">
        <RTooltip.Root delayDuration={150}>
          <RTooltip.Trigger asChild>
            <p className="text-xs text-[var(--text-quaternary)] italic cursor-help">No spend data</p>
          </RTooltip.Trigger>
          <RTooltip.Portal>
            <RTooltip.Content className={TOOLTIP_CONTENT_CLS} sideOffset={6} side="left">
              No OpenRouter API key configured for this project.
              <RTooltip.Arrow className="fill-[var(--bg-primary-solid)]" />
            </RTooltip.Content>
          </RTooltip.Portal>
        </RTooltip.Root>
      </div>
    );
  }

  if (!expense || project.totalSpend == null || project.totalSpend === 0) {
    return (
      <div className="text-right shrink-0">
        <p className="font-semibold text-[var(--text-primary)] text-sm">$0.00</p>
        <p className="text-[10px] text-[var(--text-quaternary)] mt-0.5">
          OpenRouter{or?.keyName ? ` · ${or.keyName}` : ""} $0.00
        </p>
      </div>
    );
  }

  const { keyName, keyTotalSpend, isShared, sharedWith } = or!;
  const invoiceValue = expense.breakdown.allocated_invoices.value;
  const invoiceCount = expense.breakdown.allocated_invoices.count;

  const invoiceTooltip = invoiceCount > 0
    ? `${invoiceCount} invoice${invoiceCount !== 1 ? "s" : ""} manually allocated to this project. View in Financial Records.`
    : null;

  return (
    <div className="text-right shrink-0">
      <div className="flex items-center justify-end gap-1.5">
        <p className="font-semibold text-[var(--text-primary)] text-sm">{formatCurrency(project.totalSpend)}</p>
        {isShared && (
          <RTooltip.Root delayDuration={150}>
            <RTooltip.Trigger asChild>
              <span className="cursor-help text-[9px] font-semibold bg-[var(--bg-warning-primary)] text-[var(--text-warning-primary)] px-1.5 py-0.5 rounded-full border border-[var(--border-warning)] whitespace-nowrap">
                shared
              </span>
            </RTooltip.Trigger>
            <RTooltip.Portal>
              <RTooltip.Content className={TOOLTIP_CONTENT_CLS} sideOffset={6} side="left">
                Key &ldquo;{keyName}&rdquo; is shared — showing full key total {formatCurrency(keyTotalSpend)}.
                {sharedWith.length > 0 && ` Also used by: ${sharedWith.join(", ")}.`}
                <RTooltip.Arrow className="fill-[var(--bg-primary-solid)]" />
              </RTooltip.Content>
            </RTooltip.Portal>
          </RTooltip.Root>
        )}
        {pctOfTotal != null && (
          <span className="text-[9px] font-semibold text-[var(--text-quaternary)] bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded-full whitespace-nowrap">
            {pctOfTotal.toFixed(1)}%
          </span>
        )}
      </div>

      {(keyTotalSpend > 0 || invoiceValue > 0) && (
        <p className="text-[10px] text-[var(--text-quaternary)] mt-0.5 flex items-center justify-end gap-1 flex-wrap">
          {keyTotalSpend > 0 && (
            <RTooltip.Root delayDuration={150}>
              <RTooltip.Trigger asChild>
                <span className="cursor-help whitespace-nowrap">
                  OpenRouter{keyName ? ` · ${keyName}` : ""} {formatCurrency(keyTotalSpend)}
                </span>
              </RTooltip.Trigger>
              <RTooltip.Portal>
                <RTooltip.Content className={TOOLTIP_CONTENT_CLS} sideOffset={6} side="left">
                  {isShared
                    ? `Full spend on shared key "${keyName}" — shown identically on all ${sharedWith.length + 1} projects using this key.`
                    : `OpenRouter API usage on a dedicated key for this project.`}
                  <RTooltip.Arrow className="fill-[var(--bg-primary-solid)]" />
                </RTooltip.Content>
              </RTooltip.Portal>
            </RTooltip.Root>
          )}
          {keyTotalSpend > 0 && invoiceValue > 0 && <span className="text-[var(--text-quaternary)]">·</span>}
          {invoiceValue > 0 && (
            <RTooltip.Root delayDuration={150}>
              <RTooltip.Trigger asChild>
                <span className="cursor-help text-[var(--text-brand-primary)] whitespace-nowrap">
                  Invoices {formatCurrency(invoiceValue)}
                </span>
              </RTooltip.Trigger>
              {invoiceTooltip && (
                <RTooltip.Portal>
                  <RTooltip.Content className={TOOLTIP_CONTENT_CLS} sideOffset={6} side="left">
                    {invoiceTooltip}
                    <RTooltip.Arrow className="fill-[var(--bg-primary-solid)]" />
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

  const isSharedKey = project.expenseBreakdown?.breakdown.openrouter.isShared ?? false;
  const barColor = isSharedKey ? "from-amber-400 to-orange-400" : "from-[var(--bg-brand-solid)] to-[var(--bg-brand-solid\_hover)]";

  return (
    <div
      ref={cardRef}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        transition: `opacity 0.4s ease ${index * 60}ms, transform 0.4s ease ${index * 60}ms`,
      }}
      className="rounded-lg bg-[var(--bg-primary)] border border-[var(--border-tertiary)] shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-[var(--text-primary)] text-sm leading-snug">{project.name}</h3>
              {project.status && <StatusBadge status={project.status} />}
            </div>
            {project.description && (
              <div className="relative group mt-1.5">
                <p className="text-xs text-[var(--text-quaternary)] leading-relaxed line-clamp-2 cursor-default">
                  {project.description}
                </p>
                <div className="pointer-events-none absolute left-0 top-full z-50 mt-1.5 hidden group-hover:block w-72 rounded-lg bg-[var(--bg-primary-solid)] border border-[var(--border-brand-solid)] px-3 py-2.5 shadow-xl">
                  <p className="text-xs text-white leading-relaxed whitespace-normal">
                    {project.description}
                  </p>
                </div>
              </div>
            )}
          </div>
          <SpendDisplay project={project} pctOfTotal={pctOfTotal} />
        </div>

        {project.llms.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Brain className="w-3 h-3 text-[var(--text-brand-primary)]" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-quaternary)]">LLMs</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {project.llms.map((llm, i) => (
                <span key={i} className="text-xs bg-[var(--bg-brand-primary)] text-[var(--text-brand-primary)] font-medium border border-[var(--border-brand)] px-2.5 py-0.5 rounded-full">
                  {llm.provider}{llm.model ? ` · ${llm.model}` : ""}
                </span>
              ))}
            </div>
          </div>
        )}

        {llmAccounts && (
          <div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-[10px] text-[var(--text-quaternary)] hover:text-[var(--text-secondary)] transition-colors"
            >
              <ChevronDown
                className="w-3 h-3 transition-transform duration-200"
                style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
              />
              {expanded ? "Hide details" : "Show account details"}
            </button>

            {expanded && (
              <div className="mt-2 flex items-center gap-2 p-2.5 rounded-lg bg-[var(--bg-secondary)]">
                <User className="w-3.5 h-3.5 text-[var(--text-brand-primary)] shrink-0" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-quaternary)]">Account</p>
                  <p className="text-xs font-semibold text-[var(--text-primary)] mt-0.5">{llmAccounts}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {arthurLastSynced !== undefined && (
        <div className="flex items-center justify-between pt-1 px-5 pb-3">
          <Link
            href="/projects/arthur/metrics"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-brand-primary)] hover:opacity-80 transition-opacity"
          >
            View Metrics →
          </Link>
          {arthurLastSynced && (
            <p className="text-[10px] text-[var(--text-quaternary)]">
              Outcomes synced {timeAgo(arthurLastSynced)}
            </p>
          )}
        </div>
      )}

      {spendPct > 0 && (
        <div className="h-1 bg-[var(--bg-secondary)] overflow-hidden rounded-b-lg">
          <div
            className={`h-full bg-gradient-to-r ${barColor}`}
            style={{ width: `${barWidth}%`, transition: "width 0.8s cubic-bezier(0.22,1,0.36,1)" }}
          />
        </div>
      )}
    </div>
  );
}
