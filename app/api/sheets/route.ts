import { NextResponse } from "next/server";
import { STATIC_PROJECTS } from "@/lib/sheets";
import { supabase } from "@/lib/supabase";
import { canonicalVendor } from "@/lib/utils";
import { fetchOrKeySpend } from "@/lib/orKeySpend";
import { Project } from "@/types";

async function getProjectsFromDB(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("agents_portfolio")
    .select("agents_projects, description, llms, llm_accounts, services_used, status, openrouter_api_key")
    .limit(500);

  if (error) {
    console.error("[agents_portfolio] fetch error:", error.message);
    return STATIC_PROJECTS;
  }
  if (!data) return STATIC_PROJECTS;

  const seen = new Set<string>();
  const unique = data.filter((row) => {
    const key = (row.agents_projects ?? "").trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.map((row) => {
    const llmNames = row.llms
      ? row.llms.split(",").map((s: string) => s.trim()).filter((s: string) => s && s.toLowerCase() !== "na")
      : [];
    const services = row.services_used
      ? row.services_used.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];

    return {
      name: row.agents_projects ?? "",
      description: row.description ?? "",
      timeline: null,
      llms: llmNames.map((entry: string) => {
        const parts = entry.split(" ");
        return { provider: parts[0], model: parts.slice(1).join(" "), owner: row.llm_accounts ?? "" };
      }),
      services,
      status: row.status ?? null,
      totalSpend: null,
      openrouter_api_key: row.openrouter_api_key ?? null,
    };
  });
}

export async function GET() {
  const [projects, { data: rows }, orKeySpend] = await Promise.all([
    getProjectsFromDB(),
    supabase
      .from("financial_records")
      .select("vendor_name, total_amount")
      .not("vendor_name", "is", null)
      .not("vendor_name", "ilike", "%makemytrip%"),
    fetchOrKeySpend(),
  ]);

  // keyName (lowercase) → project names that reference it (for shared-key splitting)
  const keyToProjects = new Map<string, string[]>();
  for (const p of projects) {
    if (!p.openrouter_api_key) continue;
    for (const k of (p.openrouter_api_key as string).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
      const arr = keyToProjects.get(k) ?? [];
      if (!arr.includes(p.name)) arr.push(p.name);
      keyToProjects.set(k, arr);
    }
  }

  // Full invoice totals (for spendMap response) and service-only split pool
  const fullSpendMap = new Map<string, number>();
  const serviceSpendMap = new Map<string, number>();
  for (const r of rows ?? []) {
    if (!r.vendor_name) continue;
    const canonical = canonicalVendor(r.vendor_name as string);
    fullSpendMap.set(canonical, (fullSpendMap.get(canonical) ?? 0) + Number(r.total_amount ?? 0));
    if (canonical !== "OpenRouter") {
      serviceSpendMap.set(canonical, (serviceSpendMap.get(canonical) ?? 0) + Number(r.total_amount ?? 0));
    }
  }

  // Count active projects per service for proportional split
  const activeProjects = projects.filter((p) => p.status !== "shut down");
  const serviceProjectCount = new Map<string, number>();
  for (const p of activeProjects) {
    for (const svc of p.services) {
      const canonical = canonicalVendor(svc);
      if (serviceSpendMap.has(canonical)) {
        serviceProjectCount.set(canonical, (serviceProjectCount.get(canonical) ?? 0) + 1);
      }
    }
  }

  const enriched = projects.map((p) => {
    // ── Actual: OR per-key spend ──────────────────────────────────────────────
    let apiKeySpend: number | null = null;
    if (p.openrouter_api_key) {
      let total = 0;
      let anyResolved = false;
      for (const k of (p.openrouter_api_key as string).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
        const spend = orKeySpend.get(k);
        if (spend !== undefined) {
          // Divide among all projects that share this exact key
          const shareCount = Math.max(1, keyToProjects.get(k)?.length ?? 1);
          total += spend / shareCount;
          anyResolved = true;
        }
      }
      if (anyResolved) apiKeySpend = Math.round(total * 100) / 100;
    }

    // ── Estimated: proportional service invoice split ─────────────────────────
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

  return NextResponse.json({ projects: enriched, spendMap: Object.fromEntries(fullSpendMap) });
}
