import { supabase } from "@/lib/supabase";

/**
 * Returns the latest cumulative all-time spend per OR key name (lowercase).
 * Takes the most recent monthly snapshot per key — identical source the Tools page uses.
 * This is the single source of truth for per-key OR spend across all pages.
 */
export async function fetchOrKeySpend(): Promise<Map<string, number>> {
  const { data } = await supabase
    .from("openrouter_usage_snapshots")
    .select("key_name, month, usage_total");

  if (!data?.length) return new Map();

  // Snapshots are CUMULATIVE — take the most recent month per key only.
  const latest = new Map<string, { month: string; spend: number }>();
  for (const row of data) {
    const k = (row.key_name as string).toLowerCase();
    const month = row.month as string;
    const spend = Number(row.usage_total);
    const existing = latest.get(k);
    if (!existing || month > existing.month) latest.set(k, { month, spend });
  }

  return new Map([...latest.entries()].map(([k, v]) => [k, v.spend]));
}
