export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAllProjectsExpense, clearExpenseCache } from "@/lib/project-expense";

function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.OUTCOMES_SYNC_SECRET;
  if (!secret) return true; // no secret configured → open
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

// ── GET — portfolio data + reconciliation ─────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = serviceClient();

  const [{ data: portfolioRows, error }, expenseMap] = await Promise.all([
    supabase
      .from("agents_portfolio")
      .select("agents_projects, status, openrouter_api_key, project_name_aliases")
      .order("row_number", { ascending: true }),
    getAllProjectsExpense("all_time"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Deduplicate by project name
  const seenNames = new Set<string>();
  const allProjects = (portfolioRows ?? [])
    .filter((row) => {
      const n = ((row.agents_projects as string) ?? "").trim().toLowerCase();
      if (!n || seenNames.has(n)) return false;
      seenNames.add(n);
      return true;
    })
    .map((row) => ({
      name: (row.agents_projects as string) ?? "",
      status: (row.status as string | null) ?? null,
      openrouter_api_key: (row.openrouter_api_key as string | null) ?? null,
      aliases: (row.project_name_aliases as string[] | null) ?? [],
    }));

  const projectsMissingKey = allProjects.filter(
    (p) => !p.openrouter_api_key || p.openrouter_api_key.trim() === "",
  );

  // Reconciliation: total snapshot spend vs attributed
  const totalSnapshotSpend = [...expenseMap.values()]
    .reduce((s, e) => s + e.breakdown.openrouter.value, 0);

  return NextResponse.json({
    all_projects: allProjects,
    projects_missing_key: projectsMissingKey,
    reconciliation: {
      total_snapshot_spend: Math.round(totalSnapshotSpend * 100) / 100,
    },
  });
}

// ── PATCH — set OR key or append alias ───────────────────────────────────────
export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.project_name) {
    return NextResponse.json({ error: "project_name required" }, { status: 400 });
  }

  const { project_name, openrouter_api_key, add_alias, remove_alias } = body as {
    project_name: string;
    openrouter_api_key?: string;
    add_alias?: string;
    remove_alias?: string;
  };

  const supabase = serviceClient();

  if (openrouter_api_key !== undefined) {
    const { error } = await supabase
      .from("agents_portfolio")
      .update({ openrouter_api_key: openrouter_api_key.trim() || null })
      .eq("agents_projects", project_name);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (add_alias !== undefined || remove_alias !== undefined) {
    const { data: row, error: fetchErr } = await supabase
      .from("agents_portfolio")
      .select("project_name_aliases")
      .eq("agents_projects", project_name)
      .limit(1)
      .single();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    let aliases: string[] = (row?.project_name_aliases as string[] | null) ?? [];

    if (add_alias) {
      const trimmed = add_alias.trim();
      if (trimmed && !aliases.includes(trimmed)) {
        aliases = [...aliases, trimmed];
      }
    }

    if (remove_alias) {
      aliases = aliases.filter((a) => a !== remove_alias);
    }

    const { error: updateErr } = await supabase
      .from("agents_portfolio")
      .update({ project_name_aliases: aliases })
      .eq("agents_projects", project_name);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Bust the expense cache so the next page load reflects new keys/aliases
  clearExpenseCache();

  return NextResponse.json({ ok: true });
}
