export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function POST() {
  const secret  = process.env.OUTCOMES_SYNC_SECRET;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  if (!secret) {
    return NextResponse.json({ error: "OUTCOMES_SYNC_SECRET not set" }, { status: 500 });
  }

  const res = await fetch(`${baseUrl}/api/outcomes/release-lock`, {
    method:  "POST",
    headers: { "x-sync-secret": secret },
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
