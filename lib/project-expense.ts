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
      value: number;
      isShared: boolean;
      sharedKeyName?: string;
      allocationMethod: "dedicated" | "volume_split" | "equal_split_fallback" | "none";
      sharePercent?: number;
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

// ── Date range helper ──────────────────────────────────────────────────────────
function scopeDateRange(scope: ExpenseScope): { from: string; to: string } | null {
  if (scope === "all_time") return null;
  const now = new Date();
  const to = now.toISOString().split("T")[0];
  let from: string;
  if (scope === "mtd") {
    from = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  } else if (scope === "last_30d") {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - 30);
    from = d.toISOString().split("T")[0];
  } else if (scope === "last_3m") {
    from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1)).toISOString().split("T")[0];
  } else if (scope === "last_12m") {
    from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)).toISOString().split("T")[0];
  } else {
    // last_6m default
    const d = new Date(now);
    d.setUTCMonth(d.getUTCMonth() - 6);
    from = d.toISOString().split("T")[0];
  }
  return { from, to };
}

// ── Raw data shape ────────────────────────────────────────────────────────────
interface RawExpenseData {
  orKeySpend: Map<string, number>;
  keyToProjects: Map<string, string[]>;
  projectToKeys: Map<string, string[]>;
  projects: { name: string; status: string | null; aliases: string[] }[];
  aliasToProject: Map<string, string>;
  invocationByProjectKey: Map<string, number>;
  invocationByKey: Map<string, number>;
  unlinkedInvocationNames: Map<string, { count: number; spend: number }>;
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
  const dateRange = scopeDateRange(scope);

  let invQuery = supabase
    .from("api_invocation_logs")
    .select("project_name, key_name, cost_usd");
  if (dateRange) {
    invQuery = invQuery
      .gte("invoked_at", `${dateRange.from}T00:00:00Z`)
      .lte("invoked_at", `${dateRange.to}T23:59:59Z`);
  }

  const [
    { data: portfolioRows },
    { data: snapshots },
    { data: financialRows },
    { data: toolOverrideRows },
    { data: invocationRows },
  ] = await Promise.all([
    supabase.from("agents_portfolio").select("agents_projects, status, openrouter_api_key, project_name_aliases"),
    supabase.from("openrouter_usage_snapshots").select("key_name, month, usage_total"),
    supabase
      .from("financial_records")
      .select("vendor_name, total_amount, project_id, cost_type")
      .not("vendor_name", "is", null)
      .not("vendor_name", "ilike", "%makemytrip%"),
    supabase.from("tool_project_overrides").select("vendor_name, project_names"),
    invQuery,
  ]);

  // Sum ALL monthly snapshot rows per key — usage_total is per-month spend, not cumulative.
  // Taking only the latest row was the bug: it showed only the most recent month.
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
  const projects: { name: string; status: string | null; aliases: string[] }[] = [];

