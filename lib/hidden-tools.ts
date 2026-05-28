import { supabase } from "@/lib/supabase";

/** Returns the full set of hidden tool keys (e.g. "OpenRouter", "OpenRouter:coworking", "Supabase"). */
export async function getHiddenToolKeys(): Promise<Set<string>> {
  const { data } = await supabase.from("hidden_tools").select("tool_key");
  return new Set((data ?? []).map((r) => r.tool_key as string));
}

/**
 * Given the hidden tool keys set, extracts the OR key names whose per-key
 * tool entry is hidden (strips the "OpenRouter:" prefix).
 * E.g. "OpenRouter:coworking" → "coworking".
 */
export function hiddenOrKeyNames(hiddenKeys: Set<string>): Set<string> {
  const prefix = "OpenRouter:";
  return new Set(
    [...hiddenKeys].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length))
  );
}
