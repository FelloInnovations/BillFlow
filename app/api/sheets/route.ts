import { NextResponse } from "next/server";
import { getProjects } from "@/lib/sheets";
import { supabase } from "@/lib/supabase";
import { canonicalVendor } from "@/lib/utils";

export async function GET() {
  const [projects, { data: rows }] = await Promise.all([
    getProjects(),
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
