const BASE = "https://api.hubapi.com";

function authHeader() {
  return { Authorization: `Bearer ${process.env.HUBSPOT_PRIVATE_TOKEN}` };
}

async function hsGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { ...authHeader(), "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HubSpot GET ${path}: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
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

const AI_REFERRALS = { propertyName: "hs_analytics_source", operator: "EQ", value: "AI_REFERRALS" };

// UTC epoch ms range for a single ISO date string (YYYY-MM-DD)
function dayRange(date: string): { start: number; end: number } {
  const [y, m, d] = date.split("-").map(Number);
  return {
    start: Date.UTC(y, m - 1, d, 0, 0, 0, 0),
    end:   Date.UTC(y, m - 1, d, 23, 59, 59, 999),
  };
}

// UTC epoch ms from start of date's month through end of date
function monthRange(date: string): { start: number; end: number } {
  const [y, m, d] = date.split("-").map(Number);
  return {
    start: Date.UTC(y, m - 1, 1, 0, 0, 0, 0),
    end:   Date.UTC(y, m - 1, d, 23, 59, 59, 999),
  };
}

// Cache closed-won stage IDs (fetched once per cold start; this portal uses numeric IDs)
let _closedWonStageIds: string[] | null = null;

export async function getClosedWonStageIds(): Promise<string[]> {
  if (_closedWonStageIds) return _closedWonStageIds;
  try {
    const data = await hsGet<{
      results: { stages: { id: string; metadata?: { probability?: string } }[] }[];
    }>("/crm/v3/pipelines/deals");
    const ids: string[] = [];
    for (const pipeline of data.results ?? []) {
      for (const stage of pipeline.stages ?? []) {
        if (stage.metadata?.probability === "1.0") {
          ids.push(stage.id);
        }
      }
    }
    _closedWonStageIds = ids.length ? ids : ["closedwon"];
  } catch {
    _closedWonStageIds = ["closedwon"];
  }
  return _closedWonStageIds;
}

// Total count only — single request, uses HubSpot's total field
async function countContactsTotal(filters: unknown[]): Promise<number> {
  const data = await hsPost<{ total: number }>(
    "/crm/v3/objects/contacts/search",
    { filterGroups: [{ filters }], properties: [], limit: 1 },
  );
  return data.total ?? 0;
}

// Paginate through ALL contacts matching filters with optional properties
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

// Batch associations — returns Map<contactId, associatedObjectIds[]>
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

// Flat deduped list of all associated IDs across all contacts
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
        properties: ["hs_meeting_outcome", "createdate", "hs_timestamp"],
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
        properties: ["dealstage", "closedate", "amount"],
      },
    );
    results.push(...(data.results ?? []));
  }
  return results;
}

// ── Bulk snapshot (used by backfill) ─────────────────────────────────────────

export interface AiReferralSnapshot {
  contacts: {
    id: string;
    createdate: string;
    platform: "chatgpt" | "perplexity" | "claude" | "other";
    arr: number;
  }[];
  // timestamp = hs_timestamp (actual meeting time); createdate = record creation time
  meetings: { timestamp: number; createdate: number; outcome: string }[];
  deals: { closedate: number | null; stage: string; amount: number; contactIds: string[] }[];
}

