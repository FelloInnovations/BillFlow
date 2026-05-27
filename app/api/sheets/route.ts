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
  const [projects, { data: rows }] = await Promise.all([
    getProjectsFromDB(),
    supabase
      .from("financial_records")
      .select("vendor_name, total_amount")
      .not("vendor_name", "is", null)
      .not("vendor_name", "ilike", "%makemytrip%"),
  ]);

  // Build canonical spend map
  const spendMap = new Map<string, number>();
  for (const r of rows ?? []) {
    if (!r.vendor_name) continue;
    const canonical = canonicalVendor(r.vendor_name);
    spendMap.set(canonical, (spendMap.get(canonical) ?? 0) + Number(r.total_amount ?? 0));
  }

  // Count how many projects use each vendor (for cost splitting)
  const vendorProjectCount = new Map<string, number>();
  for (const project of projects) {
    const vendors = new Set([
      ...project.llms.map((l) => l.provider),
      ...project.services,
    ]);
    for (const vendor of vendors) {
      if (spendMap.has(vendor)) {
        vendorProjectCount.set(vendor, (vendorProjectCount.get(vendor) ?? 0) + 1);
      }
    }
  }

  const enriched = projects.map((project) => {
    const vendors = new Set([
      ...project.llms.map((l) => l.provider),
      ...project.services,
    ]);
    let total = 0;
    let hasAnyVendor = false;
    for (const vendor of vendors) {
      const spend = spendMap.get(vendor);
      const count = vendorProjectCount.get(vendor) ?? 1;
      if (spend !== undefined) {
        total += spend / count;
        hasAnyVendor = true;
      }
    }
    return { ...project, totalSpend: hasAnyVendor ? total : null };
  });

  return NextResponse.json({ projects: enriched, spendMap: Object.fromEntries(spendMap) });
}
