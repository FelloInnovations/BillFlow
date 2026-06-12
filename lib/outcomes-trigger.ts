// Server-side helper — never import from client components.
// Adds the OUTCOMES_SYNC_SECRET header so browser code never touches the secret.

export async function triggerBackfill(
  projectId: "arthur" | "enrichment",
  fromDate: string,
  toDate: string,
): Promise<{ body: unknown; status: number }> {
  const base   = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const secret = process.env.OUTCOMES_SYNC_SECRET ?? "";
  const route  = projectId === "arthur"
    ? "/api/outcomes/backfill"
    : "/api/outcomes/backfill-enrichment";

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