export async function getAllAiReferralData(): Promise<AiReferralSnapshot> {
  const raw = await getAllContacts(
    [AI_REFERRALS],
    ["createdate", "hs_analytics_source_data_1", "current_arr__sync_"],
  );

  if (!raw.length) return { contacts: [], meetings: [], deals: [] };

  const ids = raw.map((c) => c.id);

  const [meetingMap, dealMap] = await Promise.all([
    batchAssociationsMap(ids, "meetings"),
    batchAssociationsMap(ids, "deals"),
  ]);

  const meetingIds = [...new Set([...meetingMap.values()].flat())];
  const dealIds    = [...new Set([...dealMap.values()].flat())];

  const [rawMeetings, rawDeals] = await Promise.all([
    meetingIds.length ? batchReadMeetings(meetingIds) : Promise.resolve([]),
    dealIds.length    ? batchReadDeals(dealIds)       : Promise.resolve([]),
  ]);

  const dealToContacts = new Map<string, string[]>();
  for (const [contactId, dids] of dealMap) {
    for (const did of dids) {
      const arr = dealToContacts.get(did) ?? [];
      arr.push(contactId);
      dealToContacts.set(did, arr);
    }
  }

  return {
    contacts: raw.map((c) => {
      const src = (c.properties.hs_analytics_source_data_1 ?? "").toLowerCase();
      const platform: AiReferralSnapshot["contacts"][number]["platform"] =
        src.includes("chatgpt")     ? "chatgpt"    :
        src.includes("perplexity")  ? "perplexity" :
        src.includes("claude")      ? "claude"     : "other";
      return {
        id: c.id,
        createdate: c.properties.createdate ?? "",
        platform,
        arr: parseFloat(c.properties["current_arr__sync_"] ?? "0") || 0,
      };
    }),
    meetings: rawMeetings.map((m) => ({
      // hs_timestamp is ISO string ("2026-04-22T19:00:00Z"); createdate is epoch ms string
      timestamp:  m.properties.hs_timestamp ? new Date(m.properties.hs_timestamp).getTime() : 0,
      createdate: parseInt(m.properties.createdate ?? "0", 10),
      outcome:    m.properties.hs_meeting_outcome ?? "",
    })),
    deals: rawDeals.map((d) => ({
      closedate:  d.properties.closedate ? new Date(d.properties.closedate).getTime() : null,
      stage:      d.properties.dealstage ?? "",
      amount:     parseFloat(d.properties.amount ?? "0") || 0,
      contactIds: dealToContacts.get(d.id) ?? [],
    })),
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function getLlmTrafficCount(date: string): Promise<{ total: number }> {
  const { start, end } = dayRange(date);
  const total = await countContactsTotal([
    AI_REFERRALS,
    { propertyName: "createdate", operator: "GTE", value: String(start) },
    { propertyName: "createdate", operator: "LTE", value: String(end) },
  ]);
  return { total };
}

export async function getLlmBreakdown(
  date: string,
): Promise<{ chatgpt: number; perplexity: number; claude: number; other: number }> {
  const { start, end } = dayRange(date);
  const contacts = await getAllContacts(
    [
      AI_REFERRALS,
      { propertyName: "createdate", operator: "GTE", value: String(start) },
      { propertyName: "createdate", operator: "LTE", value: String(end) },
    ],
    ["hs_analytics_source_data_1"],
  );

  const counts = { chatgpt: 0, perplexity: 0, claude: 0, other: 0 };
  for (const c of contacts) {
    const src = (c.properties.hs_analytics_source_data_1 ?? "").toLowerCase();
    if (src.includes("chatgpt"))         counts.chatgpt++;
    else if (src.includes("perplexity")) counts.perplexity++;
    else if (src.includes("claude"))     counts.claude++;
    else                                 counts.other++;
  }
  return counts;
}

export async function getDemosBookedMtd(date: string): Promise<{ count: number }> {
  const contacts = await getAllContacts([AI_REFERRALS]);
  if (!contacts.length) return { count: 0 };
  const meetingIds = await batchAssociations(contacts.map((c) => c.id), "meetings");
  if (!meetingIds.length) return { count: 0 };
  const meetings = await batchReadMeetings(meetingIds);
  const { start, end } = monthRange(date);
  // hs_timestamp is ISO string — parse with Date, not parseInt
  const count = meetings.filter((m) => {
    const ts = m.properties.hs_timestamp ? new Date(m.properties.hs_timestamp).getTime() : 0;
    return m.properties.hs_meeting_outcome === "SCHEDULED" && ts >= start && ts <= end;
  }).length;
  return { count };
}

export async function getDemosHeldMtd(date: string): Promise<{ count: number }> {
  const contacts = await getAllContacts([AI_REFERRALS]);
  if (!contacts.length) return { count: 0 };
  const meetingIds = await batchAssociations(contacts.map((c) => c.id), "meetings");
  if (!meetingIds.length) return { count: 0 };
  const meetings = await batchReadMeetings(meetingIds);
  const { start, end } = monthRange(date);
  // hs_timestamp is ISO string — parse with Date, not parseInt
  const count = meetings.filter((m) => {
    const ts = m.properties.hs_timestamp ? new Date(m.properties.hs_timestamp).getTime() : 0;
    return m.properties.hs_meeting_outcome === "COMPLETED" && ts >= start && ts <= end;
  }).length;
  return { count };
}

export async function getClosedWonMtd(date: string): Promise<{ count: number }> {
  const [contacts, closedWonIds] = await Promise.all([
    getAllContacts([AI_REFERRALS]),
    getClosedWonStageIds(),
  ]);
  if (!contacts.length) return { count: 0 };
  const dealIds = await batchAssociations(contacts.map((c) => c.id), "deals");
  if (!dealIds.length) return { count: 0 };
  const deals = await batchReadDeals(dealIds);
  const { start, end } = monthRange(date);
  const count = deals.filter((d) => {
    const ts = d.properties.closedate ? new Date(d.properties.closedate).getTime() : 0;
    return closedWonIds.includes(d.properties.dealstage ?? "") && ts >= start && ts <= end;
  }).length;
  return { count };
}

// ── With-contact-ids variants (for cross-project deduplication) ───────────────

// Bulk: fetches all AI-referral data once and returns all 4 MTD metrics with contact IDs.
// More efficient than calling the individual getXxxMtd functions separately.
export async function getAllAiReferralMtdMetrics(date: string): Promise<{
  demosBooked: { count: number; contactIds: string[] };
  demosHeld:   { count: number; contactIds: string[] };
  closedWon:   { count: number; contactIds: string[] };
  arrClosed:   { total: number; arrPerContact: Record<string, number> };
}> {
  const [contacts, closedWonIds] = await Promise.all([
    getAllContacts([AI_REFERRALS]),
    getClosedWonStageIds(),
  ]);

  if (!contacts.length) {
    return {
      demosBooked: { count: 0, contactIds: [] },
      demosHeld:   { count: 0, contactIds: [] },
      closedWon:   { count: 0, contactIds: [] },
      arrClosed:   { total: 0, arrPerContact: {} },
    };
  }

  const ids = contacts.map((c) => c.id);
  const [meetingMap, dealMap] = await Promise.all([
    batchAssociationsMap(ids, "meetings"),
    batchAssociationsMap(ids, "deals"),
  ]);
  const meetingIds = [...new Set([...meetingMap.values()].flat())];
  const dealIds    = [...new Set([...dealMap.values()].flat())];
  const [meetings, deals] = await Promise.all([
    meetingIds.length ? batchReadMeetings(meetingIds) : Promise.resolve([]),
    dealIds.length    ? batchReadDeals(dealIds)       : Promise.resolve([]),
  ]);

  const { start, end } = monthRange(date);

  // Demos booked
  const bookedMeetingIds = new Set(
    meetings.filter((m) => {
      const ts = m.properties.hs_timestamp ? new Date(m.properties.hs_timestamp).getTime() : 0;
      return m.properties.hs_meeting_outcome === "SCHEDULED" && ts >= start && ts <= end;
    }).map((m) => m.id),
  );
  const bookedContactIds = ids.filter((cid) =>
    (meetingMap.get(cid) ?? []).some((mid) => bookedMeetingIds.has(mid)),
  );

  // Demos held
  const heldMeetingIds = new Set(
    meetings.filter((m) => {
      const ts = m.properties.hs_timestamp ? new Date(m.properties.hs_timestamp).getTime() : 0;
      return m.properties.hs_meeting_outcome === "COMPLETED" && ts >= start && ts <= end;
    }).map((m) => m.id),
  );
  const heldContactIds = ids.filter((cid) =>
    (meetingMap.get(cid) ?? []).some((mid) => heldMeetingIds.has(mid)),
  );

  // Closed won
  const wonDealIds = new Set(
    deals.filter((d) => {
      const ts = d.properties.closedate ? new Date(d.properties.closedate).getTime() : 0;
      return closedWonIds.includes(d.properties.dealstage ?? "") && ts >= start && ts <= end;
    }).map((d) => d.id),
  );
  const wonContactIds = ids.filter((cid) =>
    (dealMap.get(cid) ?? []).some((did) => wonDealIds.has(did)),
  );

  // ARR closed — build contact → deal ARR map for dedup
  const dealToContactIdsMap = new Map<string, string[]>();
  for (const [cid, dids] of dealMap) {
    for (const did of dids) {
      const arr = dealToContactIdsMap.get(did) ?? [];
      arr.push(cid);
      dealToContactIdsMap.set(did, arr);
    }
  }
  const arrPerContact: Record<string, number> = {};
  let arrTotal = 0;
  for (const d of deals) {
    const ts = d.properties.closedate ? new Date(d.properties.closedate).getTime() : 0;
    if (!closedWonIds.includes(d.properties.dealstage ?? "") || ts < start || ts > end) continue;
    const amount = parseFloat(d.properties.amount ?? "0") || 0;
    arrTotal += amount;
    const ctids = dealToContactIdsMap.get(d.id) ?? [];
    const share = ctids.length > 0 ? amount / ctids.length : 0;
    for (const cid of ctids) {
      arrPerContact[cid] = (arrPerContact[cid] ?? 0) + share;
    }
  }

  return {
    demosBooked: { count: bookedMeetingIds.size, contactIds: bookedContactIds },
    demosHeld:   { count: heldMeetingIds.size,   contactIds: heldContactIds   },
    closedWon:   { count: wonDealIds.size,        contactIds: wonContactIds    },
    arrClosed:   { total: arrTotal,               arrPerContact                },
  };
}

export async function getArrClosedMtd(date: string): Promise<{ total: number }> {
  // Sum deal `amount` for closed-won deals linked to AI-referral contacts.
  // Using deal amount (not contact current_arr__sync_) because AI-referral contacts
  // typically don't have the ARR property populated in HubSpot.
  const [contacts, closedWonIds] = await Promise.all([
    getAllContacts([AI_REFERRALS]),
    getClosedWonStageIds(),
  ]);
  if (!contacts.length) return { total: 0 };
  const dealIds = await batchAssociations(contacts.map((c) => c.id), "deals");
  if (!dealIds.length) return { total: 0 };
  const deals = await batchReadDeals(dealIds);
  const { start, end } = monthRange(date);
  const total = deals
    .filter((d) => {
      const ts = d.properties.closedate ? new Date(d.properties.closedate).getTime() : 0;
      return closedWonIds.includes(d.properties.dealstage ?? "") && ts >= start && ts <= end;
    })
    .reduce((sum, d) => sum + (parseFloat(d.properties.amount ?? "0") || 0), 0);
  return { total };
}
