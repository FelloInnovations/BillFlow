const BASE = "https://api.hubapi.com";

function authHeader() {
  return { Authorization: `Bearer ${process.env.HUBSPOT_PRIVATE_TOKEN}` };
}

async function hsPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HubSpot POST ${path}: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

type HsContact = { id: string; properties: Record<string, string | null> };
type HsDeal    = { id: string; properties: Record<string, string | null> };
type HsMeeting = { id: string; properties: Record<string, string | null> };

const AI_REFERRALS = { propertyName: "hs_analytics_source", operator: "EQ", value: "AI Referrals" };

// Return total count from a single search request (uses HubSpot's total field)
async function countContacts(filters: unknown[]): Promise<number> {
  const data = await hsPost<{ total: number }>(
    "/crm/v3/objects/contacts/search",
    { filterGroups: [{ filters }], properties: [], limit: 1 },
  );
  return data.total ?? 0;
}

// Paginate through ALL contacts matching filters; optionally fetch extra properties
async function getAllContacts(
  filters: unknown[],
  properties: string[] = [],
): Promise<HsContact[]> {
  const results: HsContact[] = [];
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters }],
      properties,
      limit: 100,
    };
    if (after) body.after = after;
    const data = await hsPost<{
      results: HsContact[];
      paging?: { next?: { after: string } };
    }>("/crm/v3/objects/contacts/search", body);
    results.push(...(data.results ?? []));
    after = data.paging?.next?.after;
  } while (after);
  return results;
}

// Batch associations: returns Map<contactId, associatedObjectIds[]>
async function batchAssociationsMap(
  contactIds: string[],
  toType: "meetings" | "deals",
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  for (let i = 0; i < contactIds.length; i += 100) {
    const batch = contactIds.slice(i, i + 100);
    const data = await hsPost<{
      results: { from: { id: string }; to?: { toObjectId: string }[] }[];
    }>(`/crm/v4/associations/contacts/${toType}/batch/read`, {
      inputs: batch.map((id) => ({ id })),
    });
    for (const r of data.results ?? []) {
      map.set(r.from.id, (r.to ?? []).map((t) => t.toObjectId));
    }
  }
  return map;
}

// Flat list of all unique associated IDs across all contacts
async function batchAssociations(
  contactIds: string[],
  toType: "meetings" | "deals",
): Promise<string[]> {
  const map = await batchAssociationsMap(contactIds, toType);
  return [...new Set([...map.values()].flat())];
}

async function batchReadMeetings(ids: string[]): Promise<HsMeeting[]> {
  const results: HsMeeting[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const data = await hsPost<{ results: HsMeeting[] }>(
      "/crm/v3/objects/meetings/batch/read",
      {
        inputs: ids.slice(i, i + 100).map((id) => ({ id })),
        properties: ["hs_meeting_outcome", "createdate"],
      },
    );
    results.push(...(data.results ?? []));
  }
  return results;
}

async function batchReadDeals(ids: string[]): Promise<HsDeal[]> {
  const results: HsDeal[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const data = await hsPost<{ results: HsDeal[] }>(
      "/crm/v3/objects/deals/batch/read",
      {
        inputs: ids.slice(i, i + 100).map((id) => ({ id })),
        properties: ["dealstage", "closedate"],
      },
    );
    results.push(...(data.results ?? []));
  }
  return results;
}

// UTC epoch ms range for a single day
function dayRange(date: Date) {
  const y = date.getUTCFullYear(), m = date.getUTCMonth(), d = date.getUTCDate();
  return {
    start: Date.UTC(y, m, d, 0, 0, 0, 0),
    end:   Date.UTC(y, m, d, 23, 59, 59, 999),
  };
}

