import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET() {
  const { data, error } = await serviceClient()
    .from("agents_portfolio")
    .select("agents_projects");

  if (error) return NextResponse.json({ names: [] });

  const seen = new Set<string>();
  const names: string[] = [];
  for (const row of data ?? []) {
    const name = ((row.agents_projects as string) ?? "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    names.push(name);
  }
  return NextResponse.json({ names: names.sort() });
}
