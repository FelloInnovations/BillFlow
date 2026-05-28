import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// POST  { toolKey } → hide a tool
export async function POST(req: NextRequest) {
  const { toolKey } = await req.json();
  if (!toolKey) return NextResponse.json({ error: "toolKey required" }, { status: 400 });

  const { error } = await supabase
    .from("hidden_tools")
    .upsert({ tool_key: toolKey }, { onConflict: "tool_key" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE { toolKey } → restore a hidden tool
export async function DELETE(req: NextRequest) {
  const { toolKey } = await req.json();
  if (!toolKey) return NextResponse.json({ error: "toolKey required" }, { status: 400 });

  const { error } = await supabase
    .from("hidden_tools")
    .delete()
    .eq("tool_key", toolKey);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
