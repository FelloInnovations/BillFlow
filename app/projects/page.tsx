import { ProjectCard } from "@/components/projects/ProjectCard";
import { Project } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { canonicalVendor } from "@/lib/utils";

async function getProjects(): Promise<{ projects: Project[]; maxSpend: number }> {
  const [{ data: portfolioRows, error }, { data: invoiceRows }] = await Promise.all([
    supabase
      .from("agents_portfolio")
      .select("agents_projects, description, llms, llm_accounts, services_used, status")
      .limit(500),
    supabase
      .from("financial_records")
      .select("vendor_name, total_amount")
      .not("vendor_name", "is", null)
      .not("vendor_name", "ilike", "%makemytrip%"),
  ]);

  if (error) console.error("[projects] DB error:", error.message);

  const rawProjects: Project[] = (portfolioRows ?? []).map((row) => ({
    name: row.agents_projects ?? "",
    description: row.description ?? "",
    timeline: null,
    status: row.status ?? null,
    llms: row.llms
      ? row.llms.split(",").map((s: string) => s.trim()).filter(Boolean)
          .map((model: string) => ({ provider: model, model: "", owner: row.llm_accounts ?? "" }))
      : [],
    services: row.services_used
      ? row.services_used.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [],
    totalSpend: null,
  }));

  // Build spend map
  const spendMap = new Map<string, number>();
  for (const r of invoiceRows ?? []) {
    if (!r.vendor_name) continue;
    const canonical = canonicalVendor(r.vendor_name);
    spendMap.set(canonical, (spendMap.get(canonical) ?? 0) + Number(r.total_amount ?? 0));
  }

  const vendorProjectCount = new Map<string, number>();
  for (const p of rawProjects) {
    const vendors = new Set([...p.llms.map((l) => l.provider), ...p.services]);
    for (const v of vendors) {
      if (spendMap.has(v)) vendorProjectCount.set(v, (vendorProjectCount.get(v) ?? 0) + 1);
    }
  }

  const projects = rawProjects.map((p) => {
    const vendors = new Set([...p.llms.map((l) => l.provider), ...p.services]);
    let total = 0;
    let hasSpend = false;
    for (const v of vendors) {
      const spend = spendMap.get(v);
      if (spend !== undefined) {
        total += spend / (vendorProjectCount.get(v) ?? 1);
        hasSpend = true;
      }
    }
    return { ...p, totalSpend: hasSpend ? total : null };
  });

  const maxSpend = Math.max(0, ...projects.map((p) => p.totalSpend ?? 0));
  return { projects, maxSpend };
}

export default async function ProjectsPage() {
  const { projects, maxSpend } = await getProjects();
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
        <p className="text-sm text-slate-400 text-center py-16">No projects found. Check Supabase RLS on agents_portfolio table.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((p, i) => (
            <ProjectCard key={`${p.name}-${i}`} project={p} index={i} maxSpend={maxSpend} />
          ))}
        </div>
      )}
    </div>
  );
}
