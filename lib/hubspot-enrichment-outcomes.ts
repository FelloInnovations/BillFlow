import { createClient } from "@supabase/supabase-js";
import { getClosedWonStageIds } from "@/lib/hubspot-outcomes";

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

const MAD_ID_KNOWN = { propertyName: "mad_id", operator: "HAS_PROPERTY" };

function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// UTC epoch ms from start of date's month through end of date
function monthRange(date: string): { start: number; end: number } {
  const [y, m, d] = date.split("-").map(Number);
  return {
    start: Date.UTC(y, m - 1, 1, 0, 0, 0, 0),
    end:   Date.UTC(y, m - 1, d, 23, 59, 59, 999),
  };
}

// Paginate through all enriched contacts (mad_id present), with optional date filter
async function fetchEnrichedContacts(
  extraFilters: unknown[] = [],
): Promise<HsContact[]> {
  const results: HsContact[] = [];
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters: [MAD_ID_KNOWN, ...extraFilters] }],
      properties: ["mad_id"],
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

async function batchReadMeetings(ids: string[]): Promise<HsMeeting[]> {
  const results: HsMeeting[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const data = await hsPost<{ results: HsMeeting[] }>(
      "/crm/v3/objects/meetings/batch/read",
      {
        inputs: ids.slice(i, i + 100).map((id) => ({ id })),
        properties: ["hs_meeting_outcome", "hs_timestamp"],
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

// ── Bulk snapshot (used by sync + backfill) ───────────────────────────────────

export interface EnrichedDataSnapshot {
  contactIds: string[];
  meetingMap: Map<string, string[]>;  // contactId → meetingIds
  dealMap:    Map<string, string[]>;  // contactId → dealIds
  meetings:   HsMeeting[];
  deals:      HsDeal[];
}

export async function getAllEnrichedData(): Promise<EnrichedDataSnapshot> {
  const contacts = await fetchEnrichedContacts();
  if (!contacts.length) {
    return { contactIds: [], meetingMap: new Map(), dealMap: new Map(), meetings: [], deals: [] };
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
  return { contactIds: ids, meetingMap, dealMap, meetings, deals };
}

// ── Compute helpers (operate on a pre-fetched snapshot) ───────────────────────

export function computeDemosBooked(
  snap: EnrichedDataSnapshot,
  date: string,
): { count: number; contactIds: string[] } {
  const { start, end } = monthRange(date);
  const qualifiedIds = new Set(
    snap.meetings
      .filter((m) => {
        const ts = m.properties.hs_timestamp ? new Date(m.properties.hs_timestamp).getTime() : 0;
        return m.properties.hs_meeting_outcome === "SCHEDULED" && ts >= start && ts <= end;
      })
      .map((m) => m.id),
  );
  const contactIds = snap.contactIds.filter((cid) =>
    (snap.meetingMap.get(cid) ?? []).some((mid) => qualifiedIds.has(mid)),
  );
  return { count: qualifiedIds.size, contactIds };
}

export function computeDemosHeld(
  snap: EnrichedDataSnapshot,
  date: string,
): { count: number; contactIds: string[] } {
  const { start, end } = monthRange(date);
  const qualifiedIds = new Set(
    snap.meetings
      .filter((m) => {
        const ts = m.properties.hs_timestamp ? new Date(m.properties.hs_timestamp).getTime() : 0;
        return m.properties.hs_meeting_outcome === "COMPLETED" && ts >= start && ts <= end;
      })
      .map((m) => m.id),
  );
  const contactIds = snap.contactIds.filter((cid) =>
    (snap.meetingMap.get(cid) ?? []).some((mid) => qualifiedIds.has(mid)),
  );
  return { count: qualifiedIds.size, contactIds };
}

export function computeClosedWon(
  snap: EnrichedDataSnapshot,
  date: string,
  closedWonIds: string[],
): { count: number; contactIds: string[] } {
  const { start, end } = monthRange(date);
  const qualifiedIds = new Set(
    snap.deals
      .filter((d) => {
        const ts = d.properties.closedate ? new Date(d.properties.closedate).getTime() : 0;
        return closedWonIds.includes(d.properties.dealstage ?? "") && ts >= start && ts <= end;
      })
      .map((d) => d.id),
  );
  const contactIds = snap.contactIds.filter((cid) =>
    (snap.dealMap.get(cid) ?? []).some((did) => qualifiedIds.has(did)),
  );
  return { count: qualifiedIds.size, contactIds };
}

export function computeArrClosed(
  snap: EnrichedDataSnapshot,
  date: string,
  closedWonIds: string[],
): { total: number; arrPerContact: Record<string, number> } {
  const { start, end } = monthRange(date);
  const wonDeals = snap.deals.filter((d) => {
    const ts = d.properties.closedate ? new Date(d.properties.closedate).getTime() : 0;
    return closedWonIds.includes(d.properties.dealstage ?? "") && ts >= start && ts <= end;
  });

  // Build deal → contacts map for ARR attribution
  const dealToContactIds = new Map<string, string[]>();
  for (const [cid, dids] of snap.dealMap) {
    for (const did of dids) {
      const arr = dealToContactIds.get(did) ?? [];
      arr.push(cid);
      dealToContactIds.set(did, arr);
    }
  }

  // Attribute deal amount evenly across associated contacts (for dedup)
  const arrPerContact: Record<string, number> = {};
  let total = 0;
  for (const d of wonDeals) {
    const amount = parseFloat(d.properties.amount ?? "0") || 0;
    total += amount;
    const ctids = dealToContactIds.get(d.id) ?? [];
    const share = ctids.length > 0 ? amount / ctids.length : 0;
    for (const cid of ctids) {
      arrPerContact[cid] = (arrPerContact[cid] ?? 0) + share;
    }
  }
  return { total, arrPerContact };
}

// ── Supabase-based public functions ───────────────────────────────────────────

export async function getAgentsEnrichedTotal(): Promise<{ count: number }> {
  const supabase = serviceClient();
  const { count, error } = await supabase
    .schema("mad")
    .from("agents")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return { count: count ?? 0 };
}

export async function getAgentsEnrichedPeriod(
  fromDate: string,
  toDate: string,
): Promise<{ count: number }> {
  const supabase = serviceClient();
  const { count, error } = await supabase
    .schema("mad")
    .from("agents")
    .select("*", { count: "exact", head: true })
    .gte("created_at", `${fromDate}T00:00:00Z`)
    .lte("created_at", `${toDate}T23:59:59Z`);
  if (error) throw new Error(error.message);
  return { count: count ?? 0 };
}

// ── HubSpot public function for pushed-to-hubspot ─────────────────────────────

export async function getAgentsPushedToHubspot(
  date: string,
): Promise<{ count: number; contactIds: string[] }> {
  const { start, end } = monthRange(date);
  const contacts = await fetchEnrichedContacts([
    { propertyName: "createdate", operator: "GTE", value: String(start) },
    { propertyName: "createdate", operator: "LTE", value: String(end) },
  ]);
  return { count: contacts.length, contactIds: contacts.map((c) => c.id) };
}
