import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { AlertStatus } from "@/types";

function getTodayRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function getWeekStart(): string {
  const now = new Date();
  const dow = now.getUTCDay(); // 0=Sun
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - ((dow + 6) % 7));
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString();
}

function computePeriodLabel(periodType: string): string {
  const now = new Date();
  if (periodType === "monthly") {
    return now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  if (periodType === "daily") {
    return `Today (${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })})`;
  }
  // weekly: Mon – Sun
  const dow = now.getUTCDay();
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - ((dow + 6) % 7));
  monday.setUTCHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const monStr = monday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const sunStr = sunday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `This week (${monStr}–${sunStr})`;
}

export async function GET() {
  const [alertsRes, historyRes] = await Promise.all([
    supabase.from("spend_alerts").select("*").eq("is_active", true).order("project_name"),
    supabase
      .from("alert_digest_queue")
      .select("*")
      .order("detected_at", { ascending: false })
      .limit(50),
  ]);

  if (alertsRes.error) return NextResponse.json({ error: alertsRes.error.message }, { status: 500 });

  const alerts = alertsRes.data ?? [];

  if (!alerts.length) {
    return NextResponse.json({ alerts: [], history: historyRes.data ?? [] });
  }

  const now = new Date();
  const currentMonth = now.toISOString().substring(0, 7);
  const todayRange = getTodayRange();
  const weekStart = getWeekStart();
  const keyNames = [...new Set(alerts.map(a => a.openrouter_key_name as string))];
  const periodTypes = [...new Set(alerts.map(a => a.period_type as string))];

  const [dailyRes, weeklyRes, snapRes, liveRes] = await Promise.all([
    periodTypes.includes("daily")
      ? supabase.from("api_invocation_logs").select("key_name, cost_usd")
          .in("key_name", keyNames).gte("invoked_at", todayRange.start).lt("invoked_at", todayRange.end)
      : Promise.resolve({ data: [] as { key_name: string; cost_usd: number }[] }),
    periodTypes.includes("weekly")
      ? supabase.from("api_invocation_logs").select("key_name, cost_usd")
          .in("key_name", keyNames).gte("invoked_at", weekStart)
      : Promise.resolve({ data: [] as { key_name: string; cost_usd: number }[] }),
    periodTypes.includes("monthly")
      ? supabase.from("openrouter_usage_snapshots").select("key_name, usage_total")
          .in("key_name", keyNames).eq("month", currentMonth)
      : Promise.resolve({ data: [] as { key_name: string; usage_total: number }[] }),
    periodTypes.includes("monthly")
      ? supabase.from("api_invocation_logs").select("key_name, cost_usd")
          .in("key_name", keyNames).eq("source", "live_today")
      : Promise.resolve({ data: [] as { key_name: string; cost_usd: number }[] }),
  ]);

  const dailyByKey: Record<string, number> = {};
  for (const r of dailyRes.data ?? []) {
    const k = r.key_name as string;
    dailyByKey[k] = (dailyByKey[k] ?? 0) + Number(r.cost_usd ?? 0);
  }
  const weeklyByKey: Record<string, number> = {};
  for (const r of weeklyRes.data ?? []) {
    const k = r.key_name as string;
    weeklyByKey[k] = (weeklyByKey[k] ?? 0) + Number(r.cost_usd ?? 0);
  }
  const monthlyByKey: Record<string, number> = {};
  for (const r of snapRes.data ?? []) {
    const k = r.key_name as string;
    monthlyByKey[k] = (monthlyByKey[k] ?? 0) + Number(r.usage_total ?? 0);
  }
  for (const r of liveRes.data ?? []) {
    const k = r.key_name as string;
    monthlyByKey[k] = (monthlyByKey[k] ?? 0) + Number(r.cost_usd ?? 0);
  }

  const enriched = alerts.map(alert => {
    const key = alert.openrouter_key_name as string;
    const period = alert.period_type as string;
    const threshold = Number(alert.threshold_usd);

    let current_spend = 0;
    if (period === "daily")   current_spend = dailyByKey[key]   ?? 0;
    if (period === "weekly")  current_spend = weeklyByKey[key]  ?? 0;
    if (period === "monthly") current_spend = monthlyByKey[key] ?? 0;

    const pct = threshold > 0 ? (current_spend / threshold) * 100 : 0;
    const status: AlertStatus = pct >= 100 ? "crossed" : pct >= 80 ? "warning" : "ok";

    return {
      ...alert,
      threshold_usd: threshold,
      current_spend: Math.round(current_spend * 10000) / 10000,
      pct_of_threshold: Math.round(pct * 10) / 10,
      period_label: computePeriodLabel(period),
      status,
    };
  });

  return NextResponse.json({ alerts: enriched, history: historyRes.data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    project_name, openrouter_key_name, period_type, threshold_usd,
    notify_email = "team", notify_frequency = "immediate", is_active = true,
  } = body;

  if (!project_name || !openrouter_key_name || !period_type || !threshold_usd) {
    return NextResponse.json(
      { error: "project_name, openrouter_key_name, period_type, threshold_usd are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("spend_alerts")
    .upsert(
      {
        project_name, openrouter_key_name, period_type,
        threshold_usd: Number(threshold_usd),
        notify_email, notify_frequency, is_active,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_name,period_type" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase
    .from("spend_alerts")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
