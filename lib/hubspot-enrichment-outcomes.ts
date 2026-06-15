import { getClosedWonStageIds } from "@/lib/hubspot-outcomes";
import { getMadDb } from "@/lib/mad-db";

const BASE = "https://api.hubapi.com";

function logErr(label: string, err: unknown) {
  console.error(
    `ENRICHMENT ERROR [${label}]:`,
    JSON.stringify(err, Object.getOwnPropertyNames(err instanceof Error ? err : new Error(String(err)))),
  );
}

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

type HsDeal    = { id: string; properties: Record<string, string | null> };
type HsMeeting = { id: string; properties: Record<string, string | null> };

// UTC epoch ms from start of date's month through end of date
function monthRange(date: string): { start: number; end: number } {
  const [y, m, d] = date.split("-").map(Number);
  return {
    start: Date.UTC(y, m - 1, 1, 0, 0, 0, 0),
    end:   Date.UTC(y, m - 1, d, 23, 59, 59, 999),
  };
}

type EnrichedContact = { id: string; madId: string; arrValue: number; createdate: string };

// Module-level cache — valid for one process/request lifetime
let _hubspotEnrichedCache: EnrichedContact[] | null = null;

// Fetch one 10k-capped batch of enriched contacts starting after `afterId`.
// Uses only HAS_PROPERTY (first call) or HAS_PROPERTY + hs_object_id GT (restarts).
// No date filters — all date logic is handled client-side from the returned createdate.
async function fetchEnrichedContactsFromId(afterId?: string): Promise<{
  contacts: EnrichedContact[];
  lastId:   string | null;
  hasMore:  boolean;
  pageCount: number;
}> {
  const contacts: EnrichedContact[] = [];
  let after:     string | undefined;
  let pageCount  = 0;
  let lastId:    string | null = null;

  const filters: object[] = [{ propertyName: "mad_id", operator: "HAS_PROPERTY" }];
  if (afterId) {
    filters.push({ propertyName: "hs_object_id", operator: "GT", value: afterId });
  }

  do {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters }],
      properties: ["mad_id", "current_arr__sync_", "createdate"],
      sorts: [{ propertyName: "hs_object_id", direction: "ASCENDING" }],
      limit: 100,
    };
    if (after) body.after = after;

    const res = await fetch(`${BASE}/crm/v3/objects/contacts/search`, {
      method: "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HubSpot search failed (afterId=${afterId ?? "start"}, page=${pageCount}): ${res.status} ${text}`);
    }

    const data = await res.json() as {
      results?: { id: string; properties?: Record<string, string | null> }[];
      paging?:  { next?: { after: string } };
    };

    for (const c of data.results ?? []) {
      const madId      = c.properties?.mad_id;
      const arrRaw     = c.properties?.current_arr__sync_;
      const createdate = c.properties?.createdate ?? "";
      if (madId) {
        contacts.push({ id: c.id, madId, arrValue: arrRaw ? parseFloat(arrRaw) : 0, createdate });
        lastId = c.id;
      }
    }

    after = data.paging?.next?.after ?? undefined;
    pageCount++;
    if (after) await new Promise((r) => setTimeout(r, 150));
  } while (after);

  // Cursor exhausted after a full 10k batch — likely more contacts remain
  const hitWall = contacts.length >= 9900 && !after;
  return { contacts, lastId, hasMore: hitWall, pageCount };
}

export async function getAllHubspotEnrichedContacts(): Promise<EnrichedContact[]> {
  if (_hubspotEnrichedCache) return _hubspotEnrichedCache;

  const allContacts: EnrichedContact[] = [];
  let lastId:  string | undefined;
  let batchNum = 0;

  do {
    batchNum++;
    console.error(`[getAllHubspotEnrichedContacts] batch ${batchNum} starting from id > ${lastId ?? "beginning"}`);

    const { contacts, lastId: newLastId, hasMore, pageCount } = await fetchEnrichedContactsFromId(lastId);

    allContacts.push(...contacts);
    console.error(`[getAllHubspotEnrichedContacts] batch ${batchNum}: ${contacts.length} contacts (${pageCount} pages), total so far: ${allContacts.length}`);

    if (!hasMore || !newLastId) break;
    lastId = newLastId;
    await new Promise((r) => setTimeout(r, 250));
  } while (true);

  // Deduplicate by contact ID (safety net for batch boundary overlaps)
  const seen    = new Set<string>();
  const deduped = allContacts.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  console.error(`[getAllHubspotEnrichedContacts] complete — ${deduped.length} unique contacts`);
  _hubspotEnrichedCache = deduped;
  return deduped;
}

async function batchAssociationsMap(
  contactIds: string[],
  toType: "meetings" | "deals",
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  try {
    for (let i = 0; i < contactIds.length; i += 100) {
      const batch = contactIds.slice(i, i + 100);
      const data = await hsPost<{
        results: { from: { id: string }; to?: { toObjectId: string }[] }[];
      }>(`/crm/v4/associations/contacts/${toType}/batch/read`, {
        inputs: batch.map((id) => ({ id })),
      });
      for (const r of data.results ?? []) {
        map.set(r.from.id, (r.to ?? []).map((t) => String(t.toObjectId)));
      }
    }
  } catch (err) {
    logErr(`batchAssociationsMap:${toType}`, err);
    throw err;
  }
  return map;
}

