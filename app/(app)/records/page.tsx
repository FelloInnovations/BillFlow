import { RecordsTable } from "@/components/records/RecordsTable";
import { FinancialRecord, PaginatedResult } from "@/types";

const EMPTY_RECORDS: PaginatedResult<FinancialRecord> = {
  data: [],
  total: 0,
  page: 1,
  pageSize: 20,
  totalPages: 0,
};

async function getInitialData(): Promise<{
  records: PaginatedResult<FinancialRecord>;
  vendors: string[];
}> {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const [recordsRes, vendorsRes] = await Promise.all([
      fetch(`${base}/api/invoices?page=1&pageSize=20`, { cache: "no-store" }),
      fetch(`${base}/api/invoices/vendors`, { cache: "no-store" }),
    ]);

    const records = recordsRes.ok ? await recordsRes.json() : EMPTY_RECORDS;
    const vendors = vendorsRes.ok ? await vendorsRes.json() : { vendors: [] };

    return { records, vendors: vendors.vendors ?? [] };
  } catch {
    return { records: EMPTY_RECORDS, vendors: [] };
  }
}

export default async function RecordsPage() {
  const { records, vendors } = await getInitialData();

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Financial Records</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">All invoices, sorted by date</p>
      </div>
      <RecordsTable initial={records} vendors={vendors} />
    </div>
  );
}
