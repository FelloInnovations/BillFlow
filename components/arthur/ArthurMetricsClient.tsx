"use client";

import { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar,
} from "recharts";
import { ArthurMetrics } from "@/types";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function formatCost(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

const sectionCard: React.CSSProperties = {
  background: "var(--bg-primary)",
  border: "1px solid var(--border-tertiary)",
  borderRadius: 12,
  padding: 28,
  boxShadow: "var(--shadow-xs)",
};

const kpiCard: React.CSSProperties = {
  background: "var(--bg-primary)",
  border: "1px solid var(--border-tertiary)",
  borderRadius: 12,
  padding: "20px 24px",
  boxShadow: "var(--shadow-xs)",
};

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: "var(--text-tertiary)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  margin: "0 0 20px",
};

function SkeletonCard({ height = 88 }: { height?: number }) {
  return (
    <div
      className="bg-[var(--bg-secondary)] animate-pulse rounded-xl"
      style={{ height }}
    />
  );
}

export function ArthurMetricsClient() {
  const [period, setPeriod] = useState<"7d" | "30d" | "all">("all");
  const [data, setData] = useState<ArthurMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/arthur/metrics?period=${period}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [period]);

  const periodButtons = ["7D", "30D", "All"] as const;

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Arthur · Pipeline Metrics</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">Ideas → Articles → Published</p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {periodButtons.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p.toLowerCase() as "7d" | "30d" | "all")}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 8,
                border: "1px solid var(--border-tertiary)",
                background: period === p.toLowerCase() ? "var(--bg-brand-solid)" : "var(--bg-primary)",
                color: period === p.toLowerCase() ? "var(--text-white)" : "var(--text-tertiary)",
                cursor: "pointer",
                transition: "all 200ms ease-out",
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {!loading && data && (
        <>
          {/* ── Section 1: KPI Strip ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            {[
              { label: "Ideas Generated",  value: data.kpi.totalIdeas.toLocaleString(),     brand: false },
              { label: "Articles Created", value: data.kpi.totalArticles.toLocaleString(),  brand: false },
              { label: "Published",        value: data.kpi.totalPublished.toLocaleString(), brand: false },
              { label: "Tokens Consumed",  value: formatTokens(data.kpi.totalTokens),       brand: false },
              { label: "Conversion Rate",  value: `${data.kpi.conversionRate}%`,            brand: true  },
            ].map(({ label, value, brand }) => (
              <div key={label} style={kpiCard}>
                <p style={{ fontSize: 10, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
                  {label}
                </p>
                <p style={{ fontSize: 28, fontWeight: 600, color: brand ? "var(--text-brand-primary)" : "var(--text-primary)", margin: 0 }}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          {/* ── Section 2: Funnel ── */}
          <div style={sectionCard}>
            <p style={sectionLabel}>PIPELINE FUNNEL · {period.toUpperCase()}</p>
            <div style={{ display: "flex", alignItems: "center", overflowX: "auto", gap: 0 }}>
              {/* Stage: Research Sessions */}
              <div style={{ flex: 1, minWidth: 100, textAlign: "center" }}>
                <div style={{ background: "var(--bg-secondary_subtle)", borderRadius: 8, padding: "16px 12px", border: "1px solid var(--border-tertiary)" }}>
                  <p style={{ fontSize: 24, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                    {data.funnel.totalResearchSessions}
                  </p>
                  <p style={{ fontSize: 10, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "4px 0 0" }}>
                    Research Sessions
                  </p>
                </div>
              </div>
              <div style={{ textAlign: "center", padding: "0 8px", minWidth: 60 }}>
                <p style={{ fontSize: 11, fontWeight: 500, color: "var(--text-brand-primary)", margin: "0 0 4px" }}>
                  {data.funnel.ideasPerSession}/session
                </p>
                <p style={{ fontSize: 18, color: "var(--text-quaternary)", margin: 0 }}>→</p>
              </div>

              {/* Stage: Ideas */}
              <div style={{ flex: 1, minWidth: 100, textAlign: "center" }}>
                <div style={{ background: "var(--bg-secondary_subtle)", borderRadius: 8, padding: "16px 12px", border: "1px solid var(--border-tertiary)" }}>
                  <p style={{ fontSize: 24, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                    {data.funnel.totalIdeas.toLocaleString()}
                  </p>
                  <p style={{ fontSize: 10, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "4px 0 0" }}>
                    Ideas
                  </p>
                </div>
              </div>
              <div style={{ textAlign: "center", padding: "0 8px", minWidth: 60 }}>
                <p style={{ fontSize: 11, fontWeight: 500, color: "var(--text-brand-primary)", margin: "0 0 4px" }}>
                  {data.funnel.ideaToArticleRate}%
                </p>
                <p style={{ fontSize: 18, color: "var(--text-quaternary)", margin: 0 }}>→</p>
              </div>

              {/* Stage: Articles Created */}
              <div style={{ flex: 1, minWidth: 100, textAlign: "center" }}>
                <div style={{ background: "var(--bg-secondary_subtle)", borderRadius: 8, padding: "16px 12px", border: "1px solid var(--border-tertiary)" }}>
                  <p style={{ fontSize: 24, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                    {data.funnel.totalArticles.toLocaleString()}
                  </p>
                  <p style={{ fontSize: 10, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "4px 0 0" }}>
                    Articles Created
                  </p>
                </div>
              </div>
              <div style={{ textAlign: "center", padding: "0 8px", minWidth: 60 }}>
                <p style={{ fontSize: 11, fontWeight: 500, color: "var(--text-brand-primary)", margin: "0 0 4px" }}>
                  {data.funnel.articlesToPublishedRate}%
                </p>
                <p style={{ fontSize: 18, color: "var(--text-quaternary)", margin: 0 }}>→</p>
              </div>

              {/* Stage: Published */}
              <div style={{ flex: 1, minWidth: 100, textAlign: "center" }}>
                <div style={{ background: "var(--bg-brand-primary)", borderRadius: 8, padding: "16px 12px", border: "1px solid var(--border-brand)" }}>
                  <p style={{ fontSize: 24, fontWeight: 600, color: "var(--text-brand-primary)", margin: 0 }}>
                    {data.funnel.totalPublished.toLocaleString()}
                  </p>
                  <p style={{ fontSize: 10, fontWeight: 500, color: "var(--text-brand-primary)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "4px 0 0", opacity: 0.8 }}>
                    Published
                  </p>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border-tertiary)", textAlign: "center" }}>
              <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: 0 }}>
                Full funnel rate (sessions → published):{" "}
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{data.funnel.fullFunnelRate}%</span>
              </p>
            </div>
          </div>

          {/* ── Section 3: Content Quality ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {/* Left: Quality Score Over Time */}
            <div style={sectionCard}>
              <p style={sectionLabel}>QUALITY SCORE OVER TIME</p>
              {data.quality.avgQualityScore > 0 && (
                <p style={{ fontSize: 24, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 16px" }}>
                  {data.quality.avgQualityScore}
                  <span style={{ fontSize: 13, color: "var(--text-tertiary)", fontWeight: 400 }}> /100 avg</span>
                </p>
              )}
              {data.quality.qualityOverTime.length === 0 ? (
                <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <p className="text-[var(--text-tertiary)]" style={{ fontSize: 13 }}>No quality data for this period</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data.quality.qualityOverTime} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-tertiary)" vertical={false} />
                    <XAxis
                      dataKey="week"
                      tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: string) => {
                        const d = new Date(v);
                        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                      }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--bg-primary)",
                        border: "1px solid var(--border-tertiary)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="avg"
                      stroke="var(--bg-brand-solid)"
                      strokeWidth={2}
                      dot={{ fill: "var(--bg-brand-solid)", r: 3 } as object}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Right: Pipeline Health */}
            <div style={sectionCard}>
              <p style={sectionLabel}>PIPELINE HEALTH</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Success rate */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Pipeline Success Rate</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                      {data.quality.pipelineSuccessRate}%
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--bg-secondary)" }}>
                    <div style={{ height: "100%", borderRadius: 3, width: `${data.quality.pipelineSuccessRate}%`, background: "var(--bg-success-solid)" }} />
                  </div>
                </div>
                {/* Revision rate */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Revision Rate</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                      {data.quality.revisionRate}%
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--bg-secondary)" }}>
                    <div style={{ height: "100%", borderRadius: 3, width: `${data.quality.revisionRate}%`, background: "var(--bg-warning-solid)" }} />
                  </div>
                </div>
                {/* Articles by stage */}
                <div style={{ paddingTop: 12, borderTop: "1px solid var(--border-tertiary)" }}>
                  <p style={{ fontSize: 10, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                    Articles by Stage
                  </p>
                  {(() => {
                    const { review, published } = data.quality.articlesByStage;
                    const total = Math.max(review, published, 1);
                    return (
                      [
                        { label: "Review",    count: review    },
                        { label: "Published", count: published },
                      ].map(({ label, count }) => (
                        <div key={label} style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{count}</span>
                          </div>
                          <div style={{ height: 4, borderRadius: 2, background: "var(--bg-secondary)" }}>
                            <div style={{ height: "100%", borderRadius: 2, width: `${(count / total) * 100}%`, background: "var(--bg-brand-solid)" }} />
                          </div>
                        </div>
                      ))
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* ── Section 4: Research Intelligence ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {/* Left: Ideas by Cluster */}
            <div style={{
              background: "var(--bg-primary)",
              border: "1px solid var(--border-tertiary)",
              borderRadius: 12,
              padding: 24,
              boxShadow: "var(--shadow-xs)",
            }}>
              <p style={{ fontSize: 10, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 16px" }}>
                IDEAS BY CLUSTER
              </p>
              {data.research.ideasByCluster.length === 0 ? (
                <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <p className="text-[var(--text-tertiary)]" style={{ fontSize: 13 }}>No cluster data for this period</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {data.research.ideasByCluster.map((item, i) => {
                    const maxCount = data.research.ideasByCluster[0]?.count ?? 1;
                    const pct = Math.round((item.count / maxCount) * 100);
                    return (
                      <div key={item.cluster}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <span style={{
                            fontSize: 12,
                            fontWeight: 500,
                            color: "var(--text-secondary)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: "75%",
                          }}>
                            {i + 1}. {item.cluster}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", flexShrink: 0 }}>
                            {item.count.toLocaleString()}
                          </span>
                        </div>
                        <div style={{ height: 4, background: "var(--bg-secondary)", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{
                            height: "100%",
                            width: `${pct}%`,
                            background: "var(--bg-brand-solid)",
                            borderRadius: 4,
                            transition: "width 400ms ease-out",
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Research Sessions */}
            <div style={sectionCard}>
              <p style={sectionLabel}>RESEARCH SESSIONS</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {[
                  { label: "Avg cost per session",  value: formatCost(data.research.avgResearchCost)      },
                  { label: "Avg iterations",        value: `${data.research.avgIterations}`               },
                  { label: "Total sessions",        value: `${data.research.totalResearchSessions}`       },
                ].map(({ label, value }, i) => (
                  <div key={label}>
                    {i > 0 && <div style={{ height: 1, background: "var(--border-tertiary)", margin: "14px 0" }} />}
                    <div>
                      <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: "0 0 4px" }}>{label}</p>
                      <p style={{ fontSize: 24, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Section 5: Cost & Efficiency ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {[
              {
                label: "Cost per Published Article",
                value: formatCost(data.cost.costPerPublishedArticle),
                sub:   "end-to-end",
                brand: true,
              },
              {
                label: "Avg Pipeline Cost / Article",
                value: formatCost(data.cost.avgPipelineCostPerArticle),
                sub:   undefined,
                brand: false,
              },
              {
                label: "Total Spend This Period",
                value: formatCost(data.cost.totalCost),
                sub:   "research + pipeline",
                brand: false,
              },
            ].map(({ label, value, sub, brand }) => (
              <div key={label} style={kpiCard}>
                <p style={{ fontSize: 10, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
                  {label}
                </p>
                <p style={{ fontSize: 28, fontWeight: 600, color: brand ? "var(--text-brand-primary)" : "var(--text-primary)", margin: 0 }}>
                  {value}
                </p>
                {sub && (
                  <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "4px 0 0" }}>{sub}</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && !data && (
        <div style={{ ...sectionCard, textAlign: "center", padding: 48 }}>
          <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>Failed to load Arthur metrics.</p>
        </div>
      )}
    </div>
  );
}
