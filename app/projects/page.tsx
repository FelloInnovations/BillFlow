export const dynamic = "force-dynamic";

import { ProjectsClient } from "@/components/projects/ProjectsClient";
import { Project } from "@/types";
import { supabase } from "@/lib/supabase";
import { canonicalVendor } from "@/lib/utils";
import { fetchOrKeySpend } from "@/lib/orKeySpend";

async function getProjects(): Promise<{ projects: Project[]; maxSpend: number }> {
  const { data: portfolioData, error: portfolioErr } = await supabase
    .from("agents_portfolio")
    .select("agents_projects, description, llms, llm_accounts, services_used, status, openrouter_api_key")
    .limit(500);

  if (portfolioErr) console.error("[projects] portfolio error:", portfolioErr.message);

  const portfolioRows = portfolioData ?? [];

  const [{ data: invoiceRows }, orKeySpend] = await Promise.all([
    supabase
      .from("financial_records")
      .select("vendor_name, total_amount")
      .not("vendor_name", "is", null)
      .not("vendor_name", "ilike", "%makemytrip%"),
    fetchOrKeySpend(),
  ]);

  // Deduplicate by project name
  const seenNames = new Set<string>();
  const uniqueRows = portfolioRows.filter((row) => {
    const key = (row.agents_projects ?? "").trim().toLowerCase();
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });

  const rawProjects: Project[] = uniqueRows.map((row) => ({
    name: row.agents_projects ?? "Untitled",
    description: row.description ?? "",
    timeline: null,
    status: row.status ?? null,
    llms: row.llms
      ? row.llms.split(",").map((s: string) => s.trim()).filter((s: string) => s && s.toLowerCase() !== "na")
          .map((entry: string) => {
            const parts = entry.trim().split(" ");
            return { provider: parts[0] ?? entry, model: parts.slice(1).join(" "), owner: row.llm_accounts ?? "" };
          })
      : [],
    services: row.services_used
      ? row.services_used.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [],
    totalSpend: null,
    openrouter_api_key: row.openrouter_api_key ?? null,
  }));

  // keyName (lowercase) → project names sharing that key
  const keyToProjects = new Map<string, string[]>();
  for (const p of rawProjects) {
    if (!p.openrouter_api_key) continue;
    for (const k of (p.openrouter_api_key as string).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
      const arr = keyToProjects.get(k) ?? [];
      if (!arr.includes(p.name)) arr.push(p.name);
      keyToProjects.set(k, arr);
    }
  }

  // Service invoice split pool (non-LLM vendors only)
  const serviceSpendMap = new Map<string, number>();
  for (const r of invoiceRows ?? []) {
    if (!r.vendor_name) continue;
    const canonical = canonicalVendor(r.vendor_name as string);
    if (canonical !== "OpenRouter") {
      serviceSpendMap.set(canonical, (serviceSpendMap.get(canonical) ?? 0) + Number(r.total_amount ?? 0));
    }
  }

  // Count active projects per service
  const activeRaw = rawProjects.filter((p) => p.status !== "shut down");
  const serviceProjectCount = new Map<string, number>();
  for (const p of activeRaw) {
    for (const svc of p.services) {
      const canonical = canonicalVendor(svc);
      if (serviceSpendMap.has(canonical)) {
        serviceProjectCount.set(canonical, (serviceProjectCount.get(canonical) ?? 0) + 1);
      }
    }
  }

  const projects = rawProjects.map((p) => {
    // Actual: OR per-key spend
    let apiKeySpend: number | null = null;
    if (p.openrouter_api_key) {
      let total = 0;
      let anyResolved = false;
      for (const k of (p.openrouter_api_key as string).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
        const spend = orKeySpend.get(k);
        if (spend !== undefined) {
          const shareCount = Math.max(1, keyToProjects.get(k)?.length ?? 1);
          total += spend / shareCount;
          anyResolved = true;
        }
      }
      if (anyResolved) apiKeySpend = Math.round(total * 100) / 100;
    }

    // Estimated: proportional service split
    let estimatedServiceSpend: number | null = null;
    if (p.status !== "shut down") {
      let total = 0;
      let hasService = false;
      for (const svc of p.services) {
        const canonical = canonicalVendor(svc);
        const spend = serviceSpendMap.get(canonical);
        const count = serviceProjectCount.get(canonical) ?? 1;
        if (spend !== undefined) {
          total += spend / count;
          hasService = true;
        }
      }
      if (hasService) estimatedServiceSpend = Math.round(total * 100) / 100;
    }

    const totalSpend =
      apiKeySpend !== null || estimatedServiceSpend !== null
        ? Math.round(((apiKeySpend ?? 0) + (estimatedServiceSpend ?? 0)) * 100) / 100
        : null;

    let spendBasis: "actual" | "estimated" | "mixed" | null = null;
    if (apiKeySpend !== null && estimatedServiceSpend === null) spendBasis = "actual";
    else if (apiKeySpend === null && estimatedServiceSpend !== null) spendBasis = "estimated";
    else if (apiKeySpend !== null && estimatedServiceSpend !== null) spendBasis = "mixed";

    return { ...p, apiKeySpend, estimatedServiceSpend, totalSpend, spendBasis };
  });

  const maxSpend = Math.max(0, ...projects.map((p) => p.totalSpend ?? 0));
  return { projects, maxSpend };
}

export default async function ProjectsPage() {
  const { projects, maxSpend } = await getProjects();
  const sorted = [...projects].sort((a, b) => (b.totalSpend ?? -1) - (a.totalSpend ?? -1));

  return <ProjectsClient initialProjects={sorted} initialMaxSpend={maxSpend} />;
}
