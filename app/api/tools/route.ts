import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getProjects } from "@/lib/sheets";
import { canonicalVendor } from "@/lib/utils";
import { Tool } from "@/types";

export async function GET() {
  const twelveMonthsAgo = new Date(
    new Date().getFullYear() - 1, new Date().getMonth(), 1
  ).toISOString().split("T")[0];

  const [projects, { data: allRows }, { data: trendRows }] = await Promise.all([
    getProjects(),
    supabase
      .from("financial_records")
      .select("vendor_name, total_amount")
      .not("vendor_name", "is", null)
      .not("vendor_name", "ilike", "%makemytrip%"),
    supabase
      .from("financial_records")
      .select("vendor_name, invoice_date, total_amount")
      .gte("invoice_date", twelveMonthsAgo)
      .not("vendor_name", "is", null)
      .not("vendor_name", "ilike", "%makemytrip%"),
  ]);

  // project → vendors map
  const vendorToProjects = new Map<string, string[]>();
  for (const project of projects) {
    for (const vendor of [...project.llms.map((l) => l.provider), ...project.services]) {
      const arr = vendorToProjects.get(vendor) ?? [];
      if (!arr.includes(project.name)) arr.push(project.name);
      vendorToProjects.set(vendor, arr);
    }
  }

  // canonical totals
  const canonicalTotals = new Map<string, number>();
  for (const r of allRows ?? []) {
    if (!r.vendor_name) continue;
    const canonical = canonicalVendor(r.vendor_name);
    canonicalTotals.set(canonical, (canonicalTotals.get(canonical) ?? 0) + Number(r.total_amount ?? 0));
  }

  // canonical monthly trend
  const canonicalMonthly = new Map<string, Map<string, number>>();
  for (const r of trendRows ?? []) {
    if (!r.vendor_name || !r.invoice_date) continue;
    const canonical = canonicalVendor(r.vendor_name);
    const month = new Date(r.invoice_date).toLocaleDateString("en-US", {
      month: "short", year: "numeric",
    });
    const monthMap = canonicalMonthly.get(canonical) ?? new Map();
    monthMap.set(month, (monthMap.get(month) ?? 0) + Number(r.total_amount ?? 0));
    canonicalMonthly.set(canonical, monthMap);
  }

  const llmProviders = new Set(projects.flatMap((p) => p.llms.map((l) => l.provider)));

  const tools: Tool[] = [...canonicalTotals.entries()]
    .map(([name, total]) => {
      const monthMap = canonicalMonthly.get(name) ?? new Map();
      return {
        name,
        type: llmProviders.has(name) ? "llm" : "service",
        projects: vendorToProjects.get(name) ?? [],
        totalSpend: total,
        monthlyTrend: [...monthMap.entries()]
          .sort((a, b) => new Date("1 " + a[0]).getTime() - new Date("1 " + b[0]).getTime())
          .map(([month, t]) => ({ month, total: t })),
      } satisfies Tool;
    })
    .sort((a, b) => b.totalSpend - a.totalSpend);

  return NextResponse.json({ tools });
}
