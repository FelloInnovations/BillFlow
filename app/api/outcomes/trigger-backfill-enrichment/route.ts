export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { triggerBackfill } from "@/lib/outcomes-trigger";

export async function POST(req: NextRequest) {
  const { from, to } = await req.json().catch(() => ({}));
  const { body, status } = await triggerBackfill("enrichment", from, to);
  return NextResponse.json(body, { status });
}
