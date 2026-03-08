"use client";

import { useEffect, useRef, useState } from "react";
import { Project } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { Brain, Wrench, User, ChevronDown } from "lucide-react";

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

interface Props {
  project: Project;
  index: number;
  maxSpend: number;
}

export function ProjectCard({ project, index, maxSpend }: Props) {
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

  return (
    <div
      ref={cardRef}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        transition: `opacity 0.4s ease ${index * 60}ms, transform 0.4s ease ${index * 60}ms`,
      }}
      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.09),0_2px_6px_rgba(0,0,0,0.05)] transition-shadow overflow-hidden"
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
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 leading-relaxed line-clamp-2">
                {project.description}
              </p>
            )}
          </div>
          {project.totalSpend !== null && (
            <div className="text-right shrink-0">
              <p className="font-bold text-slate-900 dark:text-white text-sm">{formatCurrency(project.totalSpend)}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">est. spend</p>
            </div>
          )}
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

        {/* Services */}
        {project.services.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Wrench className="w-3 h-3 text-violet-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Services</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {project.services.map((s) => (
                <span key={s} className="text-xs bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-300 font-medium border border-violet-100 dark:border-violet-800 px-2.5 py-0.5 rounded-full">
                  {s}
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

      {/* Spend bar */}
      {spendPct > 0 && (
        <div className="h-1 bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-indigo-400 to-violet-400"
            style={{ width: `${barWidth}%`, transition: "width 0.8s cubic-bezier(0.22,1,0.36,1)" }}
          />
        </div>
      )}
    </div>
  );
}
