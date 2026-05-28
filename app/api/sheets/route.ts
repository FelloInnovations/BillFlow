import { NextResponse } from "next/server";
import { STATIC_PROJECTS } from "@/lib/sheets";
import { supabase } from "@/lib/supabase";
import { canonicalVendor } from "@/lib/utils";
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

  // Deduplicate by project name (DB has duplicate rows)
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
  const [projects, { data: rows }, { data: snapshots }] = await Promise.all([
    getProjectsFromDB(),
    supabase
      .from("financial_records")
      .select("vendor_name, total_amount")
      .not("vendor_name", "is", null)
      .not("vendor_name", "ilike", "%makemytrip%"),
    supabase
      .from("openrouter_usage_snapshots")
      .select("key_name, usage_total"),
  ]);

  // Per-key total spend from OR snapshots (actual API usage data)
  const keySpend = new Map<string, number>();
  for (const snap of snapshots ?? []) {
    const key = (snap.key_name as string).toLowerCase();
    keySpend.set(key, (keySpend.get(key) ?? 0) + Number(snap.usage_total ?? 0));
  }

  // Service-only spend map (LLM invoices are attributed via OR key snapshots, not invoice data)
  const serviceSpendMap = new Map<string, number>();
  const fullSpendMap = new Map<string, number>();
  for (const r of rows ?? []) {
    if (!r.vendor_name) continue;
    const canonical = canonicalVendor(r.vendor_name as string);
    fullSpendMap.set(canonical, (fullSpendMap.get(canonical) ?? 0) + Number(r.total_amount ?? 0));
    // Only non-LLM vendors go into the proportional-split pool
    if (canonical !== "OpenRouter") {
      serviceSpendMap.set(canonical, (serviceSpendMap.get(canonical) ?? 0) + Number(r.total_amount ?? 0));
    }
  }

  // Count active projects per service for proportional split
  const activeProjects = projects.filter((p) => p.status !== "shut down");
  const serviceProjectCount = new Map<string, number>();
  for (const project of activeProjects) {
    for (const svc of project.services) {
      const canonical = canonicalVendor(svc);
      if (serviceSpendMap.has(canonical)) {
        serviceProjectCount.set(canonical, (serviceProjectCount.get(canonical) ?? 0) + 1);
      }
    }
  }

  const enriched = projects.map((project) => {
    let total = 0;
    let hasSpend = false;

    // LLM spend: use per-key OR snapshot data only if the project has a named key
    if (project.openrouter_api_key) {
      for (const key of (project.openrouter_api_key as string)
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean)) {
        const spend = keySpend.get(key) ?? 0;
        total += spend;
        if (spend > 0) hasSpend = true;
      }
    }

    // Service spend: proportional split among active projects that use each service
    if (project.status !== "shut down") {
      for (const svc of project.services) {
        const canonical = canonicalVendor(svc);
        const spend = serviceSpendMap.get(canonical);
        const count = serviceProjectCount.get(canonical) ?? 1;
        if (spend !== undefined) {
          total += spend / count;
          hasSpend = true;
        }
      }
    }

    return { ...project, totalSpend: hasSpend ? total : null };
  });

  return NextResponse.json({ projects: enriched, spendMap: Object.fromEntries(fullSpendMap) });
}
