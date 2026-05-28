import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const page     = parseInt(searchParams.get("page")     ?? "1",  10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "50", 10);
  const keyParam = searchParams.get("key_name");
  const model    = searchParams.get("model");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo   = searchParams.get("dateTo");

  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  let q = supabase
    .from("api_invocation_logs")
    .select("*", { count: "exact" })
    .order("invoked_at", { ascending: false })
    .range(from, to);

  if (keyParam) {
    const keys = keyParam.split(",").map(k => k.trim()).filter(Boolean);
    if (keys.length === 1) q = q.eq("key_name", keys[0]);
    else if (keys.length > 1) q = q.in("key_name", keys);
  }
  if (model)    q = q.ilike("model", `%${model}%`);
  if (dateFrom) q = q.gte("invoked_at", dateFrom);
  if (dateTo)   q = q.lte("invoked_at", dateTo + "T23:59:59Z");

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
