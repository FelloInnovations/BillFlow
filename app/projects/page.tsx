export const dynamic = "force-dynamic";

import { ProjectsClient } from "@/components/projects/ProjectsClient";
import { Project } from "@/types";
import { supabase } from "@/lib/supabase";
import { getAllProjectsExpense, getUnallocatedSpend, UnallocatedSpend } from "@/lib/project-expense";
import { createClient } from "@supabase/supabase-js";

function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function getArthurLastSynced(): Promise<string | null> {
  try {
    const { data } = await serviceClient()
      .from("project_outcome_metrics")
      .select("created_at")
      .eq("project_id", "arthur")
      .order("created_at", { ascending: false })
      .limit(1);
    return data?.[0]?.created_at ?? null;
  } catch {
    return null;
  }
}

async function getProjects(): Promise<{
  projects: Project[];
  maxSpend: number;
  unallocated: UnallocatedSpend;
}> {
  const { data: portfolioData, error: portfolioErr } = await supabase
    .from("agents_portfolio")
    .select("agents_projects, description, llms, llm_accounts, status, openrouter_api_key")
    .limit(500);

  if (portfolioErr) console.error("[projects] portfolio error:", portfolioErr.message);

  const portfolioRows = portfolioData ?? [];

  const [expenseMap, unallocated] = await Promise.all([
    getAllProjectsExpense("all_time"),
    getUnallocatedSpend("all_time"),
  ]);

  const seenNames = new Set<string>();
  const uniqueRows = portfolioRows.filter((row) => {
    const key = (row.agents_projects ?? "").trim().toLowerCase();
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });

  const projects: Project[] = uniqueRows.map((row) => {
    const name = row.agents_projects ?? "Untitled";
    const expense = expenseMap.get(name);

    const llms = row.llms
      ? row.llms.split(",").map((s: string) => s.trim()).filter((s: string) => s && s.toLowerCase() !== "na")
          .map((entry: string) => {
            const parts = entry.trim().split(" ");
            return { provider: parts[0] ?? entry, model: parts.slice(1).join(" "), owner: row.llm_accounts ?? "" };
          })
      : [];

    let totalSpend: number | null = null;
    let spendBasis: "metered" | "shared_key" | "none" | null = null;

    if (expense && expense.total > 0) {
      totalSpend = expense.total;
    }
    // spendBasis reflects whether a key is linked, not whether spend > 0
    const note = expense?.breakdown.openrouter.attributionNote ?? "none";
    spendBasis = note === "dedicated" ? "metered" : note === "none" ? "none" : "shared_key";

    return {
      name,
      description: row.description ?? "",
      timeline: null,
      status: row.status ?? null,
      llms,
      services: [],
      totalSpend,
      openrouter_api_key: row.openrouter_api_key ?? null,
      spendBasis,
      expenseBreakdown: expense ?? null,
    };
  });

  const maxSpend = Math.max(0, ...projects.map((p) => p.totalSpend ?? 0));
  return { projects, maxSpend, unallocated };
}

export default async function ProjectsPage() {
  const [{ projects, maxSpend, unallocated }, arthurLastSynced] = await Promise.all([
    getProjects(),
    getArthurLastSynced(),
  ]);
  const sorted = [...projects].sort((a, b) => (b.totalSpend ?? -1) - (a.totalSpend ?? -1));

  return (
    <ProjectsClient
      initialProjects={sorted}
      initialMaxSpend={maxSpend}
      initialUnallocated={unallocated}
      arthurLastSynced={arthurLastSynced}
    />
  );
}
