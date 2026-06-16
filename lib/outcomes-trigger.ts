// Server-side helper — never import from client components.
// Adds the OUTCOMES_SYNC_SECRET header so browser code never touches the secret.

export async function triggerBackfill(
  projectId: "arthur" | "enrichment" | "enrichment-teams",
  fromDate: string,
  toDate: string,
): Promise<{ body: unknown; status: number }> {
  const base   = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const secret = process.env.OUTCOMES_SYNC_SECRET ?? "";
  const routeMap: Record<string, string> = {
    "arthur":           "/api/outcomes/backfill",
    "enrichment":       "/api/outcomes/backfill-enrichment",
    "enrichment-teams": "/api/outcomes/backfill-enrichment-teams",
  };
  const route = routeMap[projectId] ?? "/api/outcomes/backfill";

  const res = await fetch(`${base}${route}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-sync-secret": secret,
    },
    body: JSON.stringify({ from: fromDate, to: toDate }),
  });
  const body = await res.json().catch(() => ({}));
  return { body, status: res.status };
}
