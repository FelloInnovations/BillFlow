import { ProjectCard } from "@/components/projects/ProjectCard";
import { Project } from "@/types";
import { formatCurrency } from "@/lib/utils";

async function getProjects(): Promise<{ projects: Project[]; spendMap: Record<string, number> }> {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const res = await fetch(`${base}/api/sheets`, { cache: "no-store" });
    if (!res.ok) return { projects: [], spendMap: {} };
    return res.json();
  } catch {
    return { projects: [], spendMap: {} };
  }
}

export default async function ProjectsPage() {
  const { projects } = await getProjects();

  const totalAssigned = projects.reduce((s, p) => s + (p.totalSpend ?? 0), 0);
  const sorted = [...projects].sort((a, b) => (b.totalSpend ?? -1) - (a.totalSpend ?? -1));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Projects</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {projects.length} projects · {formatCurrency(totalAssigned)} est. spend
          </p>
        </div>
      </div>

      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-16">No projects loaded.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((p, i) => (
            <ProjectCard key={p.name} project={p} index={i} maxSpend={sorted[0]?.totalSpend ?? 1} />
          ))}
        </div>
      )}
    </div>
  );
}
