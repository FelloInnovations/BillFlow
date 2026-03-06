"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { HubspotTicket } from "@/types";

const CATEGORIES = [
  "Event Attendee List",
  "Event Registration List",
  "Sales Outbound Request",
  "CS Request",
  "Vector",
  "Better Homes & Garden Event- List Request",
  "Other",
];

const STATUSES = ["In Progress", "Done", "Pending", "On Hold"];

const inputCls =
  "w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

interface Props {
  onClose: () => void;
  onAdded: (ticket: HubspotTicket) => void;
}

export function AddTicketModal({ onClose, onAdded }: Props) {
  const [form, setForm] = useState({
    ticket_link: "",
    category: "",
    list_detail: "",
    contacts_to_enrich: "",
    fields_to_enrich: "",
    eta: "",
    enrichment_status: "In Progress",
    valid_enriched: "",
    hit_rate: "",
    final_status: "",
    notes: "",
    owner: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.contacts_to_enrich) {
      setError("Contacts to Enrich is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/hubspot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          contacts_to_enrich: Number(form.contacts_to_enrich),
          valid_enriched: form.valid_enriched ? Number(form.valid_enriched) : null,
          // store as 0-1 fraction; user enters 0-100
          hit_rate: form.hit_rate ? Number(form.hit_rate) / 100 : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save ticket.");
        return;
      }
      onAdded(data);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal panel */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-t-2xl">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Add HubSpot Ticket</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              Fill in the enrichment ticket details
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* List name + Owner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="List / Ticket Name">
              <input
                type="text"
                className={inputCls}
                placeholder="e.g. Tom Ferry Summit Attendees"
                value={form.list_detail}
                onChange={(e) => set("list_detail", e.target.value)}
              />
            </Field>
            <Field label="Owner">
              <input
                type="text"
                className={inputCls}
                placeholder="e.g. Rashi"
                value={form.owner}
                onChange={(e) => set("owner", e.target.value)}
              />
            </Field>
          </div>

          {/* Category + Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Category">
              <select
                className={inputCls}
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
              >
                <option value="">Select category…</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Enrichment Status">
              <select
                className={inputCls}
                value={form.enrichment_status}
                onChange={(e) => set("enrichment_status", e.target.value)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* Contacts + Valid Enriched + Hit Rate */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Contacts to Enrich" required>
              <input
                type="number"
                min={0}
                className={inputCls}
                placeholder="e.g. 500"
                value={form.contacts_to_enrich}
                onChange={(e) => set("contacts_to_enrich", e.target.value)}
              />
            </Field>
            <Field label="Valid Enriched">
              <input
                type="number"
                min={0}
                className={inputCls}
                placeholder="e.g. 380"
                value={form.valid_enriched}
                onChange={(e) => set("valid_enriched", e.target.value)}
              />
            </Field>
            <Field label="Hit Rate (%)">
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                className={inputCls}
                placeholder="e.g. 76"
                value={form.hit_rate}
                onChange={(e) => set("hit_rate", e.target.value)}
              />
            </Field>
          </div>

          {/* Fields to Enrich */}
          <Field label="Fields to Enrich">
            <input
              type="text"
              className={inputCls}
              placeholder="e.g. Full Name, Email, Phone, Company"
              value={form.fields_to_enrich}
              onChange={(e) => set("fields_to_enrich", e.target.value)}
            />
          </Field>

          {/* ETA + Ticket Link */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="ETA">
              <input
                type="date"
                className={inputCls}
                value={form.eta}
                onChange={(e) => set("eta", e.target.value)}
              />
            </Field>
            <Field label="HubSpot Ticket Link">
              <input
                type="url"
                className={inputCls}
                placeholder="https://app.hubspot.com/…"
                value={form.ticket_link}
                onChange={(e) => set("ticket_link", e.target.value)}
              />
            </Field>
          </div>

          {/* Final Status + Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Final Status">
              <input
                type="text"
                className={inputCls}
                placeholder="e.g. Team size: 1200"
                value={form.final_status}
                onChange={(e) => set("final_status", e.target.value)}
              />
            </Field>
            <Field label="Notes">
              <input
                type="text"
                className={inputCls}
                placeholder="Any additional notes"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </div>

          {error && (
            <p className="text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className={cn(
                "flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
              )}
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? "Saving…" : "Add Ticket"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
