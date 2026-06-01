import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ paid: 0, unpaid: 0, unpaidCount: 0, upcoming: 0, upcomingCount: 0 });
  }

  const today = new Date().toISOString().split("T")[0];

  const [paidRes, unpaidRes, upcomingRes, orSnapshotsRes] = await Promise.all([
    supabase
      .from("financial_records")
      .select("total_amount")
      .eq("payment_status", "paid")
      .gte("invoice_date", from)
      .lte("invoice_date", to)
      .not("vendor_name", "ilike", "%makemytrip%"),

    supabase
      .from("financial_records")
      .select("total_amount")
      .neq("payment_status", "paid")
      .gte("invoice_date", from)
      .lte("invoice_date", to)
      .not("vendor_name", "ilike", "%makemytrip%"),

    // Upcoming: unpaid invoices in range with due_date in the future
    supabase
      .from("financial_records")
      .select("total_amount")
      .neq("payment_status", "paid")
      .gte("invoice_date", from)
      .lte("invoice_date", to)
      .gte("due_date", today)
      .not("vendor_name", "ilike", "%makemytrip%"),

    // OpenRouter snapshots for months overlapping the from-to range
    supabase
      .from("openrouter_usage_snapshots")
      .select("month, usage_total")
      .gte("month", from.substring(0, 7))
      .lte("month", to.substring(0, 7)),
  ]);

  const paid = (paidRes.data ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
  const orSpend = (orSnapshotsRes.data ?? []).reduce((s, r) => s + Number(r.usage_total ?? 0), 0);
  const totalPaid = paid + orSpend;
  const unpaidData = unpaidRes.data ?? [];
  const unpaid = unpaidData.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
  const upcomingData = upcomingRes.data ?? [];
  const upcoming = upcomingData.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);

  return NextResponse.json({
    paid: totalPaid,
    unpaid,
    unpaidCount: unpaidData.length,
    upcoming,
    upcomingCount: upcomingData.length,
  });
}
