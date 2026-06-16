export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAllHubspotEnrichedContacts } from "@/lib/hubspot-enrichment-outcomes";

export async function GET(request: Request) {
  const secret = request.headers.get("x-sync-secret");
  if (secret !== process.env.OUTCOMES_SYNC_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const allContacts = await getAllHubspotEnrichedContacts();

  const timestamps = allContacts
    .map((c) => c.createdate)
    .filter(Boolean)
    .map((d) => new Date(d).getTime())
    .filter((t) => !isNaN(t));

  const earliestDate = timestamps.length > 0
    ? new Date(Math.min(...timestamps)).toISOString().split("T")[0]
    : null;

  return NextResponse.json({
    earliest_date:   earliestDate,
    total_contacts:  allContacts.length,
  });
}
