export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAllHubspotEnrichedContacts } from "@/lib/hubspot-enrichment-outcomes";
import { getClosedWonStageIds } from "@/lib/hubspot-outcomes";

const BASE = "https://api.hubapi.com";

function authHeader() {
  return { Authorization: `Bearer ${process.env.HUBSPOT_PRIVATE_TOKEN}` };
}

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function GET(request: Request) {
  const secret = request.headers.get("x-sync-secret");
  if (secret !== process.env.OUTCOMES_SYNC_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format"); // 'json' or 'csv'

  // Step 1 — All enriched contacts (null mad_ids already excluded by the cache)
  const allContacts = await getAllHubspotEnrichedContacts();
  console.log(`[enrichment-contacts] ${allContacts.length} contacts to process`);

  const contactIds = allContacts.map((c) => c.id);

  type PipelineEntry = { demosBooked: number; demosHeld: number; dealsClosedWon: number; arr: number };
  const pipelineData: Record<string, PipelineEntry> = {};
  for (const c of allContacts) {
    pipelineData[c.id] = { demosBooked: 0, demosHeld: 0, dealsClosedWon: 0, arr: c.arrValue };
  }

  // Step 2a — Fetch associated meeting IDs (contacts → meetings)
  const contactMeetingMap: Record<string, string[]> = {};
  const allMeetingIds: string[] = [];

  for (let i = 0; i < contactIds.length; i += 100) {
    const batch = contactIds.slice(i, i + 100);
    const res = await fetch(`${BASE}/crm/v4/associations/contacts/meetings/batch/read`, {
      method:  "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body:    JSON.stringify({ inputs: batch.map((id) => ({ id })) }),
    });

    if (!res.ok) {
      console.error(`[enrichment-contacts] meetings assoc batch ${i} failed: ${res.status}`);
      await delay(500);
      continue;
    }

    const data = await res.json() as { results?: { from?: { id: string }; to?: { id: string }[] }[] };
    for (const result of data.results ?? []) {
      const contactId = result.from?.id;
      if (!contactId) continue;
      const mids = (result.to ?? []).map((t) => t.id);
      contactMeetingMap[contactId] = mids;
      allMeetingIds.push(...mids);
      if (pipelineData[contactId]) pipelineData[contactId].demosBooked = mids.length;
    }

    if (i + 100 < contactIds.length) await delay(150);
    if (i % 1000 === 0 && i > 0) {
      console.log(`[enrichment-contacts] meetings assoc: ${i}/${contactIds.length} contacts done`);
    }
  }

  // Step 2b — Fetch meeting outcomes
  const uniqueMeetingIds = [...new Set(allMeetingIds)];
  console.log(`[enrichment-contacts] fetching outcomes for ${uniqueMeetingIds.length} meetings`);

  const meetingOutcomes: Record<string, string> = {};
  for (let i = 0; i < uniqueMeetingIds.length; i += 100) {
    const batch = uniqueMeetingIds.slice(i, i + 100);
    const res = await fetch(`${BASE}/crm/v3/objects/meetings/batch/read`, {
      method:  "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body:    JSON.stringify({
        properties: ["hs_meeting_outcome"],
        inputs:     batch.map((id) => ({ id })),
      }),
    });

    if (!res.ok) {
      console.error(`[enrichment-contacts] meeting outcomes batch ${i} failed: ${res.status}`);
      await delay(500);
      continue;
    }

    const data = await res.json() as { results?: { id: string; properties?: Record<string, string> }[] };
    for (const meeting of data.results ?? []) {
      meetingOutcomes[meeting.id] = meeting.properties?.hs_meeting_outcome ?? "";
    }

    if (i + 100 < uniqueMeetingIds.length) await delay(150);
  }

  // Map COMPLETED meetings back to contacts
  for (const [contactId, mids] of Object.entries(contactMeetingMap)) {
    if (pipelineData[contactId]) {
      pipelineData[contactId].demosHeld = mids.filter((mid) => meetingOutcomes[mid] === "COMPLETED").length;
    }
  }

  // Step 2c — Fetch associated deals + closed-won stage IDs
  const closedWonIds = new Set(await getClosedWonStageIds());

  type DealResult = { id: string; properties?: { dealstage?: string; amount?: string } };
  const contactDealMap: Record<string, string[]> = {};
  const allDealIds: string[] = [];

  for (let i = 0; i < contactIds.length; i += 100) {
    const batch = contactIds.slice(i, i + 100);
    const res = await fetch(`${BASE}/crm/v4/associations/contacts/deals/batch/read`, {
      method:  "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body:    JSON.stringify({ inputs: batch.map((id) => ({ id })) }),
    });

    if (!res.ok) {
      console.error(`[enrichment-contacts] deals assoc batch ${i} failed: ${res.status}`);
      await delay(500);
      continue;
    }

    const data = await res.json() as { results?: { from?: { id: string }; to?: { id: string }[] }[] };
    for (const result of data.results ?? []) {
      const contactId = result.from?.id;
      if (!contactId) continue;
      const dids = (result.to ?? []).map((t) => t.id);
      contactDealMap[contactId] = dids;
      allDealIds.push(...dids);
    }

    if (i + 100 < contactIds.length) await delay(150);
    if (i % 1000 === 0 && i > 0) {
      console.log(`[enrichment-contacts] deals assoc: ${i}/${contactIds.length} contacts done`);
    }
  }

  // Fetch deal stages and amounts
  const uniqueDealIds = [...new Set(allDealIds)];
  console.log(`[enrichment-contacts] fetching ${uniqueDealIds.length} deals`);

  const dealData: Record<string, { stage: string; amount: number }> = {};
  for (let i = 0; i < uniqueDealIds.length; i += 100) {
    const batch = uniqueDealIds.slice(i, i + 100);
    const res = await fetch(`${BASE}/crm/v3/objects/deals/batch/read`, {
      method:  "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body:    JSON.stringify({
        properties: ["dealstage", "amount"],
        inputs:     batch.map((id) => ({ id })),
      }),
    });

    if (!res.ok) {
      console.error(`[enrichment-contacts] deals batch ${i} failed: ${res.status}`);
      await delay(500);
      continue;
    }

    const data = await res.json() as { results?: DealResult[] };
    for (const deal of data.results ?? []) {
      dealData[deal.id] = {
        stage:  deal.properties?.dealstage ?? "",
        amount: parseFloat(deal.properties?.amount ?? "0") || 0,
      };
    }

    if (i + 100 < uniqueDealIds.length) await delay(150);
  }

  // Map closed-won deals back to contacts
  for (const [contactId, dids] of Object.entries(contactDealMap)) {
    if (!pipelineData[contactId]) continue;
    const wonDeals = dids.filter((did) => closedWonIds.has(dealData[did]?.stage ?? ""));
    pipelineData[contactId].dealsClosedWon = wonDeals.length;
  }

  // Step 3 — Build report
  const report = allContacts.map((contact) => ({
    hubspot_id:   contact.id,
    mad_id:       contact.madId,
    createdate:   contact.createdate,
    arr:          contact.arrValue,
    demos_booked: pipelineData[contact.id]?.demosBooked ?? 0,
    demos_held:   pipelineData[contact.id]?.demosHeld   ?? 0,
    deals:        pipelineData[contact.id]?.dealsClosedWon ?? 0,
  }));

  // Step 4 — Summary
  const summary = {
    total_contacts:               report.length,
    contacts_with_demos_booked:   report.filter((c) => c.demos_booked > 0).length,
    contacts_with_demos_held:     report.filter((c) => c.demos_held   > 0).length,
    contacts_with_deals:          report.filter((c) => c.deals        > 0).length,
    contacts_with_arr:            report.filter((c) => c.arr          > 0).length,
    total_demos_booked:           report.reduce((s, c) => s + c.demos_booked, 0),
    total_demos_held:             report.reduce((s, c) => s + c.demos_held,   0),
    total_deals:                  report.reduce((s, c) => s + c.deals,        0),
    total_arr:                    report.reduce((s, c) => s + c.arr,          0),
  };

  console.log(`[enrichment-contacts] complete`, JSON.stringify(summary));

  // Step 5 — Return JSON or CSV
  if (format === "csv") {
    const headers = "hubspot_id,mad_id,createdate,arr,demos_booked,demos_held,deals";
    const rows = report.map((c) =>
      `${c.hubspot_id},${c.mad_id},${c.createdate},${c.arr},${c.demos_booked},${c.demos_held},${c.deals}`,
    );
    return new Response([headers, ...rows].join("\n"), {
      headers: {
        "Content-Type":        "text/csv",
        "Content-Disposition": 'attachment; filename="enrichment-contacts-all-time.csv"',
      },
    });
  }

  return NextResponse.json({ summary, contacts: report });
}
