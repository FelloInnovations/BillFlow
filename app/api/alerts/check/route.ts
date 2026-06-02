import { NextResponse } from "next/server";

export async function POST() {
  const supabaseUrl  = process.env.SUPABASE_URL;
  const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set" },
      { status: 500 }
    );
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/guardrail-check`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
  });

  const json = await res.json().catch(() => ({ error: "Invalid response from edge function" }));
  return NextResponse.json(json, { status: res.ok ? 200 : 500 });
}
