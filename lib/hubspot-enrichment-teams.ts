import { getAllHubspotEnrichedContacts } from "@/lib/hubspot-enrichment-outcomes";

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

export interface TeamDataSnapshot {
  companyIds:        string[];
  companyContactMap: Map<string, string[]>;  // companyId → contactIds
  contactCompanyMap: Map<string, string[]>;  // contactId → companyIds
  contactMeetingMap: Map<string, string[]>;  // contactId → meetingIds
  companyDealMap:    Map<string, string[]>;  // companyId → dealIds
  meetings:          HsMeeting[];
  deals:             HsDeal[];
  contacts:          Array<{ id: string; createdate: string }>;
}

let _teamDataSnapshot: TeamDataSnapshot | null = null;

async function batchAssocMap(
  ids: string[],
  fromType: "contacts" | "companies",
  toType: "companies" | "meetings" | "deals",
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

// ── Bulk snapshot ─────────────────────────────────────────────────────────────

export async function getAllTeamData(): Promise<TeamDataSnapshot> {
  if (_teamDataSnapshot) return _teamDataSnapshot;

  const contacts = await getAllHubspotEnrichedContacts();
  console.error(`TEAMS INFO: getAllTeamData using ${contacts.length} enriched contacts`);

  if (!contacts.length) {
    const empty: TeamDataSnapshot = {
      companyIds: [], companyContactMap: new Map(), contactCompanyMap: new Map(),
      contactMeetingMap: new Map(), companyDealMap: new Map(),
      meetings: [], deals: [], contacts: [],
    };
    _teamDataSnapshot = empty;
    return empty;
  }

  const contactIds = contacts.map((c) => c.id);

  // contacts→companies and contacts→meetings in parallel
  const [contactCompanyRaw, contactMeetingMap] = await Promise.all([
    batchAssocMap(contactIds, "contacts", "companies"),
    batchAssocMap(contactIds, "contacts", "meetings"),
  ]);

  // Build company→contacts map (invert contactCompanyRaw)
  const companyContactMap = new Map<string, string[]>();
  const contactCompanyMap = new Map<string, string[]>();
  for (const [cid, compIds] of contactCompanyRaw) {
    contactCompanyMap.set(cid, compIds);
    for (const compId of compIds) {
      const arr = companyContactMap.get(compId) ?? [];
      arr.push(cid);
      companyContactMap.set(compId, arr);
    }
  }

  const companyIds = [...companyContactMap.keys()];
  console.error(`TEAMS INFO: found ${companyIds.length} unique companies with enriched contacts`);

  const companyDealMap = companyIds.length
    ? await batchAssocMap(companyIds, "companies", "deals")
    : new Map<string, string[]>();

  const meetingIds = [...new Set([...contactMeetingMap.values()].flat())];
  const dealIds    = [...new Set([...companyDealMap.values()].flat())];
  console.error(`TEAMS INFO: meetingIds=${meetingIds.length} dealIds=${dealIds.length}`);

  const [meetings, deals] = await Promise.all([
    meetingIds.length ? batchReadMeetings(meetingIds) : Promise.resolve([]),
    dealIds.length    ? batchReadDeals(dealIds)       : Promise.resolve([]),
  ]);

  const snap: TeamDataSnapshot = {
    companyIds,
    companyContactMap,
    contactCompanyMap,
    contactMeetingMap,
    companyDealMap,
    meetings,
    deals,
    contacts: contacts.map((c) => ({ id: c.id, createdate: c.createdate })),
  };
  _teamDataSnapshot = snap;
  return snap;
}

// ── Compute helpers ───────────────────────────────────────────────────────────

export function computeTeamDemosBooked(
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

export function computeTeamDemosHeld(
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

export function computeTeamClosedWon(
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

export function computeTeamArrClosed(
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

// ── Period / total helpers ────────────────────────────────────────────────────

export function computeTeamsTotal(snap: TeamDataSnapshot): number {
  return snap.companyIds.length;
}

export function computeTeamsPeriod(
  snap: TeamDataSnapshot,
  fromDate: string,
  toDate: string,
): { count: number; companyIds: string[] } {
  const fromMs = new Date(fromDate + "T00:00:00.000Z").getTime();
  const toMs   = new Date(toDate   + "T23:59:59.999Z").getTime();

  const contactsInRange = new Set(
    snap.contacts
      .filter((c) => {
        if (!c.createdate) return false;
        const ts = new Date(c.createdate).getTime();
        return ts >= fromMs && ts <= toMs;
      })
      .map((c) => c.id),
  );

  const companyIds = snap.companyIds.filter((compId) =>
    (snap.companyContactMap.get(compId) ?? []).some((cid) => contactsInRange.has(cid)),
  );

  return { count: companyIds.length, companyIds };
}
