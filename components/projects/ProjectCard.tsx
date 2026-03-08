"use client";

import { useEffect, useRef, useState } from "react";
import { Project } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { Brain, Wrench, User, RotateCcw } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  let cls = "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400";
  if (s.includes("shutdown") || s.includes("cancelled") || s.includes("dead")) {
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
  const [flipped, setFlipped] = useState(false);
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

  const llmOwner = project.llms[0]?.owner || null;

  return (
    <div
      ref={cardRef}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        transition: `opacity 0.4s ease ${index * 60}ms, transform 0.4s ease ${index * 60}ms`,
        perspective: "1000px",
      }}
      className="h-56"
    >
      {/* Flip container */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
          transition: "transform 0.55s cubic-bezier(0.4, 0.2, 0.2, 1)",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* FRONT */}
        <div
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
          className="absolute inset-0 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.10),0_2px_6px_rgba(0,0,0,0.06)] transition-shadow overflow-hidden cursor-pointer"
          onClick={() => setFlipped(true)}
        >
          <div className="p-5 space-y-3 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
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
                      {llm.provider}
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

            {/* Flip hint */}
            <div className="mt-auto pt-1 flex justify-end">
              <span className="text-[10px] text-slate-300 dark:text-slate-600">tap for details →</span>
            </div>
          </div>

          {/* Spend bar */}
          {spendPct > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full bg-gradient-to-r from-indigo-400 to-violet-400"
                style={{ width: `${barWidth}%`, transition: "width 0.8s cubic-bezier(0.22,1,0.36,1)" }}
              />
            </div>
          )}
        </div>

        {/* BACK */}
        <div
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
          className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-slate-800 dark:to-slate-900 border border-indigo-100 dark:border-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden cursor-pointer"
          onClick={() => setFlipped(false)}
        >
          <div className="p-5 h-full flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">{project.name}</h3>
              <button onClick={(e) => { e.stopPropagation(); setFlipped(false); }} className="p-1 rounded-lg hover:bg-white/60 dark:hover:bg-slate-700 transition-colors">
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 flex-1">
              {llmOwner && (
                <div className="bg-white/70 dark:bg-slate-800/70 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <User className="w-3 h-3 text-indigo-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Account</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{llmOwner}</p>
                </div>
              )}

              {project.totalSpend !== null && (
                <div className="bg-white/70 dark:bg-slate-800/70 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Est. Spend</span>
                  </div>
                  <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{formatCurrency(project.totalSpend)}</p>
                </div>
              )}

              {project.llms.length > 0 && (
                <div className="bg-white/70 dark:bg-slate-800/70 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Brain className="w-3 h-3 text-indigo-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">LLMs</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {project.llms.map((l, i) => (
                      <span key={i} className="text-[10px] bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 px-1.5 py-0.5 rounded-full font-medium">{l.provider}</span>
                    ))}
                  </div>
                </div>
              )}

              {project.services.length > 0 && (
                <div className="bg-white/70 dark:bg-slate-800/70 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Wrench className="w-3 h-3 text-violet-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Services</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {project.services.map((s) => (
                      <span key={s} className="text-[10px] bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-300 px-1.5 py-0.5 rounded-full font-medium">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {project.status && (
              <div className="flex justify-center">
                <StatusBadge status={project.status} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
