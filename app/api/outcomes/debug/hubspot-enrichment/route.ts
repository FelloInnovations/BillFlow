export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

const BASE = "https://api.hubapi.com";

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.HUBSPOT_PRIVATE_TOKEN}`,
    "Content-Type": "application/json",
  };
}

async function hsPost(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const status = res.status;
  const json = await res.json().catch(() => null);
  return { status, body: json };
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-sync-secret");
  if (secret !== process.env.OUTCOMES_SYNC_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Test 1: HAS_PROPERTY with createdate in properties
  const payload1 = {
    filterGroups: [{ filters: [{ propertyName: "mad_id", operator: "HAS_PROPERTY" }] }],
    properties: ["mad_id", "createdate"],
    limit: 1,
  };
  console.error("Test 1 payload:", JSON.stringify(payload1));
  const result1 = await hsPost("/crm/v3/objects/contacts/search", payload1);

  // Test 2: HAS_PROPERTY — mad_id only in properties
  const payload2 = {
    filterGroups: [{ filters: [{ propertyName: "mad_id", operator: "HAS_PROPERTY" }] }],
    properties: ["mad_id"],
    limit: 1,
  };
  console.error("Test 2 payload:", JSON.stringify(payload2));
  const result2 = await hsPost("/crm/v3/objects/contacts/search", payload2);

  // Test 3: IS_KNOWN operator
  const payload3 = {
    filterGroups: [{ filters: [{ propertyName: "mad_id", operator: "IS_KNOWN" }] }],
    properties: ["mad_id"],
    limit: 1,
  };
  console.error("Test 3 payload:", JSON.stringify(payload3));
  const result3 = await hsPost("/crm/v3/objects/contacts/search", payload3);

  // Test 4: HAS_PROPERTY + createdate GTE/LTE (mimics getAgentsPushedToHubspot)
  const now = Date.now();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const payload4 = {
    filterGroups: [{
      filters: [
        { propertyName: "mad_id", operator: "HAS_PROPERTY" },
        { propertyName: "createdate", operator: "GTE", value: String(monthStart) },
        { propertyName: "createdate", operator: "LTE", value: String(now) },
      ],
    }],
    properties: ["mad_id"],
    limit: 1,
  };
  console.error("Test 4 payload:", JSON.stringify(payload4));
  const result4 = await hsPost("/crm/v3/objects/contacts/search", payload4);

  return NextResponse.json({
    test1_has_property_with_createdate_in_props: result1,
    test2_has_property_mad_id_only:              result2,
    test3_is_known_operator:                     result3,
    test4_has_property_plus_date_range_filters:  result4,
  });
}
