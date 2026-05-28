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
    .select("agents_projects, description, llms, llm_accounts, services_used, status, openrouter_api_key")
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

  const [{ data: invoiceRows }, { data: snapshots }] = await Promise.all([
    supabase
      .from("financial_records")
      .select("vendor_name, total_amount")
      .not("vendor_name", "is", null)
      .not("vendor_name", "ilike", "%makemytrip%"),
    supabase
      .from("openrouter_usage_snapshots")
      .select("key_name, usage_total"),
  ]);

  // Deduplicate by project name (DB has duplicate rows)
  const seenNames = new Set<string>();
  const uniqueRows = (portfolioRows ?? []).filter((row) => {
    const key = (row.agents_projects ?? "").trim().toLowerCase();
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });

  const rawProjects: Project[] = uniqueRows.map((row) => ({
    name: row.agents_projects ?? "Untitled",
    description: row.description ?? "",
    timeline: null,
    status: withStatus ? (row.status || null) : null,
    llms: row.llms
      ? row.llms.split(",").map((s: string) => s.trim()).filter((s: string) => s && s.toLowerCase() !== "na")
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
    openrouter_api_key: row.openrouter_api_key ?? null,
  }));

  // Per-key total spend from OR snapshots (actual API usage)
  const keySpend = new Map<string, number>();
  for (const snap of snapshots ?? []) {
    const key = (snap.key_name as string).toLowerCase();
    keySpend.set(key, (keySpend.get(key) ?? 0) + Number(snap.usage_total ?? 0));
  }

  // Service-only spend map (LLM spend comes from OR key snapshots, not invoices)
  const serviceSpendMap = new Map<string, number>();
  for (const r of invoiceRows ?? []) {
    if (!r.vendor_name) continue;
    const canonical = canonicalVendor(r.vendor_name as string);
    if (canonical !== "OpenRouter") {
      serviceSpendMap.set(canonical, (serviceSpendMap.get(canonical) ?? 0) + Number(r.total_amount ?? 0));
    }
  }

  // Count active projects per service for proportional split
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
    let total = 0;
    let hasSpend = false;

    // LLM spend: use per-key OR snapshot data only if the project has a named key
    if (p.openrouter_api_key) {
      for (const key of (p.openrouter_api_key as string)
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean)) {
        const spend = keySpend.get(key) ?? 0;
        total += spend;
        if (spend > 0) hasSpend = true;
      }
    }

    // Service spend: proportional split among active projects using that service
    if (p.status !== "shut down") {
      for (const svc of p.services) {
        const canonical = canonicalVendor(svc);
        const spend = serviceSpendMap.get(canonical);
        const count = serviceProjectCount.get(canonical) ?? 1;
        if (spend !== undefined) {
          total += spend / count;
          hasSpend = true;
        }
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
