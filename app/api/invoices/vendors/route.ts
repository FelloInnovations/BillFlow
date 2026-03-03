import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("financial_records")
    .select("vendor_name")
    .not("vendor_name", "is", null)
    .not("vendor_name", "ilike", "%makemytrip%")
    .order("vendor_name");

  if (error) return NextResponse.json({ vendors: [] });

  const vendors = [...new Set((data ?? []).map((r) => r.vendor_name as string))].sort();
  return NextResponse.json({ vendors });
}
