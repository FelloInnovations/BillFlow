"use client";

import { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { ArthurMetrics } from "@/types";
import { OutcomeMetricsTab } from "./OutcomeMetricsTab";

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
  const [tab, setTab] = useState<"input" | "outcome">("input");
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

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 4, padding: "2px", background: "var(--bg-secondary)", borderRadius: 10, width: "fit-content" }}>
        {(["input", "outcome"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "7px 20px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: "none",
              background: tab === t ? "var(--bg-primary)" : "transparent",
              color: tab === t ? "var(--text-primary)" : "var(--text-tertiary)",
              cursor: "pointer",
              boxShadow: tab === t ? "var(--shadow-sm)" : "none",
              transition: "all 200ms ease-out",
            }}
          >
            {t === "input" ? "Input Metrics" : "Outcome Metrics"}
          </button>
        ))}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {!loading && data && (
        <>
          {tab === "input" && (
            <>
              {/* ── Funnel ── */}
              <div style={sectionCard}>
                <p style={sectionLabel}>PIPELINE FUNNEL · {period.toUpperCase()}</p>
                <div style={{ display: "flex", alignItems: "center", overflowX: "auto", gap: 0 }}>
                  {/* Research Sessions */}
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

                  {/* Ideas */}
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

                  {/* Articles Created */}
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

                  {/* Published */}
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

                {/* Stats bar */}
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border-tertiary)", display: "flex", gap: 32, flexWrap: "wrap" }}>
                  {[
                    { label: "Tokens consumed",         value: formatTokens(data.kpi.totalTokens) },
                    { label: "Idea → article rate",     value: `${data.kpi.conversionRate}%` },
                    { label: "Article → published rate", value: `${data.funnel.articlesToPublishedRate}%` },
                    { label: "Full funnel rate",         value: `${data.funnel.fullFunnelRate}%` },
                  ].map(stat => (
                    <div key={stat.label}>
                      <p style={{ fontSize: 10, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 4px" }}>{stat.label}</p>
                      <p style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{stat.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Row A: Quality Score + Published Over Time ── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {/* Quality Score Over Time */}
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

                {/* Articles Published Over Time */}
                <div style={{ background: "var(--bg-primary)", border: "1px solid var(--border-tertiary)", borderRadius: 12, padding: 24, boxShadow: "var(--shadow-xs)" }}>
                  <p style={{ fontSize: 10, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
                    ARTICLES PUBLISHED OVER TIME
                  </p>
                  <p style={{ fontSize: 28, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 16px" }}>
                    {data.kpi.totalPublished}{" "}
                    <span style={{ fontSize: 13, fontWeight: 400, color: "var(--text-tertiary)" }}>total published</span>
                  </p>
                  {data.quality.publishedOverTime.length === 0 ? (
                    <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
                      No published articles in this period
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={data.quality.publishedOverTime} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                        <XAxis
                          dataKey="week"
                          tickFormatter={w => {
                            const d = new Date(w);
                            return `${d.toLocaleString("default", { month: "short" })} ${d.getDate()}`;
                          }}
                          tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{ background: "var(--bg-primary)", border: "1px solid var(--border-tertiary)", borderRadius: 8, fontSize: 12 }}
                          labelFormatter={w => {
                            const d = new Date(w);
                            return `Week of ${d.toLocaleString("default", { month: "short" })} ${d.getDate()}`;
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="count"
                          stroke="#098486"
                          strokeWidth={2}
                          dot={{ fill: "#098486", r: 3 }}
                          name="Published"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* ── Row B: Pipeline Health + Research Sessions ── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {/* Pipeline Health */}
                <div style={sectionCard}>
                  <p style={sectionLabel}>PIPELINE HEALTH</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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

                {/* Research Sessions */}
                <div style={sectionCard}>
                  <p style={sectionLabel}>RESEARCH SESSIONS</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {[
                      { label: "Avg cost per session", value: formatCost(data.research.avgResearchCost)      },
                      { label: "Avg iterations",       value: `${data.research.avgIterations}`               },
                      { label: "Total sessions",       value: `${data.research.totalResearchSessions}`       },
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

              {/* ── Articles by Cluster & Content Path ── */}
              <div style={{ ...sectionCard, marginTop: 16 }}>
                <div style={sectionLabel}>Articles by Cluster &amp; Content Path</div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 12 }}>
                  {([
                    {
                      key: "felix" as const,
                      label: "Felix",
                      color: "#f87171",
                      clusterData: data.articles?.byCluster.felix,
                      matrix: data.articles?.clusterPathMatrix.felix,
                    },
                    {
                      key: "agentic-real-estate" as const,
                      label: "Agentic Real Estate",
                      color: "#34d399",
                      clusterData: data.articles?.byCluster.agenticRealEstate,
                      matrix: data.articles?.clusterPathMatrix["agentic-real-estate"],
                    },
                  ] as const).map(({ label, color, clusterData, matrix }) => {
                    const total     = clusterData?.total     ?? 0;
                    const published = clusterData?.published ?? 0;
                    return (
                      <div key={label} style={{
                        border: `1px solid ${color}33`,
                        borderRadius: 10,
                        padding: 14,
                        background: `${color}08`,
                      }}>
                        {/* Header */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
                          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                            {label}
                          </div>
                          <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-tertiary)" }}>
                            {total} total · {published} published
                          </div>
                        </div>

                        {/* Content path rows */}
                        {([
                          { pathKey: "blogs" as const,                 pathLabel: "/blogs",                 pathColor: "#818cf8", cell: matrix?.blogs                  },
                          { pathKey: "agentic-real-estate" as const,   pathLabel: "/agentic-real-estate",   pathColor: "#fb923c", cell: matrix?.["agentic-real-estate"] },
                        ] as const).map(({ pathLabel, pathColor, cell }) => {
                          const count = cell?.count     ?? 0;
                          const pub   = cell?.published ?? 0;
                          const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
                          return (
                            <div key={pathLabel} style={{ marginBottom: 12 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "monospace" }}>
                                  {pathLabel}
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                                  {count}
                                  <span style={{ fontWeight: 400, color: "var(--text-tertiary)", marginLeft: 4 }}>
                                    ({pct}%)
                                  </span>
                                </span>
                              </div>
                              <div style={{ height: 6, borderRadius: 3, background: "var(--bg-secondary)", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${pct}%`, background: pathColor, borderRadius: 3, transition: "width 0.4s ease" }} />
                              </div>
                              <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 3 }}>
                                {pub} published
                              </div>
                            </div>
                          );
                        })}

                        {total === 0 && (
                          <div style={{ fontSize: 12, color: "var(--text-tertiary)", textAlign: "center", padding: "8px 0" }}>
                            No articles in this cluster yet
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Cost & Efficiency ── */}
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

          {tab === "outcome" && (
            <OutcomeMetricsTab projectId="arthur" period={period} />
          )}
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
