export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function POST() {
  const secret = process.env.OUTCOMES_SYNC_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "OUTCOMES_SYNC_SECRET not set" }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  const res = await fetch(`${baseUrl}/api/outcomes/sync-enrichment`, {
    method: "GET",
    headers: { "x-sync-secret": secret },
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
