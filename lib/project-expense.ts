import { createClient } from "@supabase/supabase-js";
import { canonicalVendor } from "@/lib/utils";

// ── Scope ─────────────────────────────────────────────────────────────────────
export type ExpenseScope = "mtd" | "last_30d" | "last_6m" | "all_time";

// ── Vendor classification ──────────────────────────────────────────────────────
// Only pure hosting/platform infra is SHARED_INFRA; all other unlinked vendors
// fall into unallocated_invoices (Oxylabs, Apify, ElevenLabs, etc.)
const SHARED_INFRA_CANONICAL = new Set([
  "Railway", "Supabase", "Vercel", "Cloudflare", "AWS", "GCP",
]);

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SharedKeyDetail {
  keyName: string;
  keySpend: number;
  thisProjectPct: number;
  thisProjectSpend: number;
  allocationMethod: "volume" | "equal";
}

export interface ProjectExpense {
  projectName: string;
  orDedicated: number;
  orShared: number;
  orAllocationMethod: "dedicated" | "volume" | "equal" | "none";
  toolsDedicated: number;
  toolsShared: number;
  invoicesDirect: number; // always 0 until Phase 2 adds project_id to financial_records
  total: number;
  sharedKeyDetails: SharedKeyDetail[];
}

export interface UnallocatedSpend {
  sharedInfra: number;
  unlinkedOrKeys: number;
  invoicesUnallocated: number;
  total: number;
  topSharedInfraVendors: { vendor: string; amount: number }[];
  topUnallocatedInvoiceVendors: { vendor: string; amount: number }[];
}

