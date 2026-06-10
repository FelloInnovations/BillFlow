/**
 * GET /api/projects/expense-audit
 * Protected by x-sync-secret header.
 *
 * Diagnostic endpoint — audits every cost source in BillFlow and reports
 * how much of each source is currently attributable to individual projects
 * vs. unallocated. Run this before implementing the unified expense model.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * SCHEMA FINDINGS — verified from actual table structures:
 *
 * 1. project → OpenRouter spend
 *    Table:   openrouter_usage_snapshots (key_name, month, usage_total)
 *    Link:    agents_portfolio.openrouter_api_key (comma-separated key names)
 *             matches openrouter_usage_snapshots.key_name (case-insensitive)
 *    Notes:   usage_total is CUMULATIVE all-time spend for the key; take the
 *             latest month's row per key as the total. Multiple projects can
 *             share one key — current logic splits equally by shareCount.
 *
 * 2. project → tools / vendor services
 *    Auto-link: agents_portfolio.llms (comma-separated, e.g. "OpenRouter gpt-4o-mini")
 *               → canonicalVendor() → financial_records vendor match.
 *               Only LLM-type vendors get auto-linked; service vendors do NOT.
 *    Manual link: tool_project_overrides.vendor_name (canonical) → project_names[]
 *               Admin-set; overrides / extends auto-link for any vendor.
 *    NOTE: there is NO foreign key or project_id on financial_records itself.
 *
 * 3. project → invoices (financial_records)
 *    NO DIRECT LINKAGE. financial_records has no project_id column.
 *    Invoice spend cannot be attributed to a specific project without
 *    adding a project_id column or a separate allocation table.
 *    All invoice spend is currently org-wide (unallocated).
 *
 * 4. Shared infrastructure (currently 100% unallocated)
 *    These vendors appear in financial_records but are org-wide services
 *    with no project attribution: Railway, Supabase, Oxylabs, Apify,
 *    ScraperAPI, ElevenLabs, Apollo, Serper, ngrok, Mention, Profound, etc.
 *    Their spend CANNOT be attributed to projects without an explicit
 *    allocation methodology (e.g. proportional to direct spend, headcount, etc.)
 *
 * 5. api_invocation_logs
 *    Has project_name and key_name columns. Could be used to split shared-key
 *    OpenRouter spend by actual usage volume per project — more accurate than
 *    equal split. (Future improvement.)
 * ═══════════════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canonicalVendor } from "@/lib/utils";

function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// Service vendors that are shared infrastructure — never attributable to one project
const SHARED_INFRA_KEYWORDS = [
  "railway", "supabase", "oxylabs", "apify", "scraperapi", "saas.group",
  "elevenlabs", "eleven labs", "apollo", "zen leads", "serper", "mention",
  "vector", "ngrok", "profound", "transmedia",
];
function isSharedInfra(vendor: string): boolean {
  const lower = vendor.toLowerCase();
  return SHARED_INFRA_KEYWORDS.some((k) => lower.includes(k));
}

interface ProjectAudit {
  project_id:               string;
  project_name:             string;
  status:                   string | null;
  current_displayed_spend:  number;
  sources: {
    openrouter_dedicated:          number;
    openrouter_shared_allocation:  number;
    tools_dedicated:               number;
    tools_shared_allocation:       number;
    invoices_direct:               number;
    shared_infra_allocation:       number;
  };
  total_actual_spend:  number;
  delta_vs_displayed:  number;
  notes:               string[];
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-sync-secret");
  if (secret !== process.env.OUTCOMES_SYNC_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = serviceClient();

  // ── Fetch all required data in parallel ──────────────────────────────────────
  const [
    { data: portfolioRows },
    { data: snapshots },
    { data: financialRows },
    { data: toolOverrideRows },
    { data: invocationRows },
  ] = await Promise.all([
    supabase
      .from("agents_portfolio")
      .select("agents_projects, description, status, openrouter_api_key"),
    supabase
      .from("openrouter_usage_snapshots")
      .select("key_name, month, usage_total"),
    supabase
      .from("financial_records")
      .select("vendor_name, total_amount")
      .not("vendor_name", "is", null)
      .not("vendor_name", "ilike", "%makemytrip%"),
    supabase
      .from("tool_project_overrides")
      .select("vendor_name, project_names"),
    supabase
      .from("api_invocation_logs")
      .select("project_name, key_name, cost_usd"),
  ]);

  // ── Build per-key spend (latest cumulative snapshot per key) ─────────────────
  const latestSnap = new Map<string, { month: string; total: number }>();
  for (const snap of snapshots ?? []) {
    const k = (snap.key_name as string).toLowerCase();
    const month = snap.month as string;
    const total = Number(snap.usage_total ?? 0);
    const existing = latestSnap.get(k);
    if (!existing || month > existing.month) latestSnap.set(k, { month, total });
  }
  const orKeySpend = new Map([...latestSnap.entries()].map(([k, v]) => [k, v.total]));

  // ── Build key → [projectNames] and project → [keys] maps ────────────────────
  const keyToProjects = new Map<string, string[]>();
  const projectToKeys = new Map<string, string[]>();
  const seenProjects  = new Set<string>();

  const deduped: { name: string; status: string | null; openrouter_api_key: string | null }[] = [];
  for (const row of portfolioRows ?? []) {
    const name = (row.agents_projects as string ?? "").trim();
    if (!name || seenProjects.has(name.toLowerCase())) continue;
    seenProjects.add(name.toLowerCase());
    deduped.push({ name, status: row.status ?? null, openrouter_api_key: row.openrouter_api_key ?? null });

    if (!row.openrouter_api_key) continue;
    const keys = (row.openrouter_api_key as string)
      .split(",").map((k: string) => k.trim().toLowerCase()).filter(Boolean);
    projectToKeys.set(name, keys);
    for (const k of keys) {
      const arr = keyToProjects.get(k) ?? [];
      if (!arr.includes(name)) arr.push(name);
      keyToProjects.set(k, arr);
    }
  }

  // ── Tool project overrides: vendor_name → [projectNames] ────────────────────
  const toolToProjects = new Map<string, string[]>();
  for (const row of toolOverrideRows ?? []) {
    if (row.vendor_name && Array.isArray(row.project_names)) {
      toolToProjects.set(row.vendor_name as string, row.project_names as string[]);
    }
  }

  // ── Invoice vendor totals (canonical) ───────────────────────────────────────
  const vendorTotals = new Map<string, number>();
  for (const r of financialRows ?? []) {
    if (!r.vendor_name) continue;
    const canonical = canonicalVendor(r.vendor_name as string);
    vendorTotals.set(canonical, (vendorTotals.get(canonical) ?? 0) + Number(r.total_amount ?? 0));
  }

  // Split vendor totals into infra vs. attributable
  let totalSharedInfra = 0;
  const attributableVendorTotals = new Map<string, number>();
  for (const [vendor, total] of vendorTotals) {
    if (isSharedInfra(vendor) || vendor === "OpenRouter") {
      if (vendor !== "OpenRouter") totalSharedInfra += total;
    } else {
      attributableVendorTotals.set(vendor, total);
    }
  }

  // ── Invocation log: project → cost (alternative OR spend attribution) ────────
  const invocationByProject = new Map<string, number>();
  const invocationByKey     = new Map<string, number>();
  for (const row of invocationRows ?? []) {
    const pName = (row.project_name as string) ?? "";
    const kName = (row.key_name    as string) ?? "";
    const cost  = Number(row.cost_usd ?? 0);
    if (pName) invocationByProject.set(pName, (invocationByProject.get(pName) ?? 0) + cost);
    if (kName) invocationByKey.set(kName.toLowerCase(), (invocationByKey.get(kName.toLowerCase()) ?? 0) + cost);
  }

  // ── Compute spend for every project ─────────────────────────────────────────
  const allProjectSpend: { name: string; status: string | null; displayedSpend: number; dedicated: number; shared: number }[] = [];

  for (const p of deduped) {
    const keys = projectToKeys.get(p.name) ?? [];
    let dedicated = 0;
    let shared    = 0;

    for (const k of keys) {
      const keySpend   = orKeySpend.get(k) ?? 0;
      const shareCount = keyToProjects.get(k)?.length ?? 1;
      if (shareCount === 1) {
        dedicated += keySpend;
      } else {
        shared += keySpend / shareCount;
      }
    }

    allProjectSpend.push({
      name:          p.name,
      status:        p.status,
      displayedSpend: dedicated + shared,
      dedicated,
      shared,
    });
  }

  // Sort by displayed spend desc, take top 5
  allProjectSpend.sort((a, b) => b.displayedSpend - a.displayedSpend);
  const top5 = allProjectSpend.slice(0, 5);

  // ── Build audit objects for top 5 ────────────────────────────────────────────
  const auditResults: ProjectAudit[] = top5.map((p) => {
    const notes: string[] = [];
    const keys = projectToKeys.get(p.name) ?? [];

    // Shared-key notes
    for (const k of keys) {
      const shareCount = keyToProjects.get(k)?.length ?? 1;
      if (shareCount > 1) {
        notes.push(`Uses shared OR key "${k}" with ${shareCount - 1} other project(s) — spend split equally (${shareCount} ways). Invocation logs could enable volume-based split instead.`);
      }
    }
    if (keys.length === 0) {
      notes.push("No OpenRouter API key in agents_portfolio — OR spend is zero and cannot be attributed.");
    }

    // Tool override notes
    const toolLinks: string[] = [];
    for (const [vendor, projects] of toolToProjects) {
      if (projects.includes(p.name)) {
        const share = 1 / projects.length;
        const vendorSpend = attributableVendorTotals.get(vendor) ?? 0;
        toolLinks.push(`${vendor}: $${(vendorSpend * share).toFixed(2)} (${projects.length === 1 ? "dedicated" : `1/${projects.length} split`})`);
      }
    }
    if (toolLinks.length === 0) {
      notes.push("No tool_project_overrides links found — no invoice-based tool spend attributable.");
    }

    // Invoice notes
    notes.push("financial_records has no project_id column — invoice spend (incl. shared infra) is 100% unallocated to projects.");

    // Compute tool spend from overrides
    let toolsDedicated = 0;
    let toolsShared    = 0;
    for (const [vendor, projects] of toolToProjects) {
      if (!projects.includes(p.name)) continue;
      const vendorSpend = attributableVendorTotals.get(vendor) ?? 0;
      if (projects.length === 1) {
        toolsDedicated += vendorSpend;
      } else {
        toolsShared += vendorSpend / projects.length;
      }
    }

    const sources = {
      openrouter_dedicated:         Math.round(p.dedicated    * 100) / 100,
      openrouter_shared_allocation: Math.round(p.shared       * 100) / 100,
      tools_dedicated:              Math.round(toolsDedicated * 100) / 100,
      tools_shared_allocation:      Math.round(toolsShared    * 100) / 100,
      invoices_direct:              0,   // no project_id on financial_records
      shared_infra_allocation:      0,   // methodology TBD post-audit
    };

    const totalActual =
      sources.openrouter_dedicated +
      sources.openrouter_shared_allocation +
      sources.tools_dedicated +
      sources.tools_shared_allocation;

    const displayedSpend = Math.round(p.displayedSpend * 100) / 100;

    return {
      project_id:              p.name.toLowerCase().replace(/\s+/g, "_"),
      project_name:            p.name,
      status:                  p.status,
      current_displayed_spend: displayedSpend,
      sources,
      total_actual_spend:  Math.round(totalActual * 100) / 100,
      delta_vs_displayed:  Math.round((totalActual - displayedSpend) * 100) / 100,
      notes,
    };
  });

  // ── Org-wide summary ─────────────────────────────────────────────────────────
  const totalOrSpend     = [...orKeySpend.values()].reduce((s, v) => s + v, 0);
  const totalInvoices    = [...vendorTotals.values()].reduce((s, v) => s + v, 0);
  const totalAttributable = allProjectSpend.reduce((s, p) => s + p.displayedSpend, 0);

  // Identify keys that exist in OR snapshots but aren't linked to any project
  const unlinkedKeys = [...orKeySpend.keys()].filter((k) => !keyToProjects.has(k));

  // Projects with no OR key at all
  const projectsWithNoKey = deduped
    .filter((p) => !projectToKeys.has(p.name))
    .map((p) => p.name);

  // Keys used by multiple projects
  const sharedKeys = [...keyToProjects.entries()]
    .filter(([, projs]) => projs.length > 1)
    .map(([k, projs]) => ({
      key: k,
      projects: projs,
      spend: orKeySpend.get(k) ?? 0,
      spend_per_project: Math.round(((orKeySpend.get(k) ?? 0) / projs.length) * 100) / 100,
    }));

  return NextResponse.json({
    audit_summary: {
      total_projects:           deduped.length,
      projects_with_or_key:     deduped.length - projectsWithNoKey.length,
      projects_no_or_key:       projectsWithNoKey.length,
      total_or_spend_all_keys:  Math.round(totalOrSpend * 100) / 100,
      total_invoice_spend:      Math.round(totalInvoices * 100) / 100,
      total_shared_infra:       Math.round(totalSharedInfra * 100) / 100,
      total_attributable_or:    Math.round(totalAttributable * 100) / 100,
      unlinked_or_keys:         unlinkedKeys,
      projects_with_no_key:     projectsWithNoKey,
      shared_keys:              sharedKeys,
      tool_override_count:      toolOverrideRows?.length ?? 0,
      invocation_log_rows:      invocationRows?.length ?? 0,
    },
    schema_findings: {
      project_to_or_key:      "agents_portfolio.openrouter_api_key (comma-sep) → openrouter_usage_snapshots.key_name",
      project_to_tools:       "tool_project_overrides.vendor_name → project_names[] (manual only; no FK)",
      project_to_invoices:    "NO LINKAGE — financial_records has no project_id column",
      shared_infra:           "Railway, Supabase, Oxylabs, Apify, etc. are org-wide; fully unallocated",
      allocation_improvement: "api_invocation_logs.project_name + key_name enables volume-based OR split vs equal split",
    },
    top5_by_spend: auditResults,
  });
}
