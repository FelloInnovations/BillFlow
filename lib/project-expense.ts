import { createClient } from "@supabase/supabase-js";
import { canonicalVendor } from "@/lib/utils";

// ── Scope ─────────────────────────────────────────────────────────────────────
export type ExpenseScope = "mtd" | "last_30d" | "last_3m" | "last_6m" | "last_12m" | "all_time";

// ── Vendor classification ──────────────────────────────────────────────────────
export const SHARED_INFRA_CANONICAL = new Set([
  "Railway", "Supabase", "Vercel", "Cloudflare", "AWS", "GCP",
]);

export const SHARED_TOOLING_CANONICAL = new Set([
  "HubSpot", "Slack", "GitHub", "Linear", "Notion", "Figma",
]);

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ProjectExpense {
  projectName: string;
  total: number;
  breakdown: {
    openrouter: {
      // First key name for display; null if no key configured
      keyName: string | null;
      // Full spend of all keys used by this project (not split for shared keys)
      keyTotalSpend: number;
      // True if any key is shared with another project
      isShared: boolean;
      // Other projects that share this project's keys
      sharedWith: string[];
      attributionNote: "dedicated" | "shared_total" | "none";
      // Per-key detail — used by ProjectsClient to deduplicate shared keys in header math
      keyDetails: { name: string; spend: number; isShared: boolean; sharedWith: string[] }[];
    };
    allocated_invoices: {
      value: number;
      count: number;
      items: { vendor: string; amount: number }[];
    };
  };
}

export interface UnallocatedSpend {
  shared_infrastructure: { total: number; vendors: { name: string; value: number }[] };
  shared_tooling: { total: number; vendors: { name: string; value: number }[] };
  unallocated_misc: { total: number; count: number };
  grand_total: number;
}

// ── Cache ──────────────────────────────────────────────────────────────────────
interface CacheEntry<T> { data: T; expiresAt: number; }
const _cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 15 * 60 * 1000;

