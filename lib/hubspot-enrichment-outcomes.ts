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

// Only contacts created on or after this date are attributable to Fello's enrichment pipeline
const ENRICHMENT_CONTACT_START_DATE = "2025-04-01";
const ENRICHMENT_CONTACT_START_TS   = new Date("2025-04-01T00:00:00.000Z").getTime().toString();

// Module-level cache — valid for one process/request lifetime
let _hubspotEnrichedCache: EnrichedContact[] | null = null;

export async function getAllHubspotEnrichedContacts(): Promise<EnrichedContact[]> {
  if (_hubspotEnrichedCache) return _hubspotEnrichedCache;

  type HsSearchResult = {
    results?: { id: string; properties?: Record<string, string | null> }[];
    paging?:  { next?: { after: string } };
    total?:   number;
  };

  // Filter by createdate GTE only (combining HAS_PROPERTY with other filters causes 400).
  // mad_id presence is checked client-side. Sort by createdate ASC so date-based
  // restarts are correct when the 10k wall is hit.
  const allContacts: EnrichedContact[] = [];
  let windowFromTs  = ENRICHMENT_CONTACT_START_TS;
  let windowIdx     = 0;
  const MAX_WINDOWS = 50;

  while (windowIdx <= MAX_WINDOWS) {
    let after:              string | undefined;
    let windowTotal:        number | null = null;
    let lastSeenCreatedate: string | null = null;
    let windowEnriched      = 0;
    let pageCount           = 0;

    console.error(
      `[getAllHubspotEnrichedContacts] window ${windowIdx}: from ${new Date(parseInt(windowFromTs)).toISOString().substring(0, 10)}`,
    );

    while (true) {
      const reqBody: Record<string, unknown> = {
        filterGroups: [{ filters: [{ propertyName: "createdate", operator: "GTE", value: windowFromTs }] }],
        properties: ["mad_id", "current_arr__sync_", "createdate"],
        sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
        limit: 100,
      };
      if (after) reqBody.after = after;

      const res = await fetch(`${BASE}/crm/v3/objects/contacts/search`, {
        method: "POST",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });

      if (res.status === 429) {
        console.error(`[getAllHubspotEnrichedContacts] window ${windowIdx} page ${pageCount} rate limited, retrying in 2s…`);
        await new Promise((r) => setTimeout(r, 2000));
        continue; // retry same page — don't advance `after`
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`[getAllHubspotEnrichedContacts] window ${windowIdx} page ${pageCount} failed: ${res.status} ${text.slice(0, 300)}`);
        break;
      }

      const data = await res.json() as HsSearchResult;

      if (pageCount === 0) {
        windowTotal = data.total ?? null;
        console.error(`[getAllHubspotEnrichedContacts] window ${windowIdx} total=${windowTotal ?? "?"}`);
      }

      for (const c of data.results ?? []) {
        const createdate = c.properties?.createdate ?? "";
        if (createdate) lastSeenCreatedate = createdate; // track ALL contacts to advance window

        const madId = c.properties?.mad_id;
        if (!madId) continue; // client-side filter — skip contacts without mad_id
        const arrRaw = c.properties?.current_arr__sync_;
        allContacts.push({ id: c.id, madId, arrValue: arrRaw ? parseFloat(arrRaw) : 0, createdate });
        windowEnriched++;
      }

      after = data.paging?.next?.after ?? undefined;
      pageCount++;
      if (!after) break;
      await new Promise((r) => setTimeout(r, 500)); // 500ms between pages
    }

    console.error(
      `[getAllHubspotEnrichedContacts] window ${windowIdx} done: ${windowEnriched} enriched, running total: ${allContacts.length}`,
    );

    // windowTotal <= 10k means we consumed all contacts in this window — done
    if (!windowTotal || windowTotal <= 10000 || !lastSeenCreatedate) break;

    // Hit the 10k wall — restart from lastSeenCreatedate + 1ms
    windowFromTs = (new Date(lastSeenCreatedate).getTime() + 1).toString();
    console.error(`[getAllHubspotEnrichedContacts] 10k wall — restarting from ${new Date(parseInt(windowFromTs)).toISOString()}`);
    await new Promise((r) => setTimeout(r, 1000)); // 1s between windows
    windowIdx++;
  }

  // Deduplicate by contact ID (window boundary overlaps are rare but possible)
  const seen    = new Set<string>();
  const deduped = allContacts.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  console.error(`[getAllHubspotEnrichedContacts] FINAL: ${deduped.length} unique enriched contacts (${ENRICHMENT_CONTACT_START_DATE}+)`);
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
  // mad.agents was not populated before April 2025 — return 0 for earlier periods
  const MAD_START = "2025-04-01";
  if (toDate && toDate < MAD_START) return { count: 0 };
  const effectiveFrom = fromDate && fromDate < MAD_START ? MAD_START : fromDate;

  const madDb = getMadDb();
  try {
    const result = effectiveFrom && toDate
      ? await madDb`
          SELECT COUNT(*)::int AS total
          FROM mad.agents
          WHERE created_at >= ${effectiveFrom + "T00:00:00Z"}::timestamptz
            AND created_at <= ${toDate   + "T23:59:59Z"}::timestamptz
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
      // All-time: use the cache which already excludes contacts with null mad_id.
      // HubSpot's HAS_PROPERTY total counts null-valued fields too, overcounting by ~1,793.
      const allContacts = await getAllHubspotEnrichedContacts();
      console.error(`[getAgentsPushedToHubspot] all-time total=${allContacts.length} (null mad_ids excluded)`);
      return { count: allContacts.length, contactIds: [] };
    }

    // Scoped — never call HubSpot with date filters (always 400); filter cache client-side
    const allContacts = await getAllHubspotEnrichedContacts();
    const fromMs      = new Date(fromDate + "T00:00:00.000Z").getTime();
    const toMs        = new Date(toDate   + "T23:59:59.999Z").getTime();

    const matched = allContacts.filter((c) => {
      if (!c.createdate) return false;
      const ts = new Date(c.createdate).getTime();
      return ts >= fromMs && ts <= toMs;
    });

    console.error(`[getAgentsPushedToHubspot] from=${fromDate} to=${toDate} matched=${matched.length} from cache of ${allContacts.length}`);
    return { count: matched.length, contactIds: matched.map((c) => c.id) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const wrapped = new Error(`getAgentsPushedToHubspot failed: ${message}`);
    logErr("getAgentsPushedToHubspot", wrapped);
    throw wrapped;
  }
}
