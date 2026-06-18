import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.WEEKLY_REPORT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "WEEKLY_REPORT_SECRET not configured" }, { status: 500 });
  }

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const res  = await fetch(`${base}/api/email/weekly-report`, {
    headers: { "x-report-secret": secret },
  });

  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}
