import { NextResponse } from "next/server";

// Server-side proxy so the UI never exposes OUTCOMES_SYNC_SECRET to the browser
export async function POST() {
  const secret  = process.env.OUTCOMES_SYNC_SECRET ?? "";
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  try {
    const res = await fetch(`${baseUrl}/api/outcomes/sync`, {
      headers: { "x-sync-secret": secret },
      cache: "no-store",
    });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
