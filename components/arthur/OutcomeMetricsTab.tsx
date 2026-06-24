"use client";
import { useEffect, useState } from "react";

type ApiResponse = {
  mtd: Record<string, number>;
  lastSynced: string | null;
  monthlyBreakdown: { month: string; monthLabel: string; metrics: Record<string, number> }[];
};

type ContactFunnel = { traffic: number; booked: number; held: number; won: number; arr: number };

export function OutcomeMetricsTab({ projectId, period }: { projectId: string; period: string }) {
  const [contactFunnel, setContactFunnel] = useState<ContactFunnel | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/outcomes/${projectId}`)
      .then(r => r.json())
      .then((d: ApiResponse) => {
        console.log("[OutcomeMetricsTab] response:", d);
        const breakdown = d.monthlyBreakdown ?? [];
        // traffic is a daily additive key — sum across all months
        const traffic = breakdown.reduce((s, b) => s + (b.metrics.llm_traffic_daily ?? 0), 0);
        // cumulative MTD keys: each month's entry holds that month's final total — sum for all-time
        const booked = breakdown.reduce((s, b) => s + (b.metrics.demos_booked_mtd ?? 0), 0);
        const held   = breakdown.reduce((s, b) => s + (b.metrics.demos_held_mtd   ?? 0), 0);
        const won    = breakdown.reduce((s, b) => s + (b.metrics.closed_won_mtd   ?? 0), 0);
        const arr    = breakdown.reduce((s, b) => s + (b.metrics.arr_closed_mtd   ?? 0), 0);
        if (traffic + booked + held + won + arr > 0) {
          setContactFunnel({ traffic, booked, held, won, arr });
        }
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
    { label: "Traffic", value: traffic,  rate: null,                                                                   isCurrency: false },
    { label: "Booked",  value: booked,   rate: traffic > 0 ? Math.round(booked / traffic * 1000) / 10 : 0,            isCurrency: false },
    { label: "Held",    value: held,     rate: booked  > 0 ? Math.round(held   / booked  * 1000) / 10 : 0,            isCurrency: false },
    { label: "Won",     value: won,      rate: held    > 0 ? Math.round(won    / held    * 1000) / 10 : 0,            isCurrency: false },
    { label: "ARR",     value: arr,      rate: null,                                                                   isCurrency: true  },
  ];

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

      {/* KPI breakdown cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {[
          { label: "Book rate",         value: `${stages[1].rate}%`,                                         sub: "traffic → booked"  },
          { label: "Show rate",         value: `${stages[2].rate}%`,                                         sub: "booked → held"     },
          { label: "Close rate",        value: `${stages[3].rate}%`,                                         sub: "held → won"        },
          { label: "Avg ARR per deal",  value: won > 0 ? `$${Math.round(arr / won).toLocaleString()}` : "—", sub: "arr ÷ won deals"   },
        ].map(card => (
          <div key={card.label} style={{ background: "var(--bg-primary)", border: "1px solid var(--border-tertiary)", borderRadius: 12, padding: "20px 24px", boxShadow: "var(--shadow-xs)" }}>
            <p style={{ fontSize: 10, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>{card.label}</p>
            <p style={{ fontSize: 26, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{card.value}</p>
            <p style={{ fontSize: 11, color: "var(--text-quaternary)", margin: "4px 0 0" }}>{card.sub}</p>
          </div>
        ))}
      </div>

    </div>
  );
}
