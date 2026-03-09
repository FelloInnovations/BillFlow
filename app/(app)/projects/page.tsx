export const dynamic = "force-dynamic";

import { ProjectsClient } from "@/components/projects/ProjectsClient";
import { Project } from "@/types";
import { supabase } from "@/lib/supabase";
import { canonicalVendor } from "@/lib/utils";

async function getProjects(): Promise<{ projects: Project[]; maxSpend: number }> {
  // Try with status column first, fall back without it if column doesn't exist yet
  let portfolioRows: Record<string, string | null>[] | null = null;
  let withStatus = true;

  const { data: d1, error: e1 } = await supabase
    .from("agents_portfolio")
    .select("agents_projects, description, llms, llm_accounts, services_used, status")
    .limit(500);

  if (e1) {
    console.error("[projects] with-status error:", e1.message);
    const { data: d2, error: e2 } = await supabase
      .from("agents_portfolio")
      .select("agents_projects, description, llms, llm_accounts, services_used")
      .limit(500);
    if (e2) console.error("[projects] fallback error:", e2.message);
    portfolioRows = d2;
    withStatus = false;
  } else {
    portfolioRows = d1;
  }

  const { data: invoiceRows } = await supabase
    .from("financial_records")
    .select("vendor_name, total_amount")
    .not("vendor_name", "is", null)
    .not("vendor_name", "ilike", "%makemytrip%");

  const rawProjects: Project[] = (portfolioRows ?? []).map((row) => ({
    name: row.agents_projects ?? "Untitled",
    description: row.description ?? "",
    timeline: null,
    status: withStatus ? (row.status || null) : null,
    llms: row.llms
      ? row.llms.split(",").map((s: string) => s.trim()).filter(Boolean)
          .map((entry: string) => {
            const parts = entry.trim().split(" ");
            const provider = parts[0] ?? entry;
            const model = parts.slice(1).join(" ");
            return { provider, model, owner: row.llm_accounts ?? "" };
          })
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
    <ProjectsClient
      initialProjects={sorted}
      initialMaxSpend={maxSpend}
      initialTotalAssigned={totalAssigned}
    />
  );
}
