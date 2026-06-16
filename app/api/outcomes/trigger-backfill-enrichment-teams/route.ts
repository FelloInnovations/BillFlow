export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { from, to } = await req.json().catch(() => ({}));
  if (!from || !to) {
    return NextResponse.json({ error: "provide from and to (YYYY-MM-DD)" }, { status: 400 });
  }

  const base   = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const secret = process.env.OUTCOMES_SYNC_SECRET ?? "";

  const res = await fetch(`${base}/api/outcomes/backfill-enrichment-teams`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "x-sync-secret": secret },
    body:    JSON.stringify({ from, to }),
  });
  const body = await res.json().catch(() => ({}));
  return NextResponse.json(body, { status: res.status });
}
