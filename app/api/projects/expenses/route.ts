export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAllProjectsExpense, getUnallocatedSpend, ExpenseScope } from "@/lib/project-expense";
import { Project } from "@/types";

const VALID_SCOPES = new Set<string>(["mtd", "last_30d", "last_3m", "last_6m", "last_12m", "all_time"]);

function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(req: NextRequest) {
  const scopeParam = req.nextUrl.searchParams.get("scope") ?? "all_time";
  const scope: ExpenseScope = VALID_SCOPES.has(scopeParam) ? (scopeParam as ExpenseScope) : "all_time";

  const supabase = serviceClient();

  const [
    { data: portfolioData },
    expenseMap,
    unallocated,
    arthurSync,
  ] = await Promise.all([
    supabase
      .from("agents_portfolio")
      .select("agents_projects, description, llms, llm_accounts, status, openrouter_api_key")
      .limit(500),
    getAllProjectsExpense(scope),
    getUnallocatedSpend(scope),
    supabase
      .from("project_outcome_metrics")
      .select("created_at")
      .eq("project_id", "arthur")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const portfolioRows = portfolioData ?? [];
  const arthurLastSynced: string | null = arthurSync.data?.[0]?.created_at ?? null;

  const seenNames = new Set<string>();
  const uniqueRows = portfolioRows.filter((row) => {
    const key = ((row.agents_projects as string) ?? "").trim().toLowerCase();
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });

  const projects: Project[] = uniqueRows.map((row) => {
    const name = (row.agents_projects as string) ?? "Untitled";
    const expense = expenseMap.get(name);

    const llms = row.llms
      ? (row.llms as string).split(",").map((s: string) => s.trim()).filter((s: string) => s && s.toLowerCase() !== "na")
          .map((entry: string) => {
            const parts = entry.trim().split(" ");
            return { provider: parts[0] ?? entry, model: parts.slice(1).join(" "), owner: (row.llm_accounts as string) ?? "" };
          })
      : [];

    let totalSpend: number | null = null;
    let spendBasis: "metered" | "shared_key" | "none" | null = null;

    if (expense && expense.total > 0) {
      totalSpend = expense.total;
      const method = expense.breakdown.openrouter.allocationMethod;
      spendBasis = method === "dedicated" ? "metered" : method === "none" ? "none" : "shared_key";
    } else {
      spendBasis = "none";
    }

    return {
      name,
      description: (row.description as string) ?? "",
      timeline: null,
      status: (row.status as string) ?? null,
      llms,
      services: [],
      totalSpend,
      openrouter_api_key: (row.openrouter_api_key as string) ?? null,
      spendBasis,
      expenseBreakdown: expense ?? null,
    };
  });

  const sorted = [...projects].sort((a, b) => (b.totalSpend ?? -1) - (a.totalSpend ?? -1));
  const maxSpend = Math.max(0, ...sorted.map((p) => p.totalSpend ?? 0));

  return NextResponse.json({ projects: sorted, maxSpend, unallocated, arthurLastSynced });
}