function getCache<T>(key: string): T | null {
  const entry = _cache.get(key) as CacheEntry<T> | undefined;
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.data;
}
function setCache<T>(key: string, data: T): void {
  _cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Supabase service client ────────────────────────────────────────────────────
function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// ── Raw data shape ────────────────────────────────────────────────────────────
interface RawExpenseData {
  orKeySpend: Map<string, number>;
  keyToProjects: Map<string, string[]>;
  projectToKeys: Map<string, string[]>;
  projects: { name: string; status: string | null }[];
  toolToProjects: Map<string, string[]>;
  attributableVendorTotals: Map<string, number>;
  invoicesDirectByProject: Map<string, { total: number; count: number; items: { vendor: string; amount: number }[] }>;
  sharedInfraByVendor: Map<string, number>;
  sharedToolingByVendor: Map<string, number>;
  unallocatedMiscTotal: number;
  unallocatedMiscCount: number;
}

// ── Bulk data loader (cached per scope) ──────────────────────────────────────
async function loadRawData(scope: ExpenseScope): Promise<RawExpenseData> {
  const cacheKey = `raw:${scope}`;
  const cached = getCache<RawExpenseData>(cacheKey);
  if (cached) return cached;

  const supabase = serviceClient();

  const [
    { data: portfolioRows },
    { data: snapshots },
    { data: financialRows },
    { data: toolOverrideRows },
  ] = await Promise.all([
    supabase.from("agents_portfolio").select("agents_projects, status, openrouter_api_key"),
    supabase.from("openrouter_usage_snapshots").select("key_name, month, usage_total"),
    supabase
      .from("financial_records")
      .select("vendor_name, total_amount, project_id, cost_type")
      .not("vendor_name", "is", null)
      .not("vendor_name", "ilike", "%makemytrip%"),
    supabase.from("tool_project_overrides").select("vendor_name, project_names"),
  ]);

  // Sum ALL monthly snapshot rows per key — usage_total is per-month spend, not cumulative.
  const orKeySpend = new Map<string, number>();
  for (const snap of snapshots ?? []) {
    const k = (snap.key_name as string).toLowerCase();
    const total = Number(snap.usage_total ?? 0);
    orKeySpend.set(k, (orKeySpend.get(k) ?? 0) + total);
  }

  // Deduplicated project list + bidirectional key maps
  const keyToProjects = new Map<string, string[]>();
  const projectToKeys = new Map<string, string[]>();
  const seenProjects = new Set<string>();
  const projects: { name: string; status: string | null }[] = [];

  for (const row of portfolioRows ?? []) {
    const name = ((row.agents_projects as string) ?? "").trim();
    if (!name || seenProjects.has(name.toLowerCase())) continue;
    seenProjects.add(name.toLowerCase());
    projects.push({ name, status: row.status ?? null });

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

  // Tool overrides
  const toolToProjects = new Map<string, string[]>();
  for (const row of toolOverrideRows ?? []) {
    if (row.vendor_name && Array.isArray(row.project_names)) {
      toolToProjects.set(row.vendor_name as string, row.project_names as string[]);
    }
  }

  // Categorize financial records
  const sharedInfraByVendor = new Map<string, number>();
  const sharedToolingByVendor = new Map<string, number>();
  const attributableVendorTotals = new Map<string, number>();
  const invoicesDirectByProject = new Map<string, { total: number; count: number; items: { vendor: string; amount: number }[] }>();
  let unallocatedMiscTotal = 0;
  let unallocatedMiscCount = 0;

  for (const r of financialRows ?? []) {
    if (!r.vendor_name) continue;
    const canonical = canonicalVendor(r.vendor_name as string);
    const amount = Number(r.total_amount ?? 0);
    if (canonical === "OpenRouter") continue;

    const costType = r.cost_type as string | null;
    const projectId = r.project_id as string | null;

    if (costType === "project_specific" && projectId) {
      const existing = invoicesDirectByProject.get(projectId) ?? { total: 0, count: 0, items: [] };
      existing.total += amount;
      existing.count += 1;
      existing.items.push({ vendor: canonical, amount });
      invoicesDirectByProject.set(projectId, existing);
    } else if (costType === "shared_infrastructure") {
      sharedInfraByVendor.set(canonical, (sharedInfraByVendor.get(canonical) ?? 0) + amount);
    } else if (costType === "shared_tooling") {
      sharedToolingByVendor.set(canonical, (sharedToolingByVendor.get(canonical) ?? 0) + amount);
    } else if (costType === "unallocated") {
      unallocatedMiscTotal += amount;
      unallocatedMiscCount += 1;
    } else {
      // cost_type IS NULL — vendor-based classification for backward compat
      if (SHARED_INFRA_CANONICAL.has(canonical)) {
        sharedInfraByVendor.set(canonical, (sharedInfraByVendor.get(canonical) ?? 0) + amount);
      } else if (SHARED_TOOLING_CANONICAL.has(canonical)) {
        sharedToolingByVendor.set(canonical, (sharedToolingByVendor.get(canonical) ?? 0) + amount);
      } else if (toolToProjects.has(canonical)) {
        attributableVendorTotals.set(canonical, (attributableVendorTotals.get(canonical) ?? 0) + amount);
      } else {
        unallocatedMiscTotal += amount;
        unallocatedMiscCount += 1;
      }
    }
  }

  const data: RawExpenseData = {
    orKeySpend,
    keyToProjects,
    projectToKeys,
    projects,
    toolToProjects,
    attributableVendorTotals,
    invoicesDirectByProject,
    sharedInfraByVendor,
    sharedToolingByVendor,
    unallocatedMiscTotal,
    unallocatedMiscCount,
  };

  setCache(cacheKey, data);
  return data;
}

// ── Per-project expense computation ──────────────────────────────────────────
function computeProjectExpense(
  projectName: string,
  raw: RawExpenseData,
): ProjectExpense {
  const keys = raw.projectToKeys.get(projectName) ?? [];

  const keyDetails: { name: string; spend: number; isShared: boolean; sharedWith: string[] }[] = [];
  let totalOrSpend = 0;
  let anyShared = false;
  const allSharedWith: string[] = [];

  for (const k of keys) {
    const keySpend = raw.orKeySpend.get(k) ?? 0;
    const sharedProjects = raw.keyToProjects.get(k) ?? [projectName];
    const isKeyShared = sharedProjects.length > 1;
    const sharedWith = sharedProjects.filter((p) => p !== projectName);

    keyDetails.push({ name: k, spend: keySpend, isShared: isKeyShared, sharedWith });
    totalOrSpend += keySpend;

    if (isKeyShared) {
      anyShared = true;
      for (const p of sharedWith) {
        if (!allSharedWith.includes(p)) allSharedWith.push(p);
      }
    }
  }

  const attributionNote: ProjectExpense["breakdown"]["openrouter"]["attributionNote"] =
    keys.length === 0 ? "none" : anyShared ? "shared_total" : "dedicated";

  // Manually allocated invoices (project_specific cost_type)
  const invoiceData = raw.invoicesDirectByProject.get(projectName);
  let invoiceValue = invoiceData?.total ?? 0;
  let invoiceCount = invoiceData?.count ?? 0;
  const invoiceItems: { vendor: string; amount: number }[] = [...(invoiceData?.items ?? [])];

  // Tool overrides — fold into allocated invoices (backward compat)
  for (const [vendor, projList] of raw.toolToProjects) {
    if (!projList.includes(projectName)) continue;
    const vendorSpend = raw.attributableVendorTotals.get(vendor) ?? 0;
    const share = vendorSpend / projList.length;
    if (share > 0) {
      invoiceValue += share;
      invoiceCount += 1;
      invoiceItems.push({ vendor, amount: Math.round(share * 100) / 100 });
    }
  }

  const total = Math.round((totalOrSpend + invoiceValue) * 100) / 100;

  return {
    projectName,
    total,
    breakdown: {
      openrouter: {
        keyName: keyDetails[0]?.name ?? null,
        keyTotalSpend: Math.round(totalOrSpend * 100) / 100,
        isShared: anyShared,
        sharedWith: allSharedWith,
        attributionNote,
        keyDetails,
      },
      allocated_invoices: {
        value: Math.round(invoiceValue * 100) / 100,
        count: invoiceCount,
        items: invoiceItems,
      },
    },
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getAllProjectsExpense(
  scope: ExpenseScope = "all_time",
): Promise<Map<string, ProjectExpense>> {
  const cacheKey = `expenses:${scope}`;
  const cached = getCache<Map<string, ProjectExpense>>(cacheKey);
  if (cached) return cached;

  const raw = await loadRawData(scope);

  const result = new Map<string, ProjectExpense>();
  for (const p of raw.projects) {
    result.set(p.name, computeProjectExpense(p.name, raw));
  }

  // Reconciliation: unique linked key spends + unlinked key spends = snapshot total.
  if (scope === "all_time") {
    const linkedKeys = new Set<string>();
    for (const e of result.values()) {
      for (const kd of e.breakdown.openrouter.keyDetails) linkedKeys.add(kd.name);
    }
    const linkedTotal = [...linkedKeys].reduce((s, k) => s + (raw.orKeySpend.get(k) ?? 0), 0);
    const unlinkedTotal = [...raw.orKeySpend.entries()]
      .filter(([k]) => !linkedKeys.has(k))
      .reduce((s, [, v]) => s + v, 0);
    const snapshotTotal = [...raw.orKeySpend.values()].reduce((s, v) => s + v, 0);
    const diff = Math.abs((linkedTotal + unlinkedTotal) - snapshotTotal);
    if (diff > 0.01) {
      console.error(
        `[project-expense] reconciliation mismatch: linked=$${linkedTotal.toFixed(2)} + unlinked=$${unlinkedTotal.toFixed(2)} = $${(linkedTotal + unlinkedTotal).toFixed(2)} vs snapshots=$${snapshotTotal.toFixed(2)} (diff=$${diff.toFixed(2)})`,
      );
    }
  }

  setCache(cacheKey, result);
  return result;
}

export async function getProjectExpense(
  projectName: string,
  scope: ExpenseScope = "all_time",
): Promise<ProjectExpense> {
  const all = await getAllProjectsExpense(scope);
  return all.get(projectName) ?? {
    projectName,
    total: 0,
    breakdown: {
      openrouter: {
        keyName: null,
        keyTotalSpend: 0,
        isShared: false,
        sharedWith: [],
        attributionNote: "none",
        keyDetails: [],
      },
      allocated_invoices: { value: 0, count: 0, items: [] },
    },
  };
}

export async function getUnallocatedSpend(
  scope: ExpenseScope = "all_time",
): Promise<UnallocatedSpend> {
  const cacheKey = `unallocated:${scope}`;
  const cached = getCache<UnallocatedSpend>(cacheKey);
  if (cached) return cached;

  const raw = await loadRawData(scope);

  // Unlinked OR keys (not attributed to any project)
  let unlinkedOrTotal = 0;
  for (const [k, spend] of raw.orKeySpend) {
    if (!raw.keyToProjects.has(k)) unlinkedOrTotal += spend;
  }

  const infraTotal = [...raw.sharedInfraByVendor.values()].reduce((s, v) => s + v, 0);
  const toolingTotal = [...raw.sharedToolingByVendor.values()].reduce((s, v) => s + v, 0);
  const miscTotal = raw.unallocatedMiscTotal + unlinkedOrTotal;

  const infraVendors = [...raw.sharedInfraByVendor.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));

  const toolingVendors = [...raw.sharedToolingByVendor.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));

  const result: UnallocatedSpend = {
    shared_infrastructure: {
      total: Math.round(infraTotal * 100) / 100,
      vendors: infraVendors,
    },
    shared_tooling: {
      total: Math.round(toolingTotal * 100) / 100,
      vendors: toolingVendors,
    },
    unallocated_misc: {
      total: Math.round(miscTotal * 100) / 100,
      count: raw.unallocatedMiscCount,
    },
    grand_total: Math.round((infraTotal + toolingTotal + miscTotal) * 100) / 100,
  };

  setCache(cacheKey, result);
  return result;
}

// ── Cache invalidation ────────────────────────────────────────────────────────
export function clearExpenseCache(): void {
  _cache.clear();
}
