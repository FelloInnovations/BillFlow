export const dynamic = "force-dynamic";

import { ProjectsClient } from "@/components/projects/ProjectsClient";
import { Project } from "@/types";
import { supabase } from "@/lib/supabase";
import { fetchOrKeySpend } from "@/lib/orKeySpend";
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

async function getProjects(): Promise<{ projects: Project[]; maxSpend: number }> {
  const { data: portfolioData, error: portfolioErr } = await supabase
    .from("agents_portfolio")
    .select("agents_projects, description, llms, llm_accounts, status, openrouter_api_key")
    .limit(500);

  if (portfolioErr) console.error("[projects] portfolio error:", portfolioErr.message);

  const portfolioRows = portfolioData ?? [];

  const orKeySpend = await fetchOrKeySpend();

  // Deduplicate by project name
  const seenNames = new Set<string>();
  const uniqueRows = portfolioRows.filter((row) => {
    const key = (row.agents_projects ?? "").trim().toLowerCase();
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });

  const rawProjects: Project[] = uniqueRows.map((row) => ({
    name: row.agents_projects ?? "Untitled",
    description: row.description ?? "",
    timeline: null,
    status: row.status ?? null,
    llms: row.llms
      ? row.llms.split(",").map((s: string) => s.trim()).filter((s: string) => s && s.toLowerCase() !== "na")
          .map((entry: string) => {
            const parts = entry.trim().split(" ");
            return { provider: parts[0] ?? entry, model: parts.slice(1).join(" "), owner: row.llm_accounts ?? "" };
          })
      : [],
    services: [],
    totalSpend: null,
    openrouter_api_key: row.openrouter_api_key ?? null,
  }));

  // key (lowercase) → project names sharing that key (for shared-key detection)
  const keyToProjects = new Map<string, string[]>();
  for (const p of rawProjects) {
    if (!p.openrouter_api_key) continue;
    for (const k of (p.openrouter_api_key as string).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
      const arr = keyToProjects.get(k) ?? [];
      if (!arr.includes(p.name)) arr.push(p.name);
      keyToProjects.set(k, arr);
    }
  }

  const projects = rawProjects.map((p) => {
    if (!p.openrouter_api_key) {
      return { ...p, totalSpend: null, spendBasis: "none" as const };
    }

    const keys = (p.openrouter_api_key as string).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    let total = 0;
    let anyResolved = false;
    let anyShared = false;

    for (const k of keys) {
      const spend = orKeySpend.get(k);
      if (spend !== undefined) {
        const shareCount = keyToProjects.get(k)?.length ?? 1;
        if (shareCount > 1) anyShared = true;
        total += spend / Math.max(1, shareCount);
        anyResolved = true;
      }
    }

    if (!anyResolved) {
      return { ...p, totalSpend: null, spendBasis: "none" as const };
    }

    const totalSpend = Math.round(total * 100) / 100;
    const spendBasis = anyShared ? ("shared_key" as const) : ("metered" as const);
    return { ...p, totalSpend, spendBasis };
  });

  const maxSpend = Math.max(0, ...projects.map((p) => p.totalSpend ?? 0));
  return { projects, maxSpend };
}

export default async function ProjectsPage() {
  const [{ projects, maxSpend }, arthurLastSynced] = await Promise.all([
    getProjects(),
    getArthurLastSynced(),
  ]);
  const sorted = [...projects].sort((a, b) => (b.totalSpend ?? -1) - (a.totalSpend ?? -1));

  return (
    <ProjectsClient
      initialProjects={sorted}
      initialMaxSpend={maxSpend}
      arthurLastSynced={arthurLastSynced}
    />
  );
}
