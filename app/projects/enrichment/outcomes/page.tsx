import { EnrichmentOutcomesClient } from "@/components/outcomes/EnrichmentOutcomesClient";

export default async function EnrichmentOutcomesPage() {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  let initialConfig           = [];
  let initialMtd              = {};
  let initialMonthlyBreakdown = [];
  let initialLastSynced       = null;

  try {
    const res = await fetch(`${base}/api/outcomes/enrichment`, { cache: "no-store" });
    if (res.ok) {
      const d = await res.json();
      initialConfig           = d.config           ?? [];
      initialMtd              = d.mtd               ?? {};
      initialMonthlyBreakdown = d.monthlyBreakdown  ?? [];
      initialLastSynced       = d.lastSynced        ?? null;
    }
  } catch { /* render with empty state */ }

  return (
    <EnrichmentOutcomesClient
      initialConfig={initialConfig}
      initialMtd={initialMtd}
      initialMonthlyBreakdown={initialMonthlyBreakdown}
      initialLastSynced={initialLastSynced}
    />
  );
}
