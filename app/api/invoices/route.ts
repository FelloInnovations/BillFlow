import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const vendor = searchParams.get("vendor");
  const status = searchParams.get("status");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("financial_records")
    .select("*", { count: "exact" })
    .not("vendor_name", "ilike", "%makemytrip%")
    .order("invoice_date", { ascending: false, nullsFirst: false })
    .range(from, to);

  if (vendor) q = q.ilike("vendor_name", `%${vendor}%`);
  if (status) q = q.eq("payment_status", status);
  if (dateFrom) q = q.gte("invoice_date", dateFrom);
  if (dateTo) q = q.lte("invoice_date", dateTo);

  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const total = count ?? 0;
  return NextResponse.json({
    data: data ?? [],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}
