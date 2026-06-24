export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getFromDate(period: string): string | null {
  if (period === "all") return null;
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const period = req.nextUrl.searchParams.get("period") ?? "30d";
  const from = getFromDate(period);

  // ── 1. blog_ideas ──────────────────────────────────────────────
  let ideasQuery = supabase
    .from("blog_ideas")
    .select("id, idea_count, tokens_in, tokens_out, perplexity_calls, created_at, cluster, target_area, research_session_id");
  if (from) ideasQuery = ideasQuery.gte("created_at", from);
  const { data: ideas } = await ideasQuery;

  // ── 2. articles ────────────────────────────────────────────────
  let articlesQuery = supabase
    .from("articles")
    .select("id, status, stage, author, publish_target, published_at, created_at");
  if (from) articlesQuery = articlesQuery.gte("created_at", from);
  const { data: articles } = await articlesQuery;

  // ── 3. pipeline_runs ───────────────────────────────────────────
  let pipelineQuery = supabase
    .from("pipeline_runs")
    .select("id, status, run_type, final_score, total_cost_usd, total_tokens_in, total_tokens_out, total_duration_ms, created_at, research_session_id");
  if (from) pipelineQuery = pipelineQuery.gte("created_at", from);
  const { data: pipeline } = await pipelineQuery;

  // ── 4. research_sessions ───────────────────────────────────────
  let researchQuery = supabase
    .from("research_sessions")
    .select("id, status, iterations, cost_cap_usd, total_cost_usd, total_tokens_in, total_tokens_out, started_at, ended_at, created_at");
  if (from) researchQuery = researchQuery.gte("created_at", from);
  const { data: research } = await researchQuery;

  const safeIdeas    = ideas    ?? [];
  const safeArticles = articles ?? [];
  const safePipeline = pipeline ?? [];
  const safeResearch = research ?? [];

  // ── KPI Strip ──────────────────────────────────────────────────
  const totalIdeas     = safeIdeas.reduce((s, r) => s + Number(r.idea_count ?? 0), 0);
  const totalArticles  = safeArticles.length;
  const totalPublished = safeArticles.filter(a => a.published_at && a.published_at !== "").length;
  const tokensIn       = safeIdeas.reduce((s, r) => s + Number(r.tokens_in ?? 0), 0)
                       + safePipeline.reduce((s, r) => s + Number(r.total_tokens_in ?? 0), 0)
                       + safeResearch.reduce((s, r) => s + Number(r.total_tokens_in ?? 0), 0);
  const tokensOut      = safeIdeas.reduce((s, r) => s + Number(r.tokens_out ?? 0), 0)
                       + safePipeline.reduce((s, r) => s + Number(r.total_tokens_out ?? 0), 0)
                       + safeResearch.reduce((s, r) => s + Number(r.total_tokens_out ?? 0), 0);
  const totalTokens    = tokensIn + tokensOut;
  const conversionRate = totalIdeas > 0 ? Math.round((totalArticles / totalIdeas) * 1000) / 10 : 0;

  // ── Funnel ─────────────────────────────────────────────────────
  const totalResearchSessions = safeResearch.length;
  const ideasPerSession       = totalResearchSessions > 0
    ? Math.round((totalIdeas / totalResearchSessions) * 10) / 10 : 0;
  const articlesToPublishedRate = totalArticles > 0
    ? Math.round((totalPublished / totalArticles) * 1000) / 10 : 0;
  const fullFunnelRate = totalIdeas > 0
    ? Math.round((totalPublished / totalIdeas) * 1000) / 10 : 0;

  // ── Content Quality ────────────────────────────────────────────
  const scoredRuns      = safePipeline.filter(r => r.final_score != null && r.final_score > 0);
  const avgQualityScore = scoredRuns.length > 0
    ? Math.round(scoredRuns.reduce((s, r) => s + Number(r.final_score), 0) / scoredRuns.length * 10) / 10 : 0;

  const completedRuns   = safePipeline.filter(r => r.status === "completed").length;
  const pipelineSuccessRate = safePipeline.length > 0
    ? Math.round((completedRuns / safePipeline.length) * 1000) / 10 : 0;

  const revisionRuns    = safePipeline.filter(r => r.run_type === "revision").length;
  const revisionRate    = safePipeline.length > 0
    ? Math.round((revisionRuns / safePipeline.length) * 1000) / 10 : 0;

  const articlesByStage = {
    draft:     safeArticles.filter(a => (a.stage ?? a.status ?? "").toLowerCase().includes("draft")).length,
    review:    safeArticles.filter(a => (a.stage ?? a.status ?? "").toLowerCase().includes("review")).length,
    published: totalPublished,
  };

  // ── Quality score over time (weekly buckets) ───────────────────
  const weeklyScores: Record<string, number[]> = {};
  for (const r of scoredRuns) {
    if (!r.created_at) continue;
    const weekStart = new Date(r.created_at);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const key = weekStart.toISOString().substring(0, 10);
    if (!weeklyScores[key]) weeklyScores[key] = [];
    weeklyScores[key].push(Number(r.final_score));
  }
  const qualityOverTime = Object.entries(weeklyScores)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, scores]) => ({
      week,
      avg: Math.round(scores.reduce((s, n) => s + n, 0) / scores.length * 10) / 10,
    }));

  // ── Research Intelligence ──────────────────────────────────────
  const completedResearch    = safeResearch.filter(r => r.status === "completed").length;
  const researchSuccessRate  = safeResearch.length > 0
    ? Math.round((completedResearch / safeResearch.length) * 1000) / 10 : 0;
  const avgResearchCost      = safeResearch.length > 0
    ? Math.round(safeResearch.reduce((s, r) => s + Number(r.total_cost_usd ?? 0), 0) / safeResearch.length * 100) / 100 : 0;
  const avgIterations        = safeResearch.length > 0
    ? Math.round(safeResearch.reduce((s, r) => s + Number(r.iterations ?? 0), 0) / safeResearch.length * 10) / 10 : 0;

  const clusterMap: Record<string, number> = {};
  for (const r of safeIdeas) {
    const c = r.cluster ?? "Uncategorized";
    clusterMap[c] = (clusterMap[c] ?? 0) + Number(r.idea_count ?? 1);
  }
  const ideasByCluster = Object.entries(clusterMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([cluster, count]) => ({ cluster, count }));

  // ── Cost & Efficiency ──────────────────────────────────────────
  const totalPipelineCost  = safePipeline.reduce((s, r) => s + Number(r.total_cost_usd ?? 0), 0);
  const totalResearchCost  = safeResearch.reduce((s, r) => s + Number(r.total_cost_usd ?? 0), 0);
  const totalCost          = totalPipelineCost + totalResearchCost;
  const avgPipelineCostPerArticle = totalArticles > 0
    ? Math.round((totalPipelineCost / totalArticles) * 100) / 100 : 0;
  const costPerPublishedArticle   = totalPublished > 0
    ? Math.round((totalCost / totalPublished) * 100) / 100 : 0;

  return NextResponse.json({
    period,
    kpi: {
      totalIdeas,
      totalArticles,
      totalPublished,
      totalTokens,
      tokensIn,
      tokensOut,
      conversionRate,
    },
    funnel: {
      totalResearchSessions,
      totalIdeas,
      totalArticles,
      totalPublished,
      ideasPerSession,
      ideaToArticleRate: conversionRate,
      articlesToPublishedRate,
      fullFunnelRate,
    },
    quality: {
      avgQualityScore,
      pipelineSuccessRate,
      revisionRate,
      articlesByStage,
      qualityOverTime,
    },
    research: {
      avgResearchCost,
      researchSuccessRate,
      avgIterations,
      ideasByCluster,
      totalResearchSessions,
    },
    cost: {
      totalCost: Math.round(totalCost * 100) / 100,
      totalPipelineCost: Math.round(totalPipelineCost * 100) / 100,
      totalResearchCost: Math.round(totalResearchCost * 100) / 100,
      avgPipelineCostPerArticle,
      costPerPublishedArticle,
    },
  });
}
