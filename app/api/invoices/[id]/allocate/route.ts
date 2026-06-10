import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const VALID_COST_TYPES = ["project_specific", "shared_infrastructure", "shared_tooling", "unallocated"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { cost_type, project_id } = body;

  if (!cost_type || !VALID_COST_TYPES.includes(cost_type)) {
    return NextResponse.json({ error: "Invalid cost_type" }, { status: 400 });
  }
  if (cost_type === "project_specific" && !project_id) {
    return NextResponse.json({ error: "project_id required for project_specific" }, { status: 400 });
  }

  const { data, error } = await serviceClient()
    .from("financial_records")
    .update({
      cost_type,
      project_id: cost_type === "project_specific" ? project_id : null,
      allocated_at: new Date().toISOString(),
      allocated_by: "manual",
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