  for (const row of portfolioRows ?? []) {
    const name = ((row.agents_projects as string) ?? "").trim();
    if (!name || seenProjects.has(name.toLowerCase())) continue;
    seenProjects.add(name.toLowerCase());
    const aliases = (row.project_name_aliases as string[] | null) ?? [];
    projects.push({ name, status: row.status ?? null, aliases });

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

  // Alias resolution map: lowercased name/alias → canonical portfolio name
  const aliasToProject = new Map<string, string>();
  for (const p of projects) {
    aliasToProject.set(p.name.toLowerCase(), p.name);
    for (const alias of p.aliases) {
      aliasToProject.set(alias.toLowerCase(), p.name);
    }
  }

  // Invocation log: aggregate by (canonical project)+key and by key.
  // Log project_name is resolved via aliases before keying into the map.
  const invocationByProjectKey = new Map<string, number>();
  const invocationByKey = new Map<string, number>();
  const unlinkedInvocationNames = new Map<string, { count: number; spend: number }>();

  for (const row of invocationRows ?? []) {
    const rawPName = ((row.project_name as string) ?? "").trim();
    const kName = ((row.key_name as string) ?? "").trim().toLowerCase();
    const cost = Number(row.cost_usd ?? 0);

    const canonicalPName = rawPName
      ? (aliasToProject.get(rawPName.toLowerCase()) ?? null)
      : null;

    if (canonicalPName && kName) {
      const pk = `${canonicalPName}::${kName}`;
      invocationByProjectKey.set(pk, (invocationByProjectKey.get(pk) ?? 0) + cost);
    } else if (rawPName && !canonicalPName) {
      const u = unlinkedInvocationNames.get(rawPName) ?? { count: 0, spend: 0 };
      u.count += 1;
      u.spend += cost;
      unlinkedInvocationNames.set(rawPName, u);
    }

    if (kName) {
      invocationByKey.set(kName, (invocationByKey.get(kName) ?? 0) + cost);
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
      // Never routed to projects — always shared infra bucket
      sharedInfraByVendor.set(canonical, (sharedInfraByVendor.get(canonical) ?? 0) + amount);
    } else if (costType === "shared_tooling") {
      // Never routed to projects
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
    aliasToProject,
    invocationByProjectKey,
    invocationByKey,
    unlinkedInvocationNames,
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
  scope: ExpenseScope,
  raw: RawExpenseData,
): ProjectExpense {
  const keys = raw.projectToKeys.get(projectName) ?? [];
  let orValue = 0;
  let isShared = false;
  let sharedKeyName: string | undefined;
  let allocationMethod: ProjectExpense["breakdown"]["openrouter"]["allocationMethod"] = keys.length === 0 ? "none" : "dedicated";
  let sharePercent: number | undefined;

  if (scope === "all_time") {
    for (const k of keys) {
      const keySpend = raw.orKeySpend.get(k) ?? 0;
      const sharedProjects = raw.keyToProjects.get(k) ?? [projectName];
      if (sharedProjects.length === 1) {
        orValue += keySpend;
      } else {
        isShared = true;
        sharedKeyName = k;
        const totalKeyLog = raw.invocationByKey.get(k) ?? 0;
        if (totalKeyLog > 0) {
          const thisProjectLog = raw.invocationByProjectKey.get(`${projectName}::${k}`) ?? 0;
          const pct = thisProjectLog / totalKeyLog;
          orValue += keySpend * pct;
          sharePercent = Math.round(pct * 1000) / 10;
          allocationMethod = "volume_split";
        } else {
          const equalShare = 1 / sharedProjects.length;
          orValue += keySpend * equalShare;
          sharePercent = Math.round(equalShare * 1000) / 10;
          allocationMethod = "equal_split_fallback";
        }
      }
    }
  } else {
    // Scoped: use invocation logs directly
    for (const k of keys) {
      const sharedProjects = raw.keyToProjects.get(k) ?? [projectName];
      const thisProjectCost = raw.invocationByProjectKey.get(`${projectName}::${k}`) ?? 0;
      if (sharedProjects.length === 1) {
        orValue += thisProjectCost;
      } else {
        isShared = true;
        sharedKeyName = k;
        orValue += thisProjectCost;
        allocationMethod = "volume_split";
      }
    }
  }

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

  const total = Math.round((orValue + invoiceValue) * 100) / 100;

  return {
    projectName,
    total,
    breakdown: {
      openrouter: {
        value: Math.round(orValue * 100) / 100,
        isShared,
        sharedKeyName,
        allocationMethod,
        sharePercent,
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
    result.set(p.name, computeProjectExpense(p.name, scope, raw));
  }

  // Reconciliation: Σ(project OR) + unlinked OR ≈ snapshot grand total.
  // Catches regressions where the aggregation drifts from the Activity page source.
  if (scope === "all_time") {
    const projectOrTotal = [...result.values()].reduce((s, e) => s + e.breakdown.openrouter.value, 0);
    const unlinkedOrTotal = [...raw.orKeySpend.entries()]
      .filter(([k]) => !raw.keyToProjects.has(k))
      .reduce((s, [, v]) => s + v, 0);
    const snapshotTotal = [...raw.orKeySpend.values()].reduce((s, v) => s + v, 0);
    const diff = Math.abs((projectOrTotal + unlinkedOrTotal) - snapshotTotal);
    if (diff > 5.0) {
      console.error(
        `[project-expense] reconciliation mismatch: projects=$${projectOrTotal.toFixed(2)} + unlinked=$${unlinkedOrTotal.toFixed(2)} = $${(projectOrTotal + unlinkedOrTotal).toFixed(2)} vs snapshots=$${snapshotTotal.toFixed(2)} (diff=$${diff.toFixed(2)}) — check loadRawData snapshot aggregation`,
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
      openrouter: { value: 0, isShared: false, allocationMethod: "none" },
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

// ── Unlinked invocation activity ──────────────────────────────────────────────
// Returns log project_name values that don't match any portfolio project by name
// or alias, with invocation counts and spend estimates.

export interface UnlinkedProjectEntry {
  name: string;
  invocation_count: number;
  estimated_spend: number;
  sample_dates: string[];
}

export interface UnlinkedInvocationActivity {
  unlinked_project_names: UnlinkedProjectEntry[];
  total_unlinked_spend: number;
}

export async function getUnlinkedInvocationActivity(): Promise<UnlinkedInvocationActivity> {
  const supabase = serviceClient();

  const [{ data: portfolioRows }, { data: invocationRows }] = await Promise.all([
    supabase
      .from("agents_portfolio")
      .select("agents_projects, project_name_aliases"),
    supabase
      .from("api_invocation_logs")
      .select("project_name, cost_usd, invoked_at"),
  ]);

  // Build alias resolution map
  const aliasToProject = new Map<string, string>();
  const seenProjects = new Set<string>();
  for (const row of portfolioRows ?? []) {
    const name = ((row.agents_projects as string) ?? "").trim();
    if (!name || seenProjects.has(name.toLowerCase())) continue;
    seenProjects.add(name.toLowerCase());
    aliasToProject.set(name.toLowerCase(), name);
    const aliases = (row.project_name_aliases as string[] | null) ?? [];
    for (const alias of aliases) {
      if (alias.trim()) aliasToProject.set(alias.trim().toLowerCase(), name);
    }
  }

  // Collect unlinked entries
  const unlinked = new Map<string, { count: number; spend: number; dates: Set<string> }>();
  for (const row of invocationRows ?? []) {
    const rawPName = ((row.project_name as string) ?? "").trim();
    if (!rawPName) continue;
    if (aliasToProject.has(rawPName.toLowerCase())) continue;

    const cost = Number(row.cost_usd ?? 0);
    const date = (row.invoked_at as string)?.substring(0, 10) ?? "";
    const u = unlinked.get(rawPName) ?? { count: 0, spend: 0, dates: new Set<string>() };
    u.count += 1;
    u.spend += cost;
    if (date) u.dates.add(date);
    unlinked.set(rawPName, u);
  }

  const entries: UnlinkedProjectEntry[] = [...unlinked.entries()]
    .map(([name, u]) => {
      const sortedDates = [...u.dates].sort();
      const sample_dates = sortedDates.length <= 2
        ? sortedDates
        : [sortedDates[0], sortedDates[sortedDates.length - 1]];
      return {
        name,
        invocation_count: u.count,
        estimated_spend: Math.round(u.spend * 100) / 100,
        sample_dates,
      };
    })
    .sort((a, b) => b.estimated_spend - a.estimated_spend);

  return {
    unlinked_project_names: entries,
    total_unlinked_spend: Math.round(entries.reduce((s, e) => s + e.estimated_spend, 0) * 100) / 100,
  };
}
