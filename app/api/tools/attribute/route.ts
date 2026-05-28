import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const vendorName = searchParams.get("vendor_name");

  if (vendorName) {
    const { data, error } = await supabase
      .from("tool_project_overrides")
      .select("*")
      .eq("vendor_name", vendorName)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ override: data });
  }

  const { data, error } = await supabase.from("tool_project_overrides").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ overrides: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { vendor_name, project_names, notes, attributed_by } = await req.json();
  if (!vendor_name || !Array.isArray(project_names)) {
    return NextResponse.json({ error: "vendor_name and project_names required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("tool_project_overrides")
    .upsert(
      {
        vendor_name,
        project_names,
        notes: notes ?? null,
        attributed_by: attributed_by ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "vendor_name" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const { vendor_name } = await req.json();
  if (!vendor_name) return NextResponse.json({ error: "vendor_name required" }, { status: 400 });

  const { error } = await supabase
    .from("tool_project_overrides")
    .delete()
    .eq("vendor_name", vendor_name);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
