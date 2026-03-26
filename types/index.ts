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

export interface DashboardMetrics {
  totalMonthlySpend: number;
  spendMonth: string;
  unpaidCount: number;
  unpaidTotal: number;
  overdueCount: number;
  upcomingDue: FinancialRecord[];
  spendByVendor: { vendor: string; total: number }[];
  monthlyTrend: { month: string; total: number; paid: number; unpaid: number; unpaidCount: number; overdueCount: number }[];
}

export interface Project {
  name: string;
  description: string;
  timeline: string | null;
  llms: LLMEntry[];
  services: string[];
  status: string | null;
  totalSpend: number | null; // null = TBD
}

export interface LLMEntry {
  provider: string;
  model: string;
  owner: string;
}

export interface Tool {
  name: string; // vendor/service name
  type: "llm" | "service";
  projects: string[];
  totalSpend: number;
  monthlyTrend: { month: string; total: number }[];
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
  computedAt: string;
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
