export interface HubspotTicket {
  id: string;
  created_at: string;
  ticket_link: string | null;
  category: string | null;
  list_detail: string | null;
  contacts_to_enrich: number;
  fields_to_enrich: string | null;
  eta: string | null;
  enrichment_status: string | null;
  valid_enriched: number | null;
  hit_rate: number | null;
  final_status: string | null;
  notes: string | null;
  owner: string | null;
}

export interface FinancialRecord {
  id: string;
  created_at: string;
  email_id: string | null;
  email_subject: string | null;
  email_from: { name?: string; email?: string } | null;
  email_date: string | null;
  pdf_filename: string | null;
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  currency: string;
  payment_status: "pending" | "paid" | "overdue";
  description: string | null;
}

export interface SharedInfraService {
  name: string;
  total: number;
}

export interface SharedInfrastructure {
  services: SharedInfraService[];
  total: number;
}

export interface DashboardMetrics {
  totalMonthlySpend: number;
  spendMonth: string;
  unpaidCount: number;
  unpaidTotal: number;
  overdueCount: number;
  upcomingDue: FinancialRecord[];
  spendByVendor: { vendor: string; total: number }[];
  monthlyTrend: { month: string; total: number; paid: number; unpaid: number; unpaidCount: number; overdueCount: number; source?: "invoice" | "snapshot" | "none" }[];
  sharedInfrastructure: SharedInfrastructure;
  dataWarning?: {
    invoiceDataThrough: string;
    snapshotDataThrough: string;
    invoiceIngestionStalled: boolean;
  };
}

export interface Project {
  name: string;
  description: string;
  timeline: string | null;
  llms: LLMEntry[];
  services: string[];
  status: string | null;
  totalSpend: number | null;
  openrouter_api_key: string | null;
  spendBasis?: "metered" | "shared_key" | "none" | null;
}

export interface OpenRouterKeyUsage {
  key_name: string | null;
  key_hash: string | null;
  usage_total: number;
  monthly: Record<string, number>;
}

export interface LLMEntry {
  provider: string;
  model: string;
  owner: string;
}

export interface Tool {
  name: string;          // internal key: "OpenRouter", "OpenRouter:octo", "Supabase"
  displayLabel: string;  // UI label: "OpenRouter", "OpenRouter — Octo, YoungTeam Octo"
  rawKey?: string;       // for OR per-key entries only — raw key name shown in tooltip
  type: "llm" | "service";
  projects: string[];          // union of auto + manual
  autoProjects: string[];      // from OpenRouter key matching
  manualProjects: string[];    // from tool_project_overrides
  hasManualOverride: boolean;
  totalSpend: number;
  monthlyTrend: { month: string; total: number }[];
  hidden?: boolean;
  notes?: string;
}

export interface FlaggedBilledVendor {
  vendor_name: string;
  latest_invoice_date: string | null;
  latest_total_amount: number | null;
  payment_status: string | null;
  invoice_count: number;
}

export interface NeverUsedVendor {
  vendor_name: string;
  total_spend: number;
}

export interface FlaggedToolsData {
  billedInactive: FlaggedBilledVendor[];
  neverUsed: NeverUsedVendor[];
}

export interface VendorForecast {
  vendor: string;
  forecastedAmount: number;
  last3Months: { month: string; amount: number }[];
  hasRecentActivity: boolean;
  trend: "up" | "down" | "stable";
}

export interface ForecastResult {
  forecasts: VendorForecast[];
  inactiveVendors: VendorForecast[];
  totalForecast: number;
  nextMonthName: string;
  anchorDate?: string;
  computedAt: string;
}

export interface ActivityKeyData {
  key_name: string;
  project_name: string;
  project_status: string | null;
  monthly: { month: string; spend: number }[];
  total: number;
  min: number;
  max: number;
  avg: number;
  trend: "up" | "down" | "stable" | null;
  current_month_spend: number;
  models: string[];
}

export interface LogEntry {
  id: string;
  key_name: string;
  project_name: string | null;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  cost_usd: number | null;
  invoked_at: string;
  provider_name: string | null;
  endpoint_id: string | null;
  source: string;
}

export interface ActivityData {
  keys: ActivityKeyData[];
  months: string[];
  all_projects: { project_name: string; key_name: string | null; status: string | null }[];
  last_synced_at: string | null;
  latest_date: string | null;
}

export interface Guardrail {
  id: string;
  project_name: string;
  monthly_budget_usd: number | null;
  warning_threshold_pct: number;
  recommended_budget_usd: number | null;
  last_warned_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AlertPeriod = 'monthly';
export type AlertStatus = 'ok' | 'warning' | 'breached';

export interface SpendAlert {
  id: string;
  project_name: string;
  openrouter_key_name: string;
  // set by BillFlow user
  limit_usd: number;
  limit_period: AlertPeriod;
  warning_pct: number;
  // written by n8n after each check
  current_spend: number;
  current_pct: number;
  status: AlertStatus;
  last_checked_at: string | null;
  warning_notified_at: string | null;
  breach_notified_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InvoiceFilters {
  vendor?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── Outcomes / Arthur KPIs ────────────────────────────────────────────────────

export interface OutcomeMetricConfig {
  id: string;
  project_id: string;
  metric_key: string;
  label: string;
  target_value: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface OutcomeMetricRow {
  id: string;
  project_id: string;
  metric_key: string;
  value: number;
  date: string;
  source: string;
  notes: string | null;
  created_at: string;
}

export type OutcomeMtdSummary = Record<string, number>;

export interface OutcomeSyncResult {
  date: string;
  upserted: { metric_key: string; value: number }[];
  errors:   { metric_key: string; error: string }[];
}

export interface ProjectOutcomeSummary {
  projectId: string;
  projectName: string | null;
  projectStatus: string | null;
  mtd: OutcomeMtdSummary;
  lastSynced: string | null;
}
