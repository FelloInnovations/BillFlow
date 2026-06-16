export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET() {
  const base   = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const secret = process.env.OUTCOMES_SYNC_SECRET ?? "";

  const res = await fetch(`${base}/api/outcomes/enrichment-earliest-date`, {
    headers: { "x-sync-secret": secret },
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
