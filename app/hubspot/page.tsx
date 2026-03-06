"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, Users, TrendingUp, Plus } from "lucide-react";
import { TicketAccordion } from "@/components/hubspot/TicketAccordion";
import { AddTicketModal } from "@/components/hubspot/AddTicketModal";
import { HubspotTicket } from "@/types";

export default function HubspotPage() {
  const [tickets, setTickets] = useState<HubspotTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/hubspot", { cache: "no-store" });
      if (res.ok) setTickets(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  function handleAdded(ticket: HubspotTicket) {
    setTickets((prev) => [ticket, ...prev]);
    setShowModal(false);
  }

  const doneCount = tickets.filter((t) => t.enrichment_status === "Done").length;
  const totalContacts = tickets.reduce((s, t) => s + t.contacts_to_enrich, 0);
  const totalEnriched = tickets.reduce((s, t) => s + (t.valid_enriched ?? 0), 0);
  const avgHitRate = totalContacts > 0 ? totalEnriched / totalContacts : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
            HubSpot Enrichment Tickets
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {loading ? "Loading…" : `${tickets.length} total tickets`}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Ticket
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 border-t-4 border-t-emerald-500 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Tickets Done
            </p>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/60">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">{doneCount}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">of {tickets.length} total</p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 border-t-4 border-t-indigo-500 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Contacts Enriched
            </p>
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60">
              <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
            {totalEnriched.toLocaleString()}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            of {totalContacts.toLocaleString()} requested
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 border-t-4 border-t-amber-500 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Avg Hit Rate
            </p>
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/60">
              <TrendingUp className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
            {Math.round(avgHitRate * 100)}%
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">across all enrichments</p>
        </div>
      </div>

      {/* Ticket list */}
      <div>
        <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-3">
          All Tickets
        </h2>
        {loading ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-12 text-center">
            <p className="text-sm text-slate-400 animate-pulse">Loading tickets…</p>
          </div>
        ) : (
          <TicketAccordion tickets={tickets} />
        )}
      </div>

      {showModal && (
        <AddTicketModal onClose={() => setShowModal(false)} onAdded={handleAdded} />
      )}
    </div>
  );
}
