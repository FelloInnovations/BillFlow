import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const OR_BASE = "https://openrouter.ai/api/v1";

interface OrKey  { name: string; hash: string }
interface OrActivity {
  date: string; model: string; model_permaslug: string;
  endpoint_id: string; provider_name: string;
  usage: number; requests: number;
  prompt_tokens: number; completion_tokens: number; reasoning_tokens: number;
}

export async function POST(req: NextRequest) {
  // Optional CRON_SECRET gate (n8n sends this as Authorization: Bearer <secret>)
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth =
      req.headers.get("x-cron-secret") ??
      req.headers.get("authorization")?.replace("Bearer ", "");
    if (auth !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const provKey = process.env.OPENROUTER_PROVISIONING_KEY;
  if (!provKey) {
    return NextResponse.json({ error: "OPENROUTER_PROVISIONING_KEY not set" }, { status: 500 });
  }

  const db = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json().catch(() => ({}));
  const filterKeys: string[] | null = body.key_names ?? null;

  // 1. Fetch all OpenRouter keys (100 per page)
  const allOrKeys: OrKey[] = [];
  let offset = 0;
  while (true) {
    const res = await fetch(`${OR_BASE}/keys?offset=${offset}&limit=100`, {
      headers: { Authorization: `Bearer ${provKey}` },
    });
    if (!res.ok) {
      return NextResponse.json({ error: `OR keys API ${res.status}` }, { status: 502 });
    }
    const { data } = await res.json();
    if (!data?.length) break;
    allOrKeys.push(...(data as any[]).map(k => ({ name: k.name as string, hash: k.hash as string })));
    if (data.length < 100) break;
    offset += 100;
  }

  const keysToSync = filterKeys
    ? allOrKeys.filter(k => filterKeys.includes(k.name))
    : allOrKeys;

  let rowsWritten = 0;
  const errors: string[] = [];

  // 2. For each key, fetch activity and upsert into api_invocation_logs
  for (const orKey of keysToSync) {
    try {
      const res = await fetch(`${OR_BASE}/activity?api_key_hash=${orKey.hash}`, {
        headers: { Authorization: `Bearer ${provKey}` },
      });
      if (!res.ok) {
        errors.push(`${orKey.name}: activity ${res.status}`);
        continue;
      }

      const { data: rows } = (await res.json()) as { data: OrActivity[] };
      if (!rows?.length) continue;

      const logRows = rows.map(r => ({
        key_name:          orKey.name,
        model:             r.model,
        prompt_tokens:     r.prompt_tokens,
        completion_tokens: r.completion_tokens,
        total_tokens:      (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0) + (r.reasoning_tokens ?? 0),
        cost_usd:          r.usage,
        invoked_at:        r.date.replace(" ", "T") + "Z",  // "2026-06-02 00:00:00" → ISO
        provider_name:     r.provider_name,
        endpoint_id:       r.endpoint_id,
        source:            "openrouter_activity_sync",
      }));

      // Upsert in batches of 500; ON CONFLICT DO NOTHING via ignoreDuplicates
      for (let i = 0; i < logRows.length; i += 500) {
        const batch = logRows.slice(i, i + 500);
        const { error } = await db
          .from("api_invocation_logs")
          .upsert(batch, { onConflict: "key_name,endpoint_id,invoked_at", ignoreDuplicates: true });
        if (error) {
          errors.push(`${orKey.name}: DB ${error.message}`);
        } else {
          rowsWritten += batch.length;
        }
      }
    } catch (e: any) {
      errors.push(`${orKey.name}: ${e.message}`);
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    synced_keys: keysToSync.length,
    rows_written: rowsWritten,
    errors,
  });
}
