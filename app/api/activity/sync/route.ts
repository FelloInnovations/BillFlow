import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    let body: { key_names?: string[] } | undefined;
    try {
      body = await req.json();
    } catch {
      // No body is fine
    }

    const { data, error } = await supabase.functions.invoke(
      "snapshot-openrouter-usage",
      { body: body ?? {} }
    );

    if (error) {
      return NextResponse.json({ success: false, reason: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ success: false, reason: err.message }, { status: 500 });
  }
}
