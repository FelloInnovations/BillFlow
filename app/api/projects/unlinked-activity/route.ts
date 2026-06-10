export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getUnlinkedInvocationActivity } from "@/lib/project-expense";

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.OUTCOMES_SYNC_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await getUnlinkedInvocationActivity();
  return NextResponse.json(data);
}
