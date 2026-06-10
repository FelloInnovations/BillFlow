import { NextRequest, NextResponse } from "next/server";

const BASE = "https://api.hubapi.com";

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.HUBSPOT_PRIVATE_TOKEN}`,
    "Content-Type": "application/json",
  };
}

async function hsGet(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  return res.json();
}

async function hsPost(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-sync-secret");
  if (secret !== process.env.OUTCOMES_SYNC_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 1. Sample meetings from the portal (no contact filter)
  const meetingsData = await hsGet(
    "/crm/v3/objects/meetings?properties=hs_meeting_outcome,hs_timestamp&limit=100",
  );
  const distinctMeetingOutcomes = [
    ...new Set(
      (meetingsData.results ?? []).map(
        (m: { properties: Record<string, string> }) => m.properties?.hs_meeting_outcome ?? "(null)",
      ),
    ),
  ];

  // 2. Sample deals from the portal (no contact filter)
  const dealsData = await hsGet(
    "/crm/v3/objects/deals?properties=dealstage,closedate&limit=100",
  );
  const distinctDealStages = [
    ...new Set(
      (dealsData.results ?? []).map(
        (d: { properties: Record<string, string> }) => d.properties?.dealstage ?? "(null)",
      ),
    ),
  ];

  // 3. Contacts with current_arr__sync_ set
  const arrData = await hsPost("/crm/v3/objects/contacts/search", {
    filterGroups: [{ filters: [{ propertyName: "current_arr__sync_", operator: "HAS_PROPERTY" }] }],
    properties: ["current_arr__sync_", "email"],
    limit: 3,
  });

  // 4. AI referral contacts
  const aiContactsData = await hsPost("/crm/v3/objects/contacts/search", {
    filterGroups: [{ filters: [{ propertyName: "hs_analytics_source", operator: "EQ", value: "AI_REFERRALS" }] }],
    properties: ["email", "createdate"],
    limit: 100,
  });
  const aiContactIds: string[] = (aiContactsData.results ?? []).map(
    (c: { id: string }) => c.id,
  );

  // 5. Check meeting associations for AI-referral contacts
  let aiMeetingIds: string[]  = [];
  let sampleMeetings: unknown[] = [];
  if (aiContactIds.length > 0) {
    const meetingAssoc = await hsPost(
      "/crm/v4/associations/contacts/meetings/batch/read",
      { inputs: aiContactIds.map((id) => ({ id })) },
    );
    aiMeetingIds = Array.from(new Set(
      (meetingAssoc.results ?? []).flatMap(
        (r: { to?: { toObjectId: string }[] }) => (r.to ?? []).map((t) => t.toObjectId),
      ),
    )) as string[];
    if (aiMeetingIds.length > 0) {
      const mData = await hsPost("/crm/v3/objects/meetings/batch/read", {
        inputs: aiMeetingIds.slice(0, 10).map((id) => ({ id })),
        properties: ["hs_meeting_outcome", "createdate", "hs_timestamp"],
      });
      sampleMeetings = (mData.results ?? []).map(
        (m: { id: string; properties: Record<string, string> }) => ({
          id: m.id,
          outcome: m.properties.hs_meeting_outcome,
          createdate: m.properties.createdate,
          hs_timestamp: m.properties.hs_timestamp,
        }),
      );
    }
  }

  // 6. Check deal associations for AI-referral contacts
  let aiDealIds: string[] = [];
  let sampleDeals: unknown[] = [];
  if (aiContactIds.length > 0) {
    const dealAssoc = await hsPost(
      "/crm/v4/associations/contacts/deals/batch/read",
      { inputs: aiContactIds.map((id) => ({ id })) },
    );
    aiDealIds = Array.from(new Set(
      (dealAssoc.results ?? []).flatMap(
        (r: { to?: { toObjectId: string }[] }) => (r.to ?? []).map((t) => t.toObjectId),
      ),
    )) as string[];
    if (aiDealIds.length > 0) {
      const dData = await hsPost("/crm/v3/objects/deals/batch/read", {
        inputs: aiDealIds.slice(0, 10).map((id) => ({ id })),
        properties: ["dealstage", "closedate", "dealname"],
      });
      sampleDeals = (dData.results ?? []).map(
        (d: { id: string; properties: Record<string, string> }) => ({
          id: d.id,
          stage: d.properties.dealstage,
          closedate: d.properties.closedate,
          name: d.properties.dealname,
        }),
      );
    }
  }

  return NextResponse.json({
    ai_referral_contacts: aiContactIds.length,
    portal_meetings: {
      total: meetingsData.total ?? 0,
      distinct_outcomes: distinctMeetingOutcomes,
      sample: (meetingsData.results ?? []).slice(0, 3).map(
        (m: { id: string; properties: Record<string, string> }) => ({
          id: m.id,
          outcome: m.properties?.hs_meeting_outcome,
        }),
      ),
    },
    portal_deals: {
      total: dealsData.total ?? 0,
      distinct_stages: distinctDealStages,
      sample: (dealsData.results ?? []).slice(0, 3).map(
        (d: { id: string; properties: Record<string, string> }) => ({
          id: d.id,
          stage: d.properties?.dealstage,
        }),
      ),
    },
    arr_property: {
      contacts_with_arr: arrData.total ?? 0,
      sample: (arrData.results ?? []).map(
        (c: { id: string; properties: Record<string, string> }) => ({
          id: c.id,
          email: c.properties?.email,
          arr: c.properties?.current_arr__sync_,
        }),
      ),
    },
    ai_referral_associations: {
      meeting_ids_found: aiMeetingIds.length,
      deal_ids_found: aiDealIds.length,
      sample_meetings: sampleMeetings,
      sample_deals: sampleDeals,
    },
  });
}
