import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const { error, data } = await supabase
    .from("financial_records")
    .insert({
      vendor_name:    body.vendor_name,
      invoice_number: body.invoice_number   ?? null,
      invoice_date:   body.invoice_date,
      due_date:       body.due_date         ?? null,
      subtotal:       body.subtotal,
      tax_amount:     body.tax_amount       ?? 0,
      total_amount:   body.total_amount,
      currency:       body.currency         ?? "USD",
      payment_status: body.payment_status   ?? "pending",
      description:    body.description      ?? null,
      email_id:       null,
      email_subject:  null,
      email_from:     null,
      pdf_filename:   null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

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

  if (vendor) {
    const names = vendor.split(",").map((v) => v.trim()).filter(Boolean);
    if (names.length === 1) q = q.eq("vendor_name", names[0]);
    else if (names.length > 1) q = q.in("vendor_name", names);
  }
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
