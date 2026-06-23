"use client";

import { useState } from "react";
import { FinancialRecord } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { X, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  invoice: FinancialRecord | null;
  onClose: () => void;
  onMarkedPaid: (id: string) => void;
}

export function InvoiceDrawer({ invoice, onClose, onMarkedPaid }: Props) {
  const [loading, setLoading] = useState(false);

  if (!invoice) return null;

  async function markPaid() {
    if (!invoice) return;
    setLoading(true);
    try {
      await fetch(`/api/invoices/${invoice.id}/paid`, { method: "PATCH" });
      onMarkedPaid(invoice.id);
    } finally {
      setLoading(false);
    }
  }

  const isPaid = invoice.payment_status === "paid";

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 bottom-0 w-[420px] bg-[var(--bg-primary)] border-l border-[var(--border-tertiary)] z-50 flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-tertiary)]">
          <div>
            <p className="font-semibold text-sm text-[var(--text-primary)]">{invoice.vendor_name ?? "Unknown Vendor"}</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Invoice #{invoice.invoice_number ?? "N/A"}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition-colors">
            <X className="w-4 h-4 text-[var(--text-tertiary)]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <span className={cn(
            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
            isPaid
              ? "bg-[var(--bg-success-primary)] text-[var(--text-success-primary)]"
              : invoice.payment_status === "overdue"
              ? "bg-[var(--bg-error-primary)] text-[var(--text-error-primary)]"
              : "bg-[var(--bg-warning-primary)] text-[var(--text-warning-primary)]"
          )}>
            {invoice.payment_status}
          </span>

          <dl className="space-y-3 text-sm">
            {[
              ["Invoice Date", formatDate(invoice.invoice_date)],
              ["Due Date", formatDate(invoice.due_date)],
              ["Email Date", formatDate(invoice.email_date)],
              ["Subject", invoice.email_subject],
              ["Description", invoice.description],
              ["PDF", invoice.pdf_filename],
            ].map(([label, value]) =>
              value ? (
                <div key={label as string}>
                  <dt className="text-[var(--text-tertiary)] text-xs">{label}</dt>
                  <dd className="mt-0.5 break-words text-[var(--text-primary)]">{value as string}</dd>
                </div>
              ) : null
            )}
          </dl>

          <div className="rounded-lg bg-[var(--bg-secondary\_subtle)] p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--text-tertiary)]">Subtotal</span>
              <span className="text-[var(--text-primary)]">{formatCurrency(invoice.subtotal, invoice.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-tertiary)]">Tax</span>
              <span className="text-[var(--text-primary)]">{formatCurrency(invoice.tax_amount, invoice.currency)}</span>
            </div>
            <div className="flex justify-between font-semibold border-t border-[var(--border-tertiary)] pt-2 mt-1">
              <span className="text-[var(--text-primary)]">Total</span>
              <span className="text-[var(--text-primary)]">{formatCurrency(invoice.total_amount, invoice.currency)}</span>
            </div>
          </div>
        </div>

        {!isPaid && (
          <div className="px-5 py-4 border-t border-[var(--border-tertiary)]">
            <button
              onClick={markPaid}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-60 transition-colors"
              style={{ backgroundColor: "var(--bg-brand-solid)" }}
            >
              <CheckCircle2 className="w-4 h-4" />
              {loading ? "Marking…" : "Mark as Paid"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
