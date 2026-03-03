import { Project } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { Brain, Wrench } from "lucide-react";

interface Props {
  project: Project;
}

export function ProjectCard({ project }: Props) {
  const allVendors = [
    ...new Set([...project.llms.map((l) => l.provider), ...project.services]),
  ];

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-5 space-y-4 hover:shadow-md transition-shadow">
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
  );
}
