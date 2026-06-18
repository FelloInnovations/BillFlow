import {
  Body,
  Button,
  Container,
  Column,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";
import type { WeeklyReportData } from "@/types";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatDelta(current: number, previous: number): { text: string; color: string } {
  if (previous === 0 && current === 0) return { text: "—", color: "#7F7F7F" };
  if (previous === 0) return { text: `+${usdCents.format(current)}`, color: "#e85440" };
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? "+" : "";
  const color = pct > 10 ? "#e85440" : pct < -10 ? "#10b981" : "#7F7F7F";
  return { text: `${sign}${pct.toFixed(0)}%`, color };
}

function alertStatusColor(status: "warning" | "breached"): string {
  return status === "breached" ? "#e85440" : "#f59e0b";
}

const BG       = "#FEFBF9";
const CARD_BG  = "#FFFFFF";
const BORDER   = "#E8E8E8";
const TEXT_MUT = "#7F7F7F";
const TEXT_LG  = "#353E5A";
const SALMON   = "#FF725C";
const NAVY     = "#093555";

function FunnelRow({ steps }: {
  steps: { label: string; value: number; currency?: boolean }[];
}) {
  return (
    <Row>
      {steps.map(({ label, value, currency }, i) => (
        <React.Fragment key={label}>
          <Column style={{ textAlign: "center" }}>
            <Text style={{ color: NAVY, fontSize: 18, fontWeight: 800, margin: 0 }}>
              {currency ? usd.format(value) : value.toLocaleString()}
            </Text>
            <Text style={{ color: TEXT_MUT, fontSize: 9, textTransform: "uppercase", letterSpacing: 1, margin: "2px 0 0" }}>
              {label}
            </Text>
          </Column>
          {i < steps.length - 1 && (
            <Column style={{ textAlign: "center", color: TEXT_MUT, fontSize: 11, width: 16 }}>→</Column>
          )}
        </React.Fragment>
      ))}
    </Row>
  );
}

export function WeeklyReportEmail({ data }: { data: WeeklyReportData }) {
  const spendDelta = formatDelta(data.totalSpendThisWeek, data.totalSpendLastWeek);
  const hasAnyOutcome = data.arthurHasData || data.enrichmentContactsHasData || data.enrichmentTeamsHasData;

  return (
    <Html>
      <Head />
      <Preview>BillFlow Weekly Digest · {data.weekLabel}</Preview>
      <Body style={{ backgroundColor: BG, fontFamily: "'Instrument Sans', ui-sans-serif, system-ui, sans-serif", margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 600, margin: "0 auto", padding: "32px 16px" }}>

          {/* Header */}
          <Section style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: SALMON, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "#fff", fontSize: 11, fontWeight: 900, letterSpacing: "-0.5px" }}>BF</span>
              </div>
            </div>
            <Heading style={{ color: NAVY, fontSize: 24, fontWeight: 800, margin: "0 0 4px" }}>
              BillFlow Weekly Digest
            </Heading>
            <Text style={{ color: TEXT_MUT, fontSize: 12, margin: 0 }}>{data.weekLabel}</Text>
          </Section>

          {/* OUTCOMES */}
          <Section style={{ marginBottom: 8 }}>
            <Text style={{ color: TEXT_MUT, fontSize: 10, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", margin: "0 0 12px" }}>
              OUTCOMES
            </Text>

            {!hasAnyOutcome ? (
              <Text style={{ color: TEXT_MUT, fontSize: 13, margin: "0 0 16px" }}>
                No new pipeline activity this week.
              </Text>
            ) : (
              <>
                {/* Arthur */}
                {data.arthurHasData && (
                  <Section style={{ backgroundColor: CARD_BG, borderRadius: 12, border: `1px solid ${BORDER}`, padding: "16px 20px", marginBottom: 12 }}>
                    <Text style={{ color: TEXT_LG, fontSize: 13, fontWeight: 700, margin: "0 0 12px" }}>Arthur</Text>
                    <FunnelRow steps={[
                      { label: "Booked", value: data.arthurDemosBooked },
                      { label: "Held",   value: data.arthurDemosHeld   },
                      { label: "Won",    value: data.arthurClosedWon   },
                      { label: "ARR",    value: data.arthurArrClosed, currency: true },
                    ]} />
                    <Text style={{ color: TEXT_MUT, fontSize: 10, margin: "10px 0 0" }}>This week · {data.weekLabel}</Text>
                  </Section>
                )}

                {/* Enrichment Contacts */}
                {data.enrichmentContactsHasData && (
                  <Section style={{ backgroundColor: CARD_BG, borderRadius: 12, border: `1px solid ${BORDER}`, padding: "16px 20px", marginBottom: 12 }}>
                    <Text style={{ color: TEXT_LG, fontSize: 13, fontWeight: 700, margin: "0 0 4px" }}>Enrichment · Contact Funnel</Text>
                    <Text style={{ color: TEXT_MUT, fontSize: 10, margin: "0 0 12px" }}>MAD ID pipeline</Text>
                    <FunnelRow steps={[
                      { label: "Pushed", value: data.enrichContactPushed },
                      { label: "Booked", value: data.enrichContactDemosBooked },
                      { label: "Held",   value: data.enrichContactDemosHeld   },
                      { label: "Won",    value: data.enrichContactClosedWon   },
                      { label: "ARR",    value: data.enrichContactArrClosed, currency: true },
                    ]} />
                    <Text style={{ color: TEXT_MUT, fontSize: 10, margin: "10px 0 0" }}>This week · {data.weekLabel}</Text>
                  </Section>
                )}

                {/* Enrichment Teams */}
                {data.enrichmentTeamsHasData && (
                  <Section style={{ backgroundColor: CARD_BG, borderRadius: 12, border: `1px solid ${BORDER}`, padding: "16px 20px", marginBottom: 0 }}>
                    <Text style={{ color: TEXT_LG, fontSize: 13, fontWeight: 700, margin: "0 0 4px" }}>Enrichment · Team Funnel</Text>
                    <Text style={{ color: TEXT_MUT, fontSize: 10, margin: "0 0 12px" }}>MAD ID pipeline</Text>
                    <FunnelRow steps={[
                      { label: "Pushed", value: data.enrichTeamPushed },
                      { label: "Booked", value: data.enrichTeamDemosBooked },
                      { label: "Held",   value: data.enrichTeamDemosHeld   },
                      { label: "Won",    value: data.enrichTeamClosedWon   },
                      { label: "ARR",    value: data.enrichTeamArrClosed, currency: true },
                    ]} />
                    <Text style={{ color: TEXT_MUT, fontSize: 10, margin: "10px 0 0" }}>This week · {data.weekLabel}</Text>
                  </Section>
                )}
              </>
            )}
          </Section>

          <Hr style={{ borderColor: BORDER, margin: "24px 0" }} />

          {/* SPENDS THIS WEEK */}
          <Section style={{ marginBottom: 8 }}>
            <Text style={{ color: TEXT_MUT, fontSize: 10, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", margin: "0 0 12px" }}>
              SPENDS THIS WEEK
            </Text>

            {/* Total with OR + invoice breakdown */}
            <Section style={{ backgroundColor: CARD_BG, borderRadius: 12, border: `1px solid ${BORDER}`, padding: "16px 20px", marginBottom: 12 }}>
              <Row>
                <Column>
                  <Text style={{ color: TEXT_MUT, fontSize: 11, margin: "0 0 4px" }}>Total spend this week</Text>
                  <Text style={{ color: NAVY, fontSize: 28, fontWeight: 800, margin: "0 0 6px" }}>
                    {usdCents.format(data.totalSpendThisWeek)}
                  </Text>
                  <Text style={{ color: TEXT_MUT, fontSize: 11, margin: 0 }}>
                    OpenRouter: {usdCents.format(data.totalSpendThisWeek - data.thisWeekInvoiceTotal)}
                    {data.thisWeekInvoiceTotal > 0 && `  ·  Invoices: ${usdCents.format(data.thisWeekInvoiceTotal)}`}
                  </Text>
                </Column>
                <Column style={{ textAlign: "right" }}>
                  <Text style={{ color: TEXT_MUT, fontSize: 11, margin: "0 0 4px" }}>vs last week</Text>
                  <Text style={{ color: spendDelta.color, fontSize: 20, fontWeight: 700, margin: 0 }}>
                    {spendDelta.text}
                  </Text>
                  <Text style={{ color: TEXT_MUT, fontSize: 10, margin: "2px 0 0" }}>
                    {usdCents.format(data.totalSpendLastWeek)} prior week
                  </Text>
                </Column>
              </Row>
            </Section>

            {/* Per-key rows with budget status */}
            {data.spendRows.length > 0 && (
              <Section style={{ backgroundColor: CARD_BG, borderRadius: 12, border: `1px solid ${BORDER}`, padding: "4px 0", marginBottom: 12 }}>
                {data.spendRows.map((row, i) => {
                  const delta    = formatDelta(row.thisWeek, row.lastWeek);
                  const usedPct  = row.monthlyLimit > 0 ? (row.mtdSpend / row.monthlyLimit) * 100 : 0;
                  const budgetIcon = usedPct >= 100 ? "🔴" : usedPct >= row.warningPct ? "🟡" : "🟢";
                  const showKey  = row.keyName !== row.projectName;
                  return (
                    <Row key={row.keyName} style={{ borderTop: i > 0 ? `1px solid ${BORDER}` : undefined, padding: "10px 20px" }}>
                      <Column>
                        <Text style={{ color: TEXT_LG, fontSize: 12, fontWeight: 600, margin: 0 }}>{row.projectName}</Text>
                        {showKey && (
                          <Text style={{ color: TEXT_MUT, fontSize: 10, margin: "2px 0 0" }}>{row.keyName}</Text>
                        )}
                        {row.monthlyLimit > 0 && (
                          <Text style={{ color: TEXT_MUT, fontSize: 10, margin: "4px 0 0" }}>
                            {budgetIcon} MTD {usd.format(row.mtdSpend)} / {usd.format(row.monthlyLimit)} ({usedPct.toFixed(0)}%)
                          </Text>
                        )}
                      </Column>
                      <Column style={{ textAlign: "right" }}>
                        <Text style={{ color: NAVY, fontSize: 13, fontWeight: 700, margin: 0 }}>{usdCents.format(row.thisWeek)}</Text>
                        <Text style={{ color: delta.color, fontSize: 10, margin: "2px 0 0" }}>{delta.text}</Text>
                      </Column>
                    </Row>
                  );
                })}
              </Section>
            )}

            {/* Budget alerts */}
            {data.activeAlerts.length > 0 && (
              <Section style={{ backgroundColor: "#FFF5F4", borderRadius: 12, border: "1px solid #ffc8c0", padding: "16px 20px", marginBottom: 12 }}>
                <Text style={{ color: "#e85440", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", margin: "0 0 10px" }}>
                  BUDGET ALERTS
                </Text>
                {data.activeAlerts.map((alert) => (
                  <Row key={alert.keyName} style={{ marginBottom: 8 }}>
                    <Column>
                      <Text style={{ color: TEXT_LG, fontSize: 12, fontWeight: 600, margin: 0 }}>{alert.projectName}</Text>
                      <Text style={{ color: TEXT_MUT, fontSize: 10, margin: "2px 0 0" }}>
                        {usd.format(alert.currentSpend)} / {usd.format(alert.limitUsd)} limit
                      </Text>
                    </Column>
                    <Column style={{ textAlign: "right" }}>
                      <Text style={{ color: alertStatusColor(alert.status), fontSize: 13, fontWeight: 800, margin: 0 }}>
                        {alert.currentPct.toFixed(0)}%
                      </Text>
                      <Text style={{ color: alertStatusColor(alert.status), fontSize: 9, textTransform: "uppercase", letterSpacing: 1, margin: "2px 0 0" }}>
                        {alert.status}
                      </Text>
                    </Column>
                  </Row>
                ))}
              </Section>
            )}
          </Section>

          <Hr style={{ borderColor: BORDER, margin: "24px 0" }} />

          {/* CTA */}
          <Section style={{ textAlign: "center", marginBottom: 24 }}>
            <Button
              href={`${process.env.NEXT_PUBLIC_BASE_URL ?? "https://spendsync-production.up.railway.app"}`}
              style={{
                backgroundColor: SALMON,
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                padding: "12px 28px",
                borderRadius: 8,
                textDecoration: "none",
              }}
            >
              Open BillFlow →
            </Button>
          </Section>

          <Text style={{ color: "#B0B0B0", fontSize: 10, textAlign: "center", margin: 0 }}>
            Generated {new Date(data.generatedAt).toUTCString()} · BillFlow by Fello AI
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default WeeklyReportEmail;
