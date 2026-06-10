import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { from, to } = await req.json().catch(() => ({}));
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const res = await fetch(`${base}/api/outcomes/backfill`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-sync-secret": process.env.OUTCOMES_SYNC_SECRET ?? "",
    },
    body: JSON.stringify({ from, to }),
  });
  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}
