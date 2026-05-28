import { NextResponse } from "next/server";
import { STATIC_PROJECTS } from "@/lib/sheets";
import { supabase } from "@/lib/supabase";
import { fetchOrKeySpend } from "@/lib/orKeySpend";
import { getHiddenToolKeys, hiddenOrKeyNames } from "@/lib/hidden-tools";
import { Project } from "@/types";

async function getProjectsFromDB(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("agents_portfolio")
    .select("agents_projects, description, llms, llm_accounts, status, openrouter_api_key")
    .limit(500);

  if (error) {
    console.error("[agents_portfolio] fetch error:", error.message);
    return STATIC_PROJECTS;
  }
  if (!data) return STATIC_PROJECTS;

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

    return {
      name: row.agents_projects ?? "",
      description: row.description ?? "",
      timeline: null,
      llms: llmNames.map((entry: string) => {
        const parts = entry.split(" ");
        return { provider: parts[0], model: parts.slice(1).join(" "), owner: row.llm_accounts ?? "" };
      }),
      services: [],
      status: row.status ?? null,
      totalSpend: null,
      openrouter_api_key: row.openrouter_api_key ?? null,
    };
  });
}

export async function GET() {
  const [projects, orKeySpend, hiddenKeys] = await Promise.all([
    getProjectsFromDB(),
    fetchOrKeySpend(),
    getHiddenToolKeys(),
  ]);
  // Lowercase set of hidden OR key names for comparison against lowercased portfolio keys
  const hiddenOrKeys = new Set([...hiddenOrKeyNames(hiddenKeys)].map((k) => k.toLowerCase()));

  // key (lowercase) → project names that reference it (to detect shared keys)
  const keyToProjects = new Map<string, string[]>();
  for (const p of projects) {
    if (!p.openrouter_api_key) continue;
    for (const k of (p.openrouter_api_key as string).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
      const arr = keyToProjects.get(k) ?? [];
      if (!arr.includes(p.name)) arr.push(p.name);
      keyToProjects.set(k, arr);
    }
  }

  const enriched = projects.map((p) => {
    if (!p.openrouter_api_key) {
      return { ...p, totalSpend: null, spendBasis: "none" as const };
    }

    const keys = (p.openrouter_api_key as string).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    let total = 0;
    let anyResolved = false;
    let anyShared = false;

    for (const k of keys) {
      if (hiddenOrKeys.has(k)) continue;
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

  return NextResponse.json({ projects: enriched });
}
