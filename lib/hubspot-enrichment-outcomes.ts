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

// Module-level cache — valid for one process/request lifetime
let _hubspotEnrichedCache: { id: string; madId: string; arrValue: number }[] | null = null;

// Fetch all HubSpot contacts with mad_id set.
// Strategy: paginate with HAS_PROPERTY + sort by hs_object_id ASC.
// HubSpot caps cursor pagination at 10k results per query. When the cursor runs
// out but we haven't reached the total, restart from the last seen hs_object_id
// using a GT filter — repeating until all contacts are collected.
async function getAllHubspotEnrichedContacts(): Promise<{ id: string; madId: string; arrValue: number }[]> {
  if (_hubspotEnrichedCache) return _hubspotEnrichedCache;

  type PageData = {
    results: { id: string; properties: Record<string, string | null> }[];
    paging?: { next?: { after: string } };
    total?: number;
  };

  // Step 1: get total count
  const countData = await hsPost<PageData>("/crm/v3/objects/contacts/search", {
    filterGroups: [{ filters: [{ propertyName: "mad_id", operator: "HAS_PROPERTY" }] }],
    properties: ["mad_id"],
    limit: 1,
  });
  const total = countData.total ?? 0;
  console.error(`[getAllHubspotEnrichedContacts] total to fetch: ${total}`);

  const results: { id: string; madId: string; arrValue: number }[] = [];
  let afterId:      string | undefined;  // hs_object_id GT restart point
  let totalFetched  = 0;

  // Step 2: fetch in 10k batches, restarting from last ID when cursor is exhausted
  while (totalFetched < total) {
    const filters: Record<string, string>[] = [
      { propertyName: "mad_id", operator: "HAS_PROPERTY" },
    ];
    if (afterId) {
      filters.push({ propertyName: "hs_object_id", operator: "GT", value: afterId });
    }

    let after:              string | undefined;
    let batchFetched        = 0;
    let lastId:             string | undefined;
    let consecutiveFailures = 0;

    // Paginate within this 10k batch
    while (true) {
      const body: Record<string, unknown> = {
        filterGroups: [{ filters }],
        properties: ["mad_id", "current_arr__sync_"],
        sorts: [{ propertyName: "hs_object_id", direction: "ASCENDING" }],
        limit: 100,
      };
      if (after) body.after = after;

      let data: PageData;
      try {
        data = await hsPost<PageData>("/crm/v3/objects/contacts/search", body);
        consecutiveFailures = 0;
      } catch (err) {
        consecutiveFailures++;
        console.error(`[getAllHubspotEnrichedContacts] page failed (${consecutiveFailures}/3) afterId=${afterId ?? "start"} after=${after ?? "none"}`);
        if (consecutiveFailures >= 3) {
          console.error("[getAllHubspotEnrichedContacts] 3 consecutive failures — stopping early");
          _hubspotEnrichedCache = results;
          return results;
        }
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      for (const c of data.results ?? []) {
        const madId  = c.properties.mad_id;
        const arrRaw = c.properties.current_arr__sync_;
        if (madId) results.push({ id: c.id, madId, arrValue: arrRaw ? parseFloat(arrRaw) : 0 });
        lastId = c.id;
      }

      batchFetched  += (data.results ?? []).length;
      totalFetched  += (data.results ?? []).length;
      const prev     = totalFetched - (data.results ?? []).length;
      if (Math.floor(totalFetched / 1000) > Math.floor(prev / 1000)) {
        console.error(`[getAllHubspotEnrichedContacts] fetched ${totalFetched} so far...`);
      }

      after = data.paging?.next?.after;
      if (!after) break;
      await new Promise((r) => setTimeout(r, 250));
    }

    console.error(`[getAllHubspotEnrichedContacts] batch done — batchFetched=${batchFetched} totalFetched=${totalFetched}/${total}`);

    if (batchFetched === 0 || !lastId) break;

    // Cursor exhausted but more contacts remain — restart from last seen ID
    if (totalFetched < total) {
      afterId = lastId;
      console.error(`[getAllHubspotEnrichedContacts] restarting from hs_object_id > ${afterId}`);
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  _hubspotEnrichedCache = results;
  console.error(`[getAllHubspotEnrichedContacts] done — ${results.length} contacts fetched`);
  return results;
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

    // Scoped: search with createdate GTE + LTE filter, paginate and collect contact IDs.
    const startMs = new Date(fromDate + "T00:00:00.000Z").getTime().toString();
    const endMs   = new Date(toDate   + "T23:59:59.999Z").getTime().toString();

    const contactIds: string[] = [];
    let after: string | undefined;

    do {
      const body: Record<string, unknown> = {
        filterGroups: [{
          filters: [
            { propertyName: "mad_id",     operator: "HAS_PROPERTY" },
            { propertyName: "createdate", operator: "GTE", value: startMs },
            { propertyName: "createdate", operator: "LTE", value: endMs   },
          ],
        }],
        properties: ["mad_id"],
        limit: 100,
      };
      if (after) body.after = after;

      const data = await hsPost<{
        results: { id: string }[];
        paging?: { next?: { after: string } };
      }>("/crm/v3/objects/contacts/search", body);

      for (const c of data.results ?? []) contactIds.push(c.id);
      after = data.paging?.next?.after;
      if (after) await new Promise((r) => setTimeout(r, 250));
    } while (after);

    console.error(`ENRICHMENT INFO: getAgentsPushedToHubspot from=${fromDate} to=${toDate} count=${contactIds.length}`);
    return { count: contactIds.length, contactIds };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const wrapped = new Error(`getAgentsPushedToHubspot failed: ${message}`);
    logErr("getAgentsPushedToHubspot", wrapped);
    throw wrapped;
  }
}
