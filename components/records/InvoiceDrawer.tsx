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
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-[420px] bg-white border-l border-border z-50 flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="font-semibold text-sm">{invoice.vendor_name ?? "Unknown Vendor"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Invoice #{invoice.invoice_number ?? "N/A"}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Status badge */}
          <span className={cn(
            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
            isPaid
              ? "bg-green-50 text-green-700"
              : invoice.payment_status === "overdue"
              ? "bg-red-50 text-red-700"
              : "bg-yellow-50 text-yellow-700"
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
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd className="mt-0.5 break-words">{value as string}</dd>
                </div>
              ) : null
            )}
          </dl>

          {/* Amounts */}
          <div className="rounded-md bg-muted p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(invoice.subtotal, invoice.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span>{formatCurrency(invoice.tax_amount, invoice.currency)}</span>
            </div>
            <div className="flex justify-between font-semibold border-t border-border pt-2 mt-1">
              <span>Total</span>
              <span>{formatCurrency(invoice.total_amount, invoice.currency)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        {!isPaid && (
          <div className="px-5 py-4 border-t border-border">
            <button
              onClick={markPaid}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
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
