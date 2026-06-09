import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { OutcomeMetricRow } from "@/types";

function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const body = await req.json().catch(() => ({}));
  const { metric_key, value, date, notes } = body as {
    metric_key?: string;
    value?: number;
    date?: string;
    notes?: string;
  };

  if (!metric_key || value == null || !date) {
    return NextResponse.json(
      { error: "metric_key, value, and date are required" },
      { status: 400 },
    );
  }

  const supabase = serviceClient();
  const { data, error } = await supabase
    .from("project_outcome_metrics")
    .upsert(
      { project_id: projectId, metric_key, value, date, source: "manual", notes: notes ?? null },
      { onConflict: "project_id,metric_key,date" },
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data as OutcomeMetricRow);
}
