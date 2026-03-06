import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("hubspot_tickets")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const { data, error } = await supabase
    .from("hubspot_tickets")
    .insert([{
      ticket_link: body.ticket_link || null,
      category: body.category || null,
      list_detail: body.list_detail || null,
      contacts_to_enrich: Number(body.contacts_to_enrich) || 0,
      fields_to_enrich: body.fields_to_enrich || null,
      eta: body.eta || null,
      enrichment_status: body.enrichment_status || null,
      valid_enriched: body.valid_enriched ? Number(body.valid_enriched) : null,
      hit_rate: body.hit_rate != null && body.hit_rate !== "" ? Number(body.hit_rate) : null,
      final_status: body.final_status || null,
      notes: body.notes || null,
      owner: body.owner || null,
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