// ── Cache ──────────────────────────────────────────────────────────────────────
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

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
  } else {
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
  projects: { name: string; status: string | null }[];
  invocationByProjectKey: Map<string, number>; // `${project}::${key}` → cost
  invocationByKey: Map<string, number>;
  toolToProjects: Map<string, string[]>;
  attributableVendorTotals: Map<string, number>;
  sharedInfraTotal: number;
  sharedInfraByVendor: Map<string, number>;
  unallocatedInvoiceVendors: Map<string, number>;
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
    supabase
      .from("agents_portfolio")
      .select("agents_projects, status, openrouter_api_key"),
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
    invQuery,
  ]);

  // Latest cumulative snapshot per key
  const latestSnap = new Map<string, { month: string; total: number }>();
  for (const snap of snapshots ?? []) {
    const k = (snap.key_name as string).toLowerCase();
    const month = snap.month as string;
    const total = Number(snap.usage_total ?? 0);
    const existing = latestSnap.get(k);
    if (!existing || month > existing.month) latestSnap.set(k, { month, total });
  }
  const orKeySpend = new Map([...latestSnap.entries()].map(([k, v]) => [k, v.total]));

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

  // Invocation log: aggregate by project+key and by key
  const invocationByProjectKey = new Map<string, number>();
  const invocationByKey = new Map<string, number>();
  for (const row of invocationRows ?? []) {
    const pName = ((row.project_name as string) ?? "").trim();
    const kName = ((row.key_name as string) ?? "").trim().toLowerCase();
    const cost = Number(row.cost_usd ?? 0);
    if (pName && kName) {
      const pk = `${pName}::${kName}`;
      invocationByProjectKey.set(pk, (invocationByProjectKey.get(pk) ?? 0) + cost);
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
  const attributableVendorTotals = new Map<string, number>();
  const unallocatedInvoiceVendors = new Map<string, number>();

  for (const r of financialRows ?? []) {
    if (!r.vendor_name) continue;
    const canonical = canonicalVendor(r.vendor_name as string);
    const amount = Number(r.total_amount ?? 0);
    if (canonical === "OpenRouter") continue; // tracked via OR snapshots
    if (SHARED_INFRA_CANONICAL.has(canonical)) {
      sharedInfraByVendor.set(canonical, (sharedInfraByVendor.get(canonical) ?? 0) + amount);
    } else if (toolToProjects.has(canonical)) {
      attributableVendorTotals.set(canonical, (attributableVendorTotals.get(canonical) ?? 0) + amount);
    } else {
      unallocatedInvoiceVendors.set(canonical, (unallocatedInvoiceVendors.get(canonical) ?? 0) + amount);
    }
  }

  const sharedInfraTotal = [...sharedInfraByVendor.values()].reduce((s, v) => s + v, 0);

  const data: RawExpenseData = {
    orKeySpend,
    keyToProjects,
    projectToKeys,
    projects,
    invocationByProjectKey,
    invocationByKey,
    toolToProjects,
    attributableVendorTotals,
    sharedInfraTotal,
    sharedInfraByVendor,
    unallocatedInvoiceVendors,
  };

  setCache(cacheKey, data);
  return data;
}

// ── Volume-based key allocation ────────────────────────────────────────────────
function allocateSharedKey(
  projectName: string,
  keyName: string,
  keySpend: number,
  sharedProjects: string[],
  invocationByProjectKey: Map<string, number>,
  invocationByKey: Map<string, number>,
): SharedKeyDetail {
  const totalKeyLog = invocationByKey.get(keyName) ?? 0;

  if (totalKeyLog > 0) {
    const thisProjectLog = invocationByProjectKey.get(`${projectName}::${keyName}`) ?? 0;
    const pct = thisProjectLog / totalKeyLog;
    return {
      keyName,
      keySpend,
      thisProjectPct: pct,
      thisProjectSpend: keySpend * pct,
      allocationMethod: "volume",
    };
  }

  const equalShare = 1 / sharedProjects.length;
  return {
    keyName,
    keySpend,
    thisProjectPct: equalShare,
    thisProjectSpend: keySpend * equalShare,
    allocationMethod: "equal",
  };
}

// ── Internal per-project computation ─────────────────────────────────────────
function computeProjectExpense(
  projectName: string,
  scope: ExpenseScope,
  raw: RawExpenseData,
): ProjectExpense {
  const keys = raw.projectToKeys.get(projectName) ?? [];
  let orDedicated = 0;
  let orShared = 0;
  const sharedKeyDetails: SharedKeyDetail[] = [];
  let anyDedicated = false;
  let anyShared = false;

  if (scope === "all_time") {
    for (const k of keys) {
      const keySpend = raw.orKeySpend.get(k) ?? 0;
      const sharedProjects = raw.keyToProjects.get(k) ?? [projectName];
      if (sharedProjects.length === 1) {
        orDedicated += keySpend;
        anyDedicated = true;
      } else {
        anyShared = true;
        const detail = allocateSharedKey(
          projectName, k, keySpend, sharedProjects,
          raw.invocationByProjectKey, raw.invocationByKey,
        );
        orShared += detail.thisProjectSpend;
        sharedKeyDetails.push(detail);
      }
    }
  } else {
    // Date-scoped: sum invocation log cost_usd directly
    for (const k of keys) {
      const sharedProjects = raw.keyToProjects.get(k) ?? [projectName];
      const thisProjectCost = raw.invocationByProjectKey.get(`${projectName}::${k}`) ?? 0;
      if (sharedProjects.length === 1) {
        orDedicated += thisProjectCost;
        anyDedicated = true;
      } else {
        orShared += thisProjectCost;
        anyShared = true;
      }
    }
  }

  let toolsDedicated = 0;
  let toolsShared = 0;
  for (const [vendor, projects] of raw.toolToProjects) {
    if (!projects.includes(projectName)) continue;
    const vendorSpend = raw.attributableVendorTotals.get(vendor) ?? 0;
    if (projects.length === 1) toolsDedicated += vendorSpend;
    else toolsShared += vendorSpend / projects.length;
  }

  let orAllocationMethod: ProjectExpense["orAllocationMethod"] = "none";
  if (keys.length > 0) {
    if (!anyShared) orAllocationMethod = "dedicated";
    else if (sharedKeyDetails.some((d) => d.allocationMethod === "volume")) orAllocationMethod = "volume";
    else orAllocationMethod = "equal";
  }

  const total = Math.round((orDedicated + orShared + toolsDedicated + toolsShared) * 100) / 100;

  return {
    projectName,
    orDedicated:   Math.round(orDedicated   * 100) / 100,
    orShared:      Math.round(orShared       * 100) / 100,
    orAllocationMethod,
    toolsDedicated: Math.round(toolsDedicated * 100) / 100,
    toolsShared:    Math.round(toolsShared    * 100) / 100,
    invoicesDirect: 0,
    total,
    sharedKeyDetails,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getProjectExpense(
  projectName: string,
  scope: ExpenseScope = "all_time",
): Promise<ProjectExpense> {
  const raw = await loadRawData(scope);
  return computeProjectExpense(projectName, scope, raw);
}

export async function getAllProjectsExpense(
  scope: ExpenseScope = "all_time",
): Promise<Map<string, ProjectExpense>> {
  const raw = await loadRawData(scope);
  const result = new Map<string, ProjectExpense>();
  for (const p of raw.projects) {
    result.set(p.name, computeProjectExpense(p.name, scope, raw));
  }
  return result;
}

export async function getUnallocatedSpend(
  scope: ExpenseScope = "all_time",
): Promise<UnallocatedSpend> {
  const cacheKey = `unallocated:${scope}`;
  const cached = getCache<UnallocatedSpend>(cacheKey);
  if (cached) return cached;

  const raw = await loadRawData(scope);

  let unlinkedOrKeys = 0;
  for (const [k, spend] of raw.orKeySpend) {
    if (!raw.keyToProjects.has(k)) unlinkedOrKeys += spend;
  }

  const invoicesUnallocated = [...raw.unallocatedInvoiceVendors.values()].reduce((s, v) => s + v, 0);

  const topSharedInfraVendors = [...raw.sharedInfraByVendor.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([vendor, amount]) => ({ vendor, amount: Math.round(amount * 100) / 100 }));

  const topUnallocatedInvoiceVendors = [...raw.unallocatedInvoiceVendors.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([vendor, amount]) => ({ vendor, amount: Math.round(amount * 100) / 100 }));

  const result: UnallocatedSpend = {
    sharedInfra:            Math.round(raw.sharedInfraTotal * 100) / 100,
    unlinkedOrKeys:         Math.round(unlinkedOrKeys        * 100) / 100,
    invoicesUnallocated:    Math.round(invoicesUnallocated   * 100) / 100,
    total:                  Math.round((raw.sharedInfraTotal + unlinkedOrKeys + invoicesUnallocated) * 100) / 100,
    topSharedInfraVendors,
    topUnallocatedInvoiceVendors,
  };

  setCache(cacheKey, result);
  return result;
}
