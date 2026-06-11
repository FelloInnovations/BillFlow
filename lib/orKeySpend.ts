import { supabase } from "@/lib/supabase";

/**
 * Returns all-time spend per OR key name (lowercase) by summing every monthly row.
 * usage_total is per-month spend, not cumulative — must sum all rows per key.
 */
export async function fetchOrKeySpend(): Promise<Map<string, number>> {
  const { data } = await supabase
    .from("openrouter_usage_snapshots")
    .select("key_name, usage_total");

  if (!data?.length) return new Map();

  const totals = new Map<string, number>();
  for (const row of data) {
    const k = (row.key_name as string).toLowerCase();
    totals.set(k, (totals.get(k) ?? 0) + Number(row.usage_total));
  }
  return totals;
}