// UTC epoch ms range from start of date's month to end of date
function monthRange(date: Date) {
  const y = date.getUTCFullYear(), m = date.getUTCMonth(), d = date.getUTCDate();
  return {
    start: Date.UTC(y, m, 1, 0, 0, 0, 0),
    end:   Date.UTC(y, m, d, 23, 59, 59, 999),
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function getLlmTrafficCount(date: Date): Promise<number> {
  const { start, end } = dayRange(date);
  return countContacts([
    AI_REFERRALS,
    { propertyName: "createdate", operator: "GTE", value: String(start) },
    { propertyName: "createdate", operator: "LTE", value: String(end) },
  ]);
}

export async function getBlogTrafficCount(date: Date): Promise<number> {
  const prefix = process.env.ARTHUR_BLOG_PATH_PREFIX ?? "";
  if (!prefix) return 0;
  const { start, end } = dayRange(date);
  // Fetch AI Referral contacts for the day with source_data_1, then JS-filter for prefix
  const contacts = await getAllContacts(
    [
      AI_REFERRALS,
      { propertyName: "createdate", operator: "GTE", value: String(start) },
      { propertyName: "createdate", operator: "LTE", value: String(end) },
    ],
    ["hs_analytics_source_data_1"],
  );
  return contacts.filter((c) =>
    (c.properties.hs_analytics_source_data_1 ?? "").includes(prefix),
  ).length;
}

export async function getDemosBookedMtd(date: Date): Promise<number> {
  const contacts = await getAllContacts([AI_REFERRALS]);
  if (!contacts.length) return 0;
  const meetingIds = await batchAssociations(contacts.map((c) => c.id), "meetings");
  if (!meetingIds.length) return 0;
  const meetings = await batchReadMeetings(meetingIds);
  const { start, end } = monthRange(date);
  return meetings.filter((m) => {
    const ts = parseInt(m.properties.createdate ?? "0", 10);
    return m.properties.hs_meeting_outcome === "SCHEDULED" && ts >= start && ts <= end;
  }).length;
}

export async function getDemosHeldMtd(date: Date): Promise<number> {
  const contacts = await getAllContacts([AI_REFERRALS]);
  if (!contacts.length) return 0;
  const meetingIds = await batchAssociations(contacts.map((c) => c.id), "meetings");
  if (!meetingIds.length) return 0;
  const meetings = await batchReadMeetings(meetingIds);
  const { start, end } = monthRange(date);
  return meetings.filter((m) => {
    const ts = parseInt(m.properties.createdate ?? "0", 10);
    return m.properties.hs_meeting_outcome === "COMPLETED" && ts >= start && ts <= end;
  }).length;
}

export async function getClosedWonMtd(date: Date): Promise<number> {
  const contacts = await getAllContacts([AI_REFERRALS]);
  if (!contacts.length) return 0;
  const dealIds = await batchAssociations(contacts.map((c) => c.id), "deals");
  if (!dealIds.length) return 0;
  const deals = await batchReadDeals(dealIds);
  const { start, end } = monthRange(date);
  return deals.filter((d) => {
    const ts = d.properties.closedate ? new Date(d.properties.closedate).getTime() : 0;
    return d.properties.dealstage === "closedwon" && ts >= start && ts <= end;
  }).length;
}

export async function getArrClosedMtd(date: Date): Promise<number> {
  const contacts = await getAllContacts(
    [AI_REFERRALS, { propertyName: "current_arr__sync_", operator: "HAS_PROPERTY" }],
    ["current_arr__sync_"],
  );
  if (!contacts.length) return 0;

  const contactIds = contacts.map((c) => c.id);
  const contactToDeals = await batchAssociationsMap(contactIds, "deals");
  const allDealIds = [...new Set([...contactToDeals.values()].flat())];
  if (!allDealIds.length) return 0;

  const deals = await batchReadDeals(allDealIds);
  const { start, end } = monthRange(date);
  const qualifyingDealIds = new Set(
    deals
      .filter((d) => {
        const ts = d.properties.closedate ? new Date(d.properties.closedate).getTime() : 0;
        return d.properties.dealstage === "closedwon" && ts >= start && ts <= end;
      })
      .map((d) => d.id),
  );

  let total = 0;
  for (const contact of contacts) {
    const cDealIds = contactToDeals.get(contact.id) ?? [];
    if (cDealIds.some((did) => qualifyingDealIds.has(did))) {
      total += parseFloat(contact.properties["current_arr__sync_"] ?? "0") || 0;
    }
  }
  return total;
}