async function batchReadMeetings(ids: string[]): Promise<HsMeeting[]> {
  const results: HsMeeting[] = [];
  try {
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
  } catch (err) {
    logErr("batchReadMeetings", err);
    throw err;
  }
  return results;
}

async function batchReadDeals(ids: string[]): Promise<HsDeal[]> {
  const results: HsDeal[] = [];
  try {
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
  } catch (err) {
    logErr("batchReadDeals", err);
    throw err;
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
  try {
    const cached = await getAllHubspotEnrichedContacts();
    console.error(`ENRICHMENT INFO: getAllEnrichedData using ${cached.length} contacts`);
    if (!cached.length) {
      return { contactIds: [], meetingMap: new Map(), dealMap: new Map(), meetings: [], deals: [] };
    }
    const ids = cached.map((c) => c.id);
    const [meetingMap, dealMap] = await Promise.all([
      batchAssociationsMap(ids, "meetings"),
      batchAssociationsMap(ids, "deals"),
    ]);
    const meetingIds = [...new Set([...meetingMap.values()].flat())];
    const dealIds    = [...new Set([...dealMap.values()].flat())];
    console.error(`ENRICHMENT INFO: getAllEnrichedData meetingIds=${meetingIds.length} dealIds=${dealIds.length}`);
    const [meetings, deals] = await Promise.all([
      meetingIds.length ? batchReadMeetings(meetingIds) : Promise.resolve([]),
      dealIds.length    ? batchReadDeals(dealIds)       : Promise.resolve([]),
    ]);
    return { contactIds: ids, meetingMap, dealMap, meetings, deals };
  } catch (err) {
    logErr("getAllEnrichedData", err);
    throw err;
  }
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

  const dealToContactIds = new Map<string, string[]>();
  for (const [cid, dids] of snap.dealMap) {
    for (const did of dids) {
      const arr = dealToContactIds.get(did) ?? [];
      arr.push(cid);
      dealToContactIds.set(did, arr);
    }
  }

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

// ── Direct Postgres functions for mad schema ──────────────────────────────────

export async function getAgentsEnrichedTotal(): Promise<{ count: number }> {
  const madDb = getMadDb();
  try {
    // Temporary: verify connection and schema access
    const test = await madDb`SELECT id, created_at FROM mad.agents LIMIT 1`;
    console.error("MAD DB connection test:", JSON.stringify(test));

    const result = await madDb`
      SELECT COUNT(*)::int AS total
      FROM mad.agents
    `;
    return { count: result[0]?.total ?? 0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const wrapped = new Error(`getAgentsEnrichedTotal failed: ${message}`);
    logErr("getAgentsEnrichedTotal", wrapped);
    throw wrapped;
  }
}

export async function getAgentsEnrichedPeriod(
  fromDate: string | null,
  toDate: string | null,
): Promise<{ count: number }> {
  const madDb = getMadDb();
  try {
    const result = fromDate && toDate
      ? await madDb`
          SELECT COUNT(*)::int AS total
          FROM mad.agents
          WHERE created_at >= ${fromDate + "T00:00:00Z"}::timestamptz
            AND created_at <= ${toDate + "T23:59:59Z"}::timestamptz
        `
      : await madDb`SELECT COUNT(*)::int AS total FROM mad.agents`;
    return { count: result[0]?.total ?? 0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const wrapped = new Error(`getAgentsEnrichedPeriod failed: ${message}`);
    logErr("getAgentsEnrichedPeriod", wrapped);
    throw wrapped;
  }
}

// ── HubSpot public function for pushed-to-hubspot ─────────────────────────────

export async function getAgentsPushedToHubspot(
  fromDate: string | null,
  toDate: string | null,
): Promise<{ count: number; contactIds: string[] }> {
  try {
    if (!fromDate || !toDate) {
      // All-time: read the `total` field from a single search call — accurate count
      // regardless of HubSpot's 10k pagination cap. No contact IDs needed for this metric.
      const data = await hsPost<{ total: number; results: unknown[] }>(
        "/crm/v3/objects/contacts/search",
        {
          filterGroups: [{ filters: [{ propertyName: "mad_id", operator: "HAS_PROPERTY" }] }],
          properties: ["mad_id"],
          limit: 1,
        },
      );
      const count = data.total ?? 0;
      console.error(`ENRICHMENT INFO: getAgentsPushedToHubspot all-time total=${count}`);
      return { count, contactIds: [] };
    }

    // Scoped — filter the full cache client-side by createdate (no HubSpot date filters)
    const allContacts = await getAllHubspotEnrichedContacts();
    const fromMs      = new Date(fromDate).getTime();
    const toMs        = new Date(toDate + "T23:59:59.999Z").getTime();

    const matched = allContacts.filter((c) => {
      if (!c.createdate) return false;
      const ts = new Date(c.createdate).getTime();
      return ts >= fromMs && ts <= toMs;
    });

    console.error(`ENRICHMENT INFO: getAgentsPushedToHubspot from=${fromDate} to=${toDate} count=${matched.length}`);
    return { count: matched.length, contactIds: matched.map((c) => c.id) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const wrapped = new Error(`getAgentsPushedToHubspot failed: ${message}`);
    logErr("getAgentsPushedToHubspot", wrapped);
    throw wrapped;
  }
}
