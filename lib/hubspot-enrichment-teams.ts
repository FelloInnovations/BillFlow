const BASE = "https://api.hubapi.com";

function logErr(label: string, err: unknown) {
  console.error(
    `TEAMS ERROR [${label}]:`,
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

function monthRange(date: string): { start: number; end: number } {
  const [y, m, d] = date.split("-").map(Number);
  return {
    start: Date.UTC(y, m - 1, 1, 0, 0, 0, 0),
    end:   Date.UTC(y, m - 1, d, 23, 59, 59, 999),
  };
}

type EnrichedTeam = { id: string; madId: string; createdate: string; name: string };

// Only companies created on or after this date are attributable to Fello's enrichment pipeline
const ENRICHMENT_TEAM_START_DATE = "2025-04-01";
const ENRICHMENT_TEAM_START_TS   = new Date("2025-04-01T00:00:00.000Z").getTime().toString();

// Module-level cache — completely independent from the contacts cache
let _hubspotTeamsCache: EnrichedTeam[] | null = null;

export async function getAllHubspotEnrichedTeams(): Promise<EnrichedTeam[]> {
  if (_hubspotTeamsCache) return _hubspotTeamsCache;

  console.log("[getAllHubspotEnrichedTeams] fetching from /crm/v3/objects/companies/search");

  type HsSearchResult = {
    results?: { id: string; properties?: Record<string, string | null> }[];
    paging?:  { next?: { after: string } };
    total?:   number;
  };

  const allTeams: EnrichedTeam[] = [];
  let windowFromTs  = ENRICHMENT_TEAM_START_TS;
  let windowIdx     = 0;
  const MAX_WINDOWS = 50;

  while (windowIdx <= MAX_WINDOWS) {
    let after:              string | undefined;
    let windowTotal:        number | null = null;
    let lastSeenCreatedate: string | null = null;
    let windowEnriched      = 0;
    let pageCount           = 0;

    console.error(
      `[getAllHubspotEnrichedTeams] window ${windowIdx}: from ${new Date(parseInt(windowFromTs)).toISOString().substring(0, 10)}`,
    );

    while (true) {
      const reqBody: Record<string, unknown> = {
        filterGroups: [{ filters: [{ propertyName: "createdate", operator: "GTE", value: windowFromTs }] }],
        properties: ["mad_id", "createdate", "name"],
        sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
        limit: 100,
      };
      if (after) reqBody.after = after;

      const res = await fetch(`${BASE}/crm/v3/objects/companies/search`, {
        method: "POST",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });

      if (res.status === 429) {
        console.error(`[getAllHubspotEnrichedTeams] window ${windowIdx} page ${pageCount} rate limited, retrying in 2s…`);
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`[getAllHubspotEnrichedTeams] window ${windowIdx} page ${pageCount} failed: ${res.status} ${text.slice(0, 300)}`);
        break;
      }

      const data = await res.json() as HsSearchResult;

      if (pageCount === 0) {
        windowTotal = data.total ?? null;
        console.error(`[getAllHubspotEnrichedTeams] window ${windowIdx} total=${windowTotal ?? "?"}`);
      }

      for (const c of data.results ?? []) {
        const createdate = c.properties?.createdate ?? "";
        if (createdate) lastSeenCreatedate = createdate;

        const madId = c.properties?.mad_id;
        if (!madId) continue; // client-side filter — skip companies without mad_id
        allTeams.push({
          id:         c.id,
          madId,
          createdate,
          name:       c.properties?.name ?? "",
        });
        windowEnriched++;
      }

      after = data.paging?.next?.after ?? undefined;
      pageCount++;
      if (!after) break;
      await new Promise((r) => setTimeout(r, 500)); // 500ms between pages
    }

    console.error(
      `[getAllHubspotEnrichedTeams] window ${windowIdx} done: ${windowEnriched} enriched, running total: ${allTeams.length}`,
    );

    if (!windowTotal || windowTotal <= 10000 || !lastSeenCreatedate) break;

    windowFromTs = (new Date(lastSeenCreatedate).getTime() + 1).toString();
    console.error(`[getAllHubspotEnrichedTeams] 10k wall — restarting from ${new Date(parseInt(windowFromTs)).toISOString()}`);
    await new Promise((r) => setTimeout(r, 1000)); // 1s between windows
    windowIdx++;
  }

  // Deduplicate by company ID
  const seen    = new Set<string>();
  const deduped = allTeams.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  console.error(`[getAllHubspotEnrichedTeams] FINAL: ${deduped.length} unique enriched companies (${ENRICHMENT_TEAM_START_DATE}+)`);
  _hubspotTeamsCache = deduped;
  return deduped;
}

// ── Association helpers ───────────────────────────────────────────────────────

async function batchAssocMap(
  ids: string[],
  fromType: "contacts" | "companies",
  toType: "contacts" | "meetings" | "deals",
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  try {
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      const data = await hsPost<{
        results: { from: { id: string }; to?: { toObjectId: string }[] }[];
      }>(`/crm/v4/associations/${fromType}/${toType}/batch/read`, {
        inputs: batch.map((id) => ({ id })),
      });
      for (const r of data.results ?? []) {
        map.set(r.from.id, (r.to ?? []).map((t) => String(t.toObjectId)));
      }
    }
  } catch (err) {
    logErr(`batchAssocMap:${fromType}->${toType}`, err);
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
          inputs:     ids.slice(i, i + 100).map((id) => ({ id })),
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
          inputs:     ids.slice(i, i + 100).map((id) => ({ id })),
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

// ── Bulk snapshot (for demo/deal metrics) ─────────────────────────────────────

export interface TeamDataSnapshot {
  companyIds:        string[];
  companyContactMap: Map<string, string[]>;  // companyId → contactIds
  contactMeetingMap: Map<string, string[]>;  // contactId → meetingIds
  companyDealMap:    Map<string, string[]>;  // companyId → dealIds
  meetings:          HsMeeting[];
  deals:             HsDeal[];
}

let _teamDataSnapshot: TeamDataSnapshot | null = null;

export async function getAllTeamData(): Promise<TeamDataSnapshot> {
  if (_teamDataSnapshot) return _teamDataSnapshot;

  const teams = await getAllHubspotEnrichedTeams();
  console.error(`TEAMS INFO: getAllTeamData using ${teams.length} enriched companies`);

  if (!teams.length) {
    const empty: TeamDataSnapshot = {
      companyIds: [], companyContactMap: new Map(),
      contactMeetingMap: new Map(), companyDealMap: new Map(),
      meetings: [], deals: [],
    };
    _teamDataSnapshot = empty;
    return empty;
  }

  const companyIds = teams.map((t) => t.id);

  // companies → contacts and companies → deals in parallel
  const [companyContactMap, companyDealMap] = await Promise.all([
    batchAssocMap(companyIds, "companies", "contacts"),
    batchAssocMap(companyIds, "companies", "deals"),
  ]);

  // contacts → meetings
  const allContactIds = [...new Set([...companyContactMap.values()].flat())];
  const contactMeetingMap = allContactIds.length
    ? await batchAssocMap(allContactIds, "contacts", "meetings")
    : new Map<string, string[]>();

  const meetingIds = [...new Set([...contactMeetingMap.values()].flat())];
  const dealIds    = [...new Set([...companyDealMap.values()].flat())];
  console.error(`TEAMS INFO: getAllTeamData contacts=${allContactIds.length} meetingIds=${meetingIds.length} dealIds=${dealIds.length}`);

  const [meetings, deals] = await Promise.all([
    meetingIds.length ? batchReadMeetings(meetingIds) : Promise.resolve([]),
    dealIds.length    ? batchReadDeals(dealIds)       : Promise.resolve([]),
  ]);

  const snap: TeamDataSnapshot = {
    companyIds,
    companyContactMap,
    contactMeetingMap,
    companyDealMap,
    meetings,
    deals,
  };
  _teamDataSnapshot = snap;
  return snap;
}

// ── Total / period helpers (operate on the teams cache) ───────────────────────

export async function getTeamsEnrichedTotal(): Promise<{ count: number }> {
  const teams = await getAllHubspotEnrichedTeams();
  return { count: teams.length };
}

export async function getTeamsEnrichedPeriod(
  fromDate: string,
  toDate: string,
): Promise<{ count: number; companyIds: string[] }> {
  const teams  = await getAllHubspotEnrichedTeams();
  const fromMs = new Date(fromDate + "T00:00:00.000Z").getTime();
  const toMs   = new Date(toDate   + "T23:59:59.999Z").getTime();
  const filtered = teams.filter((t) => {
    if (!t.createdate) return false;
    const ts = new Date(t.createdate).getTime();
    return ts >= fromMs && ts <= toMs;
  });
  return { count: filtered.length, companyIds: filtered.map((t) => t.id) };
}

export async function getTeamsPushedToHubspot(
  fromDate: string | null,
  toDate: string | null,
): Promise<{ count: number; companyIds: string[] }> {
  const teams = await getAllHubspotEnrichedTeams();
  if (!fromDate || !toDate) {
    console.error(`[getTeamsPushedToHubspot] all-time total=${teams.length}`);
    return { count: teams.length, companyIds: [] };
  }
  const fromMs = new Date(fromDate + "T00:00:00.000Z").getTime();
  const toMs   = new Date(toDate   + "T23:59:59.999Z").getTime();
  const filtered = teams.filter((t) => {
    if (!t.createdate) return false;
    const ts = new Date(t.createdate).getTime();
    return ts >= fromMs && ts <= toMs;
  });
  console.error(`[getTeamsPushedToHubspot] from=${fromDate} to=${toDate} matched=${filtered.length} from cache of ${teams.length}`);
  return { count: filtered.length, companyIds: filtered.map((t) => t.id) };
}

// ── Compute helpers (operate on a pre-fetched snapshot) ───────────────────────

export function getTeamDemosBooked(
  snap: TeamDataSnapshot,
  date: string,
): { count: number; companyIds: string[] } {
  const { start, end } = monthRange(date);
  const qualifiedMeetingIds = new Set(
    snap.meetings
      .filter((m) => {
        const ts = m.properties.hs_timestamp ? new Date(m.properties.hs_timestamp).getTime() : 0;
        return m.properties.hs_meeting_outcome === "SCHEDULED" && ts >= start && ts <= end;
      })
      .map((m) => m.id),
  );
  const companyIds = snap.companyIds.filter((compId) =>
    (snap.companyContactMap.get(compId) ?? []).some((cid) =>
      (snap.contactMeetingMap.get(cid) ?? []).some((mid) => qualifiedMeetingIds.has(mid)),
    ),
  );
  return { count: companyIds.length, companyIds };
}

export function getTeamDemosHeld(
  snap: TeamDataSnapshot,
  date: string,
): { count: number; companyIds: string[] } {
  const { start, end } = monthRange(date);
  const qualifiedMeetingIds = new Set(
    snap.meetings
      .filter((m) => {
        const ts = m.properties.hs_timestamp ? new Date(m.properties.hs_timestamp).getTime() : 0;
        return m.properties.hs_meeting_outcome === "COMPLETED" && ts >= start && ts <= end;
      })
      .map((m) => m.id),
  );
  const companyIds = snap.companyIds.filter((compId) =>
    (snap.companyContactMap.get(compId) ?? []).some((cid) =>
      (snap.contactMeetingMap.get(cid) ?? []).some((mid) => qualifiedMeetingIds.has(mid)),
    ),
  );
  return { count: companyIds.length, companyIds };
}

export function getTeamClosedWon(
  snap: TeamDataSnapshot,
  date: string,
  closedWonIds: string[],
): { count: number; companyIds: string[] } {
  const { start, end } = monthRange(date);
  const qualifiedDealIds = new Set(
    snap.deals
      .filter((d) => {
        const ts = d.properties.closedate ? new Date(d.properties.closedate).getTime() : 0;
        return closedWonIds.includes(d.properties.dealstage ?? "") && ts >= start && ts <= end;
      })
      .map((d) => d.id),
  );
  const companyIds = snap.companyIds.filter((compId) =>
    (snap.companyDealMap.get(compId) ?? []).some((did) => qualifiedDealIds.has(did)),
  );
  return { count: companyIds.length, companyIds };
}

export function getTeamArrClosed(
  snap: TeamDataSnapshot,
  date: string,
  closedWonIds: string[],
): { total: number; arrPerCompany: Record<string, number> } {
  const { start, end } = monthRange(date);
  const wonDeals = snap.deals.filter((d) => {
    const ts = d.properties.closedate ? new Date(d.properties.closedate).getTime() : 0;
    return closedWonIds.includes(d.properties.dealstage ?? "") && ts >= start && ts <= end;
  });

  const dealToCompanyIds = new Map<string, string[]>();
  for (const [compId, dids] of snap.companyDealMap) {
    for (const did of dids) {
      const arr = dealToCompanyIds.get(did) ?? [];
      arr.push(compId);
      dealToCompanyIds.set(did, arr);
    }
  }

  const arrPerCompany: Record<string, number> = {};
  let total = 0;
  for (const d of wonDeals) {
    const amount = parseFloat(d.properties.amount ?? "0") || 0;
    total += amount;
    const compIds = dealToCompanyIds.get(d.id) ?? [];
    const share = compIds.length > 0 ? amount / compIds.length : 0;
    for (const compId of compIds) {
      arrPerCompany[compId] = (arrPerCompany[compId] ?? 0) + share;
    }
  }
  return { total, arrPerCompany };
}
