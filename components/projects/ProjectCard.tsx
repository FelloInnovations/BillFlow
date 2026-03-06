"use client";

import { useEffect, useRef, useState } from "react";
import { Project } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { Brain, Wrench } from "lucide-react";

interface Props {
  project: Project;
  index: number;
  maxSpend: number;
}

export function ProjectCard({ project, index, maxSpend }: Props) {
  const allVendors = [
    ...new Set([...project.llms.map((l) => l.provider), ...project.services]),
  ];

  const spendPct = project.totalSpend != null && maxSpend > 0
    ? (project.totalSpend / maxSpend) * 100
    : 0;

  // Staggered fade-in
  const [visible, setVisible] = useState(false);
  // Bar fill
  const [barWidth, setBarWidth] = useState(0);
  const barTriggered = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), index * 80);
    return () => clearTimeout(t);
  }, [index]);

  useEffect(() => {
    if (!cardRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !barTriggered.current) {
          barTriggered.current = true;
          // Small delay so the card fade-in plays first
          setTimeout(() => setBarWidth(spendPct), index * 80 + 200);
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [spendPct, index]);

  return (
    <div
      ref={cardRef}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(14px)",
        transition: `opacity 0.4s ease ${index * 80}ms, transform 0.4s ease ${index * 80}ms`,
      }}
      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
    >
      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm leading-snug">{project.name}</h3>
            {project.description && (
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 leading-relaxed line-clamp-2">
                {project.description}
              </p>
            )}
          </div>
          {project.totalSpend !== null && (
            <div className="text-right shrink-0">
              <p className="font-bold text-slate-900 dark:text-white text-sm">{formatCurrency(project.totalSpend)}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">est. spend</p>
            </div>
          )}
        </div>

        {/* LLMs */}
        {project.llms.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Brain className="w-3 h-3 text-slate-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">LLMs</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {project.llms.map((llm, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium border border-slate-200 dark:border-slate-700 px-2.5 py-0.5 rounded-full"
                  title={llm.owner ? `Owner: ${llm.owner}` : undefined}
                >
                  {llm.provider}
                  {llm.model && llm.model !== "TBD" && (
                    <span className="text-slate-400 dark:text-slate-500 font-normal">· {llm.model}</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Services */}
        {project.services.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Wrench className="w-3 h-3 text-slate-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Services</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {project.services.map((s) => (
                <span
                  key={s}
                  className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium border border-slate-200 dark:border-slate-700 px-2.5 py-0.5 rounded-full"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {allVendors.length === 0 && (
          <p className="text-xs text-slate-400 italic">Tools not yet assigned</p>
        )}
      </div>

      {/* Spend bar */}
      {project.totalSpend != null && spendPct > 0 && (
        <div className="h-1 bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-indigo-400 to-violet-400 rounded-full"
            style={{
              width: `${barWidth}%`,
              transition: "width 0.8s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        </div>
      )}
    </div>
  );
}
