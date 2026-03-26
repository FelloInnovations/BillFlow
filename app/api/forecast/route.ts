import { NextResponse } from "next/server";
import { buildForecast } from "@/lib/forecast";

export async function GET() {
  try {
    const data = await buildForecast();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
