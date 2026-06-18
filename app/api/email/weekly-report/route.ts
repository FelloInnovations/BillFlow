import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { getWeeklyReportData } from "@/lib/weekly-report-data";
import { WeeklyReportEmail } from "@/emails/weekly-report";

export const dynamic = "force-dynamic";

// This route is safe to call manually at any time.
// It does not affect the Railway cron schedule.
// All Supabase queries are read-only.
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-report-secret");
  if (!secret || secret !== process.env.WEEKLY_REPORT_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
  }

  const toOverride = req.nextUrl.searchParams.get("to");
  const recipientsRaw = toOverride ?? process.env.WEEKLY_REPORT_RECIPIENTS ?? "";
  const recipients = recipientsRaw.split(",").map((r) => r.trim()).filter(Boolean);
  if (!recipients.length) {
    return NextResponse.json({ error: "WEEKLY_REPORT_RECIPIENTS not set" }, { status: 500 });
  }

  let data;
  try {
    data = await getWeeklyReportData();
  } catch (err) {
    console.error("[weekly-report] data fetch failed", err);
    return NextResponse.json({ error: "data fetch failed" }, { status: 500 });
  }

  const html = await render(WeeklyReportEmail({ data }));

  const resend = new Resend(resendKey);
  const { data: sendResult, error } = await resend.emails.send({
    from:    "BillFlow <onboarding@resend.dev>",
    to:      recipients,
    subject: `BillFlow Weekly Digest · ${data.weekLabel}`,
    html,
  });

  if (error) {
    console.error("[weekly-report] resend error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: sendResult?.id, recipients, weekLabel: data.weekLabel });
}
