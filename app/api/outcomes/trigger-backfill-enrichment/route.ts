export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { triggerBackfill } from "@/lib/outcomes-trigger";

export async function POST(req: NextRequest) {
  const { from, to } = await req.json().catch(() => ({}));
  const { body, status } = await triggerBackfill("enrichment", from, to);
  return NextResponse.json(body, { status });
}

// GET ?force=true — releases the backfill lock (for crash recovery)
export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "true";
  if (!force) {
    return NextResponse.json({ error: "use POST to start backfill; GET ?force=true to release lock" }, { status: 400 });
  }

  const base   = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const secret = process.env.OUTCOMES_SYNC_SECRET ?? "";

  const res = await fetch(`${base}/api/outcomes/backfill-enrichment`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "x-sync-secret": secret },
    body:    JSON.stringify({ force: true }),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
