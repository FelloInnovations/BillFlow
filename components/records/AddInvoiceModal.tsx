"use client";

import { useState, useEffect, useRef } from "react";
import { X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { CostType } from "@/types";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

const today = () => new Date().toISOString().split("T")[0];

const COST_TYPE_OPTIONS: { value: CostType; label: string }[] = [
  { value: "project_specific",      label: "Project Specific" },
  { value: "shared_infrastructure", label: "Shared Infrastructure" },
  { value: "shared_tooling",        label: "Shared Tooling" },
  { value: "unallocated",           label: "Unallocated" },
];

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
  costType:       "" as "" | CostType,
  projectId:      "",
  projectSearch:  "",
};

type Form = typeof INITIAL_FORM;
type Errors = Partial<Record<keyof Form, string>>;

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-1.5">
      {children}
    </label>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-[var(--text-error-primary)]">{msg}</p>;
}

const inputCls = "w-full rounded-lg bg-[var(--bg-primary)] border border-[var(--border-primary)] text-[var(--text-primary)] text-sm px-3 py-2 placeholder-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:border-[var(--border-brand-solid)] transition-colors";

export function AddInvoiceModal({ onClose, onSaved }: Props) {
  const [form, setForm]               = useState<Form>(INITIAL_FORM);
  const [errors, setErrors]           = useState<Errors>({});
  const [totalIsAuto, setTotalIsAuto] = useState(true);
  const [saving, setSaving]           = useState(false);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const [projects, setProjects]       = useState<string[]>([]);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstInputRef.current?.focus(); }, []);

  useEffect(() => {
    fetch("/api/projects/names")
      .then((r) => r.json())
      .then((j) => setProjects(j.names ?? []))
      .catch(() => {});
  }, []);

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

  function handleSubtaxChange(key: "subtotal" | "taxAmount", value: string) {
    setTotalIsAuto(true);
    setField(key, value);
  }

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
    if (!form.costType) e.costType = "Cost type is required";
    if (form.costType === "project_specific" && !form.projectId) e.projectId = "Please select a project";
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
          cost_type:      form.costType || null,
          project_id:     form.costType === "project_specific" ? form.projectId : null,
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
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={requestClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-[480px] max-h-[90vh] flex flex-col rounded-xl bg-[var(--bg-primary)] border border-[var(--border-tertiary)] shadow-xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-tertiary)] shrink-0">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Add Invoice</h2>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Manual entry — not linked to email</p>
            </div>
            <button
              onClick={requestClose}
              className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4" style={{ scrollbarWidth: "thin" }}>

            <div>
              <Label>Vendor Name *</Label>
              <input
                ref={firstInputRef}
                type="text"
                value={form.vendorName}
                onChange={(e) => setField("vendorName", e.target.value)}
                placeholder="e.g. Anthropic"
                className={cn(inputCls, errors.vendorName && "border-[var(--border-error-solid)]")}
                style={errors.vendorName ? { "--tw-ring-color": "var(--ring-error-primary)" } as React.CSSProperties : { "--tw-ring-color": "var(--ring-brand-primary)" } as React.CSSProperties}
              />
              <FieldError msg={errors.vendorName} />
            </div>

            <div>
              <Label>Invoice Number</Label>
              <input
                type="text"
                value={form.invoiceNumber}
                onChange={(e) => setField("invoiceNumber", e.target.value)}
                placeholder="e.g. INV-2024-001"
                className={inputCls}
                style={{ "--tw-ring-color": "var(--ring-brand-primary)" } as React.CSSProperties}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Invoice Date *</Label>
                <input
                  type="date"
                  value={form.invoiceDate}
                  onChange={(e) => setField("invoiceDate", e.target.value)}
                  className={cn(inputCls, errors.invoiceDate && "border-[var(--border-error-solid)]")}
                  style={{ "--tw-ring-color": "var(--ring-brand-primary)" } as React.CSSProperties}
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
                  style={{ "--tw-ring-color": "var(--ring-brand-primary)" } as React.CSSProperties}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Subtotal *</Label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.subtotal}
                  onChange={(e) => handleSubtaxChange("subtotal", e.target.value)}
                  placeholder="0.00"
                  className={cn(inputCls, errors.subtotal && "border-[var(--border-error-solid)]")}
                  style={{ "--tw-ring-color": "var(--ring-brand-primary)" } as React.CSSProperties}
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
                  style={{ "--tw-ring-color": "var(--ring-brand-primary)" } as React.CSSProperties}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Label>Total Amount *</Label>
                {totalIsAuto && form.totalAmount !== "" && (
                  <span className="flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--bg-brand-primary)] text-[var(--text-brand-primary)] border border-[var(--border-brand)] -mt-1">
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
                className={cn(inputCls, errors.totalAmount && "border-[var(--border-error-solid)]")}
                style={{ "--tw-ring-color": "var(--ring-brand-primary)" } as React.CSSProperties}
              />
              <FieldError msg={errors.totalAmount} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Currency</Label>
                <select
                  value={form.currency}
                  onChange={(e) => setField("currency", e.target.value)}
                  className={inputCls}
                  style={{ "--tw-ring-color": "var(--ring-brand-primary)" } as React.CSSProperties}
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
                  style={{ "--tw-ring-color": "var(--ring-brand-primary)" } as React.CSSProperties}
                >
                  <option value="pending">pending</option>
                  <option value="paid">paid</option>
                </select>
              </div>
            </div>

            <div>
              <Label>Description</Label>
              <textarea
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                placeholder="Optional notes…"
                rows={2}
                className={cn(inputCls, "resize-none")}
                style={{ "--tw-ring-color": "var(--ring-brand-primary)" } as React.CSSProperties}
              />
            </div>

            <div>
              <Label>Cost Type *</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {COST_TYPE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={cn(
                      "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors text-sm",
                      form.costType === opt.value
                        ? "border-[var(--border-brand-solid)] bg-[var(--bg-brand-primary)] text-[var(--text-brand-primary)]"
                        : "border-[var(--border-tertiary)] text-[var(--text-tertiary)] hover:border-[var(--border-secondary)]"
                    )}
                  >
                    <input
                      type="radio"
                      name="costType"
                      value={opt.value}
                      checked={form.costType === opt.value}
                      onChange={() => {
                        setField("costType", opt.value);
                        if (opt.value !== "project_specific") {
                          setField("projectId", "");
                          setField("projectSearch", "");
                        }
                      }}
                      className="accent-[var(--bg-brand-solid)]"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              <FieldError msg={errors.costType} />
            </div>

            {form.costType === "project_specific" && (
              <div>
                <Label>Project *</Label>
                <div className="relative">
                  <input
                    type="text"
                    value={form.projectSearch}
                    onChange={(e) => {
                      setField("projectSearch", e.target.value);
                      setField("projectId", "");
                    }}
                    placeholder="Search projects…"
                    className={cn(inputCls, errors.projectId && "border-[var(--border-error-solid)]")}
                    style={{ "--tw-ring-color": "var(--ring-brand-primary)" } as React.CSSProperties}
                  />
                  {form.projectSearch && !form.projectId && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-10 rounded-lg border border-[var(--border-tertiary)] bg-[var(--bg-primary)] shadow-md overflow-hidden max-h-36 overflow-y-auto">
                      {projects
                        .filter((p) => p.toLowerCase().includes(form.projectSearch.toLowerCase()))
                        .map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => {
                              setField("projectId", p);
                              setField("projectSearch", p);
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                          >
                            {p}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
                {form.projectId && (
                  <p className="mt-1 text-xs text-[var(--text-brand-primary)]">Selected: {form.projectId}</p>
                )}
                <FieldError msg={errors.projectId} />
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t border-[var(--border-tertiary)] flex items-center gap-3 shrink-0">
            <button
              onClick={requestClose}
              className="flex-1 py-2 rounded-lg border border-[var(--border-tertiary)] text-[var(--text-tertiary)] text-sm font-semibold hover:bg-[var(--bg-secondary\_hover)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 transition-colors"
              style={{ backgroundColor: "var(--bg-brand-solid)" }}
            >
              {saving ? "Saving…" : "Save Invoice"}
            </button>
          </div>
        </div>
      </div>

      {discardPrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDiscardPrompt(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-xl bg-[var(--bg-primary)] border border-[var(--border-tertiary)] shadow-xl p-6 text-center space-y-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Discard unsaved changes?</p>
            <p className="text-xs text-[var(--text-tertiary)]">Your form data will be lost.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDiscardPrompt(false)}
                className="flex-1 py-2 rounded-lg border border-[var(--border-tertiary)] text-[var(--text-tertiary)] text-sm font-semibold hover:bg-[var(--bg-secondary)] transition-colors"
              >
                Keep editing
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2 rounded-lg text-white text-sm font-semibold transition-colors"
                style={{ backgroundColor: "var(--bg-error-solid)" }}
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
