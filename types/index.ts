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
  monthlyTrend: { month: string; total: number }[];
}

export interface Project {
  name: string;
  description: string;
  timeline: string | null;
  llms: LLMEntry[];
  services: string[];
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
