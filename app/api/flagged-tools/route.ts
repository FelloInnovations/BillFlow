import { NextResponse } from "next/server";
import { computeFlaggedTools } from "@/lib/flagged-tools";

export async function GET() {
  const data = await computeFlaggedTools();
  return NextResponse.json(data);
}
