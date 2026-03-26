"use client";

import { useState, useEffect, useRef } from "react";
import { X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

const today = () => new Date().toISOString().split("T")[0];

const INITIAL_FORM = {
  vendorName:     "",
  invoiceNumber:  "",
  invoiceDate:    today(),
  dueDate:        "",
  subtotal:       "",
  taxAmount:      "0",
  totalAmount:    "",
  currency:       "USD",
  paymentStatus:  "pending",
  description:    "",
};

type Form = typeof INITIAL_FORM;
type Errors = Partial<Record<keyof Form, string>>;

// ── Styled input primitives ───────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
      {children}
    </label>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-red-400">{msg}</p>;
}

const inputCls = "w-full rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm px-3 py-2 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-colors";

// ── Main component ────────────────────────────────────────────────────────────
export function AddInvoiceModal({ onClose, onSaved }: Props) {
  const [form, setForm]               = useState<Form>(INITIAL_FORM);
  const [errors, setErrors]           = useState<Errors>({});
  const [totalIsAuto, setTotalIsAuto] = useState(true);  // auto-calc until user overrides
  const [saving, setSaving]           = useState(false);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Focus vendor name on mount
  useEffect(() => { firstInputRef.current?.focus(); }, []);

  // Auto-calculate total when subtotal or tax changes (unless total was manually set)
  useEffect(() => {
    if (!totalIsAuto) return;
    const sub = parseFloat(form.subtotal) || 0;
    const tax = parseFloat(form.taxAmount) || 0;
    setForm((f) => ({ ...f, totalAmount: (sub + tax).toFixed(2) === "0.00" ? "" : (sub + tax).toFixed(2) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.subtotal, form.taxAmount]);

  function setField(key: keyof Form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function handleTotalChange(value: string) {
    setTotalIsAuto(false);
    setField("totalAmount", value);
  }

  // Re-enable auto-calc when subtotal/tax is edited after manual total override
  function handleSubtaxChange(key: "subtotal" | "taxAmount", value: string) {
    setTotalIsAuto(true);
    setField(key, value);
  }

  // Has the user typed anything meaningful?
  const isDirty =
    form.vendorName    !== INITIAL_FORM.vendorName    ||
    form.invoiceNumber !== INITIAL_FORM.invoiceNumber ||
    form.invoiceDate   !== today()                    ||
    form.dueDate       !== INITIAL_FORM.dueDate       ||
    form.subtotal      !== INITIAL_FORM.subtotal      ||
    form.taxAmount     !== INITIAL_FORM.taxAmount     ||
    form.description   !== INITIAL_FORM.description;

  function requestClose() {
    if (isDirty) { setDiscardPrompt(true); } else { onClose(); }
  }

  function validate(): boolean {
    const e: Errors = {};
    if (!form.vendorName.trim())   e.vendorName   = "Vendor name is required";
    if (!form.invoiceDate)         e.invoiceDate   = "Invoice date is required";
    const sub = parseFloat(form.subtotal);
    if (!form.subtotal || isNaN(sub) || sub < 0) e.subtotal = "Subtotal must be a positive number";
    const total = parseFloat(form.totalAmount);
    if (!form.totalAmount || isNaN(total) || total < 0) e.totalAmount = "Total must be a positive number";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor_name:    form.vendorName.trim(),
          invoice_number: form.invoiceNumber.trim() || null,
          invoice_date:   form.invoiceDate,
          due_date:       form.dueDate || null,
          subtotal:       parseFloat(form.subtotal),
          tax_amount:     parseFloat(form.taxAmount) || 0,
          total_amount:   parseFloat(form.totalAmount),
          currency:       form.currency,
          payment_status: form.paymentStatus,
          description:    form.description.trim() || null,
        }),
      });
      if (res.ok) {
        onSaved();
      } else {
        const body = await res.json().catch(() => ({}));
        setErrors({ vendorName: body.error ?? "Failed to save. Please try again." });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={requestClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-[480px] max-h-[90vh] flex flex-col rounded-2xl bg-[#0e1219] border border-slate-700 shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Add Invoice</h2>
              <p className="text-xs text-slate-500 mt-0.5">Manual entry — not linked to email</p>
            </div>
            <button
              onClick={requestClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form body */}
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4" style={{ scrollbarWidth: "thin" }}>

            {/* Vendor Name */}
            <div>
              <Label>Vendor Name *</Label>
              <input
                ref={firstInputRef}
                type="text"
                value={form.vendorName}
                onChange={(e) => setField("vendorName", e.target.value)}
                placeholder="e.g. Anthropic"
                className={cn(inputCls, errors.vendorName && "border-red-500 focus:ring-red-500")}
              />
              <FieldError msg={errors.vendorName} />
            </div>

            {/* Invoice Number */}
            <div>
              <Label>Invoice Number</Label>
              <input
                type="text"
                value={form.invoiceNumber}
                onChange={(e) => setField("invoiceNumber", e.target.value)}
                placeholder="e.g. INV-2024-001"
                className={inputCls}
              />
            </div>

            {/* Date row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Invoice Date *</Label>
                <input
                  type="date"
                  value={form.invoiceDate}
                  onChange={(e) => setField("invoiceDate", e.target.value)}
                  className={cn(inputCls, errors.invoiceDate && "border-red-500 focus:ring-red-500")}
                />
                <FieldError msg={errors.invoiceDate} />
              </div>
              <div>
                <Label>Due Date</Label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setField("dueDate", e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            {/* Amount row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Subtotal *</Label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.subtotal}
                  onChange={(e) => handleSubtaxChange("subtotal", e.target.value)}
                  placeholder="0.00"
                  className={cn(inputCls, errors.subtotal && "border-red-500 focus:ring-red-500")}
                />
                <FieldError msg={errors.subtotal} />
              </div>
              <div>
                <Label>Tax Amount</Label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.taxAmount}
                  onChange={(e) => handleSubtaxChange("taxAmount", e.target.value)}
                  placeholder="0.00"
                  className={inputCls}
                />
              </div>
            </div>

            {/* Total Amount */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Label>Total Amount *</Label>
                {totalIsAuto && form.totalAmount !== "" && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-cyan-900/50 text-cyan-400 border border-cyan-800/60 -mt-1">
                    <Sparkles className="w-2.5 h-2.5" />
                    auto
                  </span>
                )}
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.totalAmount}
                onChange={(e) => handleTotalChange(e.target.value)}
                placeholder="0.00"
                className={cn(inputCls, errors.totalAmount && "border-red-500 focus:ring-red-500")}
              />
              <FieldError msg={errors.totalAmount} />
            </div>

            {/* Currency + Status row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Currency</Label>
                <select
                  value={form.currency}
                  onChange={(e) => setField("currency", e.target.value)}
                  className={inputCls}
                >
                  {["USD", "INR", "GBP", "EUR"].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Payment Status</Label>
                <select
                  value={form.paymentStatus}
                  onChange={(e) => setField("paymentStatus", e.target.value)}
                  className={inputCls}
                >
                  <option value="pending">pending</option>
                  <option value="paid">paid</option>
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <Label>Description</Label>
              <textarea
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                placeholder="Optional notes…"
                rows={2}
                className={cn(inputCls, "resize-none")}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-slate-800 flex items-center gap-3 shrink-0">
            <button
              onClick={requestClose}
              className="flex-1 py-2 rounded-lg border border-slate-700 text-slate-400 text-sm font-medium hover:bg-slate-800 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-900 text-sm font-bold transition-colors"
            >
              {saving ? "Saving…" : "Save Invoice"}
            </button>
          </div>
        </div>
      </div>

      {/* Discard confirmation */}
      {discardPrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDiscardPrompt(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-[#0e1219] border border-slate-700 shadow-2xl p-6 text-center space-y-4">
            <p className="text-sm font-semibold text-slate-200">Discard unsaved changes?</p>
            <p className="text-xs text-slate-400">Your form data will be lost.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDiscardPrompt(false)}
                className="flex-1 py-2 rounded-lg border border-slate-700 text-slate-400 text-sm font-medium hover:bg-slate-800 transition-colors"
              >
                Keep editing
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-bold transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
