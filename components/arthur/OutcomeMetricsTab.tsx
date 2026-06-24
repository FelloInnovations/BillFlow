"use client";
import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

type ApiResponse = {
  mtd: Record<string, number>;
  lastSynced: string | null;
  monthlyBreakdown: { month: string; monthLabel: string; metrics: Record<string, number> }[];
};

type ContactFunnel = { traffic: number; booked: number; held: number; won: number; arr: number };
type LlmBreakdown  = { chatgpt: number; perplexity: number; claude: number; other: number };

export function OutcomeMetricsTab({ projectId, period }: { projectId: string; period: string }) {
  const [contactFunnel, setContactFunnel] = useState<ContactFunnel | null>(null);
  const [llm, setLlm]                     = useState<LlmBreakdown>({ chatgpt: 0, perplexity: 0, claude: 0, other: 0 });
  const [lastSynced, setLastSynced]        = useState<string | null>(null);
  const [loading, setLoading]              = useState(true);

  useEffect(() => {
    fetch(`/api/outcomes/${projectId}`)
      .then(r => r.json())
      .then((d: ApiResponse) => {
        console.log("[OutcomeMetricsTab] response:", d);
        const breakdown = d.monthlyBreakdown ?? [];

        // cumulative MTD keys: each month's entry holds that month's final total — sum for all-time
        const traffic = breakdown.reduce((s, b) => s + (b.metrics.llm_traffic_daily ?? 0), 0);
        const booked  = breakdown.reduce((s, b) => s + (b.metrics.demos_booked_mtd  ?? 0), 0);
        const held    = breakdown.reduce((s, b) => s + (b.metrics.demos_held_mtd    ?? 0), 0);
        const won     = breakdown.reduce((s, b) => s + (b.metrics.closed_won_mtd    ?? 0), 0);
        const arr     = breakdown.reduce((s, b) => s + (b.metrics.arr_closed_mtd    ?? 0), 0);
        if (traffic + booked + held + won + arr > 0) {
          setContactFunnel({ traffic, booked, held, won, arr });
        }

        // LLM source breakdown — daily additive keys, sum across all months
        let chatgpt = 0, perplexity = 0, claude = 0, other = 0;
        for (const month of breakdown) {
          chatgpt    += Number(month.metrics?.llm_chatgpt_daily    ?? 0);
          perplexity += Number(month.metrics?.llm_perplexity_daily ?? 0);
          claude     += Number(month.metrics?.llm_claude_daily     ?? 0);
          other      += Number(month.metrics?.llm_other_daily      ?? 0);
        }
        setLlm({ chatgpt, perplexity, claude, other });

        if (d.lastSynced) {
          setLastSynced(new Date(d.lastSynced).toLocaleString("en-US", {
            month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
          }));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  if (loading) return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 16 }}>
      {[...Array(5)].map((_, i) => (
        <div key={i} style={{ height: 100, background: "var(--bg-secondary)", borderRadius: 12, animation: "pulse 1.5s infinite" }} />
      ))}
    </div>
  );

  if (!contactFunnel) return (
    <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-tertiary)", fontSize: 14 }}>
      No outcome data available for this project yet.
    </div>
  );

  const { traffic, booked, held, won, arr } = contactFunnel;
  const stages = [
    { label: "Traffic", value: traffic, rate: null,                                                        isCurrency: false },
    { label: "Booked",  value: booked,  rate: traffic > 0 ? Math.round(booked / traffic * 1000) / 10 : 0, isCurrency: false },
    { label: "Held",    value: held,    rate: booked  > 0 ? Math.round(held   / booked  * 1000) / 10 : 0, isCurrency: false },
    { label: "Won",     value: won,     rate: held    > 0 ? Math.round(won    / held    * 1000) / 10 : 0, isCurrency: false },
    { label: "ARR",     value: arr,     rate: null,                                                        isCurrency: true  },
  ];

  const llmTotal = llm.chatgpt + llm.perplexity + llm.claude + llm.other;
  const llmSources = [
    { name: "ChatGPT",    value: llm.chatgpt,    color: "#10B981" },
    { name: "Perplexity", value: llm.perplexity, color: "#3D93F5" },
    { name: "Claude",     value: llm.claude,     color: "#8D6AE7" },
    { name: "Other",      value: llm.other,      color: "#9298A9" },
  ].filter(s => s.value > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Funnel card */}
      <div style={{ background: "var(--bg-primary)", border: "1px solid var(--border-tertiary)", borderRadius: 12, padding: 28, boxShadow: "var(--shadow-xs)" }}>
        <p style={{ fontSize: 10, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 24px" }}>
          OUTCOME FUNNEL · ALL TIME
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 0, overflowX: "auto" }}>
          {stages.map((stage, i) => (
            <div key={stage.label} style={{ display: "contents" }}>
              <div style={{ flex: 1, minWidth: 120, textAlign: "center" }}>
                <div style={{
                  background: i === stages.length - 1 ? "var(--bg-success-primary)" : "var(--bg-secondary_subtle)",
                  borderRadius: 8,
                  padding: "20px 16px",
                  border: `1px solid ${i === stages.length - 1 ? "var(--border-success_subtle)" : "var(--border-tertiary)"}`,
                }}>
                  <p style={{ fontSize: 26, fontWeight: 600, color: i === stages.length - 1 ? "var(--text-success-primary)" : "var(--text-primary)", margin: 0 }}>
                    {stage.isCurrency
                      ? `$${Number(stage.value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                      : Number(stage.value).toLocaleString()}
                  </p>
                  <p style={{ fontSize: 10, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "4px 0 0" }}>
                    {stage.label}
                  </p>
                </div>
              </div>
              {i < stages.length - 1 && (
                <div style={{ textAlign: "center", padding: "0 8px", minWidth: 56, flexShrink: 0 }}>
                  {stage.rate !== null && (
                    <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-brand-primary)", margin: "0 0 4px" }}>{stage.rate}%</p>
                  )}
                  <p style={{ fontSize: 18, color: "var(--text-quaternary)", margin: 0 }}>→</p>
                </div>
              )}
            </div>
          ))}
        </div>
        {lastSynced && (
          <p style={{ fontSize: 11, color: "var(--text-quaternary)", margin: "20px 0 0", textAlign: "right" }}>
            Last synced {lastSynced}
          </p>
        )}
      </div>

      {/* LLM Traffic Source Breakdown */}
      <div style={{ background: "var(--bg-primary)", border: "1px solid var(--border-tertiary)", borderRadius: 12, padding: 24, boxShadow: "var(--shadow-xs)" }}>
        <p style={{ fontSize: 10, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 4px" }}>
          LLM TRAFFIC SOURCE
        </p>
        <p style={{ fontSize: 12, color: "var(--text-quaternary)", margin: "0 0 20px" }}>
          Which AI tools are sending contacts to Arthur&apos;s content
        </p>

        {llmTotal === 0 ? (
          <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
            No LLM traffic data for this period
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "center" }}>

            {/* Pie chart */}
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={llmSources}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {llmSources.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-tertiary)",
                    borderRadius: 8,
                    fontSize: 12,
                    fontFamily: "Inter, sans-serif",
                  }}
                  formatter={(value: number, name: string) => [
                    `${value} contacts (${llmTotal > 0 ? Math.round(value / llmTotal * 100) : 0}%)`,
                    name,
                  ]}
                />
                <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 22, fontWeight: 600, fill: "#353E5A", fontFamily: "Inter, sans-serif" }}>
                  {llmTotal}
                </text>
                <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 10, fontWeight: 500, fill: "#6B748E", fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  total
                </text>
              </PieChart>
            </ResponsiveContainer>

            {/* Legend with percentages */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {llmSources.map(source => {
                const pct = llmTotal > 0 ? Math.round((source.value / llmTotal) * 100) : 0;
                return (
                  <div key={source.name}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: source.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>{source.name}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{source.value}</span>
                        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-quaternary)", minWidth: 36, textAlign: "right" }}>{pct}%</span>
                      </div>
                    </div>
                    <div style={{ height: 3, background: "var(--bg-secondary)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: source.color, borderRadius: 3, transition: "width 400ms ease-out" }} />
                    </div>
                  </div>
                );
              })}

              <div style={{ marginTop: 4, paddingTop: 12, borderTop: "1px solid var(--border-tertiary)" }}>
                <p style={{ fontSize: 11, color: "var(--text-quaternary)", margin: 0 }}>
                  Based on HubSpot original traffic source drill-down · All time
                </p>
              </div>
            </div>

          </div>
        )}
      </div>

    </div>
  );
}
