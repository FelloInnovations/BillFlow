"use client";

import { X, AlertTriangle, Ban } from "lucide-react";
import { FlaggedBilledVendor, NeverUsedVendor } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Props {
  billedInactive: FlaggedBilledVendor[];
  neverUsed: NeverUsedVendor[];
  onClose: () => void;
}

export function FlaggedToolsModal({ billedInactive, neverUsed, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl bg-[var(--bg-primary)] border border-[var(--border-tertiary)] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-tertiary)] shrink-0">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Flagged Tools</h2>
            <p className="text-xs text-[var(--text-quaternary)] mt-0.5">
              {billedInactive.length + neverUsed.length} issue{billedInactive.length + neverUsed.length !== 1 ? "s" : ""} detected
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] text-[var(--text-quaternary)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-6" style={{ scrollbarWidth: "thin" }}>
          {billedInactive.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-[var(--bg-warning-primary)]">
                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--text-warning-primary)]" />
                </div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Paying but not in active use
                </h3>
                <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--bg-warning-primary)] text-[var(--text-warning-primary)]">
                  {billedInactive.length}
                </span>
              </div>
              <div className="space-y-2">
                {billedInactive.map((v) => (
                  <div
                    key={v.vendor_name}
                    className="rounded-lg border border-[var(--border-warning)] bg-[var(--bg-warning-primary)] px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {v.vendor_name}
                        </p>
                        <p className="text-xs text-[var(--text-warning-primary)] mt-0.5">
                          Not used in any currently active project
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {v.latest_total_amount != null && (
                          <p className="text-sm font-semibold text-[var(--text-primary)]">
                            {formatCurrency(v.latest_total_amount)}
                          </p>
                        )}
                        <p className="text-xs text-[var(--text-quaternary)]">
                          {v.payment_status ?? "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-[var(--text-quaternary)]">
                      {v.latest_invoice_date && (
                        <span>Last invoice: {formatDate(v.latest_invoice_date)}</span>
                      )}
                      <span>{v.invoice_count} invoice{v.invoice_count !== 1 ? "s" : ""} in window</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {neverUsed.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-[var(--bg-error-primary)]">
                  <Ban className="w-3.5 h-3.5 text-[var(--text-error-primary)]" />
                </div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Never used in any project
                </h3>
                <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--bg-error-primary)] text-[var(--text-error-primary)]">
                  {neverUsed.length}
                </span>
              </div>
              <div className="space-y-2">
                {neverUsed.map((v) => (
                  <div
                    key={v.vendor_name}
                    className="rounded-lg border border-[var(--border-error)] bg-[var(--bg-error-primary)] px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {v.vendor_name}
                        </p>
                        <p className="text-xs text-[var(--text-error-primary)] mt-0.5">
                          This tool has never appeared in any project past or present
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-[var(--text-primary)] shrink-0">
                        {formatCurrency(v.total_spend)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {billedInactive.length === 0 && neverUsed.length === 0 && (
            <p className="text-sm text-[var(--text-quaternary)] text-center py-8">No flagged tools found.</p>
          )}
        </div>
      </div>
    </div>
  );
}
