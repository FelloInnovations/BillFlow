import { Suspense } from "react";
import { ActivityClient } from "@/components/activity/ActivityClient";
import { ActivityData, Guardrail } from "@/types";

const EMPTY_ACTIVITY: ActivityData = { keys: [], months: [], all_projects: [] };

async function getData(): Promise<{ activity: ActivityData; guardrails: Guardrail[] }> {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const [activityRes, guardrailsRes] = await Promise.all([
      fetch(`${base}/api/activity`, { cache: "no-store" }),
      fetch(`${base}/api/guardrails`, { cache: "no-store" }),
    ]);
    const activity: ActivityData = activityRes.ok ? await activityRes.json() : EMPTY_ACTIVITY;
    const guardrails: Guardrail[] = guardrailsRes.ok ? await guardrailsRes.json() : [];
    return { activity, guardrails };
  } catch {
    return { activity: EMPTY_ACTIVITY, guardrails: [] };
  }
}

export default async function ActivityPage() {
  const { activity, guardrails } = await getData();

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Activity</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          OpenRouter per-key spend and budget guardrails
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-slate-400">Loading activity...</p>}>
        <ActivityClient initialActivity={activity} initialGuardrails={guardrails} />
      </Suspense>
    </div>
  );
}
