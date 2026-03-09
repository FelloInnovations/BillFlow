"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { CheckCircle2, Users, TrendingUp, Plus, Search, X } from "lucide-react";
import { TicketAccordion } from "@/components/hubspot/TicketAccordion";
import { AddTicketModal } from "@/components/hubspot/AddTicketModal";
import { HubspotTicket } from "@/types";


const HIT_RATE_FILTERS = [
  { label: "All", value: "all" },
  { label: "High ≥80%", value: "high" },
  { label: "Mid 50–79%", value: "mid" },
  { label: "Low <50%", value: "low" },
];

const STATUS_FILTERS = ["All", "Done", "In Progress", "Pending", "On Hold"];

export default function HubspotPage() {
  const [tickets, setTickets] = useState<HubspotTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [category, setCategory] = useState("All");
  const [hitRate, setHitRate] = useState("all");

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

  // Derived: unique categories from data
  const categories = useMemo(() => {
    const cats = [...new Set(tickets.map((t) => t.category).filter(Boolean))] as string[];
    return ["All", ...cats.sort()];
  }, [tickets]);

  // Filtered tickets
  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (search) {
        const q = search.toLowerCase();
        const haystack = [t.list_detail, t.category, t.owner, t.fields_to_enrich]
          .filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (status !== "All" && t.enrichment_status !== status) return false;
      if (category !== "All" && t.category !== category) return false;
      if (hitRate === "high" && (t.hit_rate == null || t.hit_rate < 0.8)) return false;
      if (hitRate === "mid" && (t.hit_rate == null || t.hit_rate < 0.5 || t.hit_rate >= 0.8)) return false;
      if (hitRate === "low" && (t.hit_rate == null || t.hit_rate >= 0.5)) return false;
      return true;
    });
  }, [tickets, search, status, category, hitRate]);

  const hasFilters = search || status !== "All" || category !== "All" || hitRate !== "all";

  function clearFilters() {
    setSearch("");
    setStatus("All");
    setCategory("All");
    setHitRate("all");
  }

  // KPIs always from full ticket list
  const doneCount = tickets.filter((t) => t.enrichment_status === "Done").length;
  const totalContacts = tickets.reduce((s, t) => s + t.contacts_to_enrich, 0);
  const totalEnriched = tickets.reduce((s, t) => s + (t.valid_enriched ?? 0), 0);
  const avgHitRate = totalContacts > 0 ? totalEnriched / totalContacts : 0;

  const selectCls = "text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-300 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition cursor-pointer";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
            HubSpot Enrichment Tickets
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {loading ? "Loading…" : `${filtered.length} of ${tickets.length} tickets`}
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
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Tickets Done</p>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/60">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">{doneCount}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">of {tickets.length} total</p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 border-t-4 border-t-indigo-500 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Contacts Enriched</p>
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60">
              <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">{totalEnriched.toLocaleString()}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">of {totalContacts.toLocaleString()} requested</p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 border-t-4 border-t-amber-500 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Avg Hit Rate</p>
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/60">
              <TrendingUp className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">{Math.round(avgHitRate * 100)}%</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">across all enrichments</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search tickets…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Status dropdown */}
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>{s === "All" ? "All Statuses" : s}</option>
          ))}
        </select>

        {/* Category dropdown */}
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
          {categories.map((c) => (
            <option key={c} value={c}>{c === "All" ? "All Categories" : c}</option>
          ))}
        </select>

        {/* Hit rate dropdown */}
        <select value={hitRate} onChange={(e) => setHitRate(e.target.value)} className={selectCls}>
          {HIT_RATE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.value === "all" ? "All Hit Rates" : f.label}</option>
          ))}
        </select>

        {/* Clear */}
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1 transition-colors"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Ticket list */}
      <div>
        <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-3">
          {hasFilters ? `${filtered.length} result${filtered.length !== 1 ? "s" : ""}` : "All Tickets"}
        </h2>
        {loading ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-12 text-center">
            <p className="text-sm text-slate-400 animate-pulse">Loading tickets…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-12 text-center">
            <p className="text-sm text-slate-400">No tickets match your filters.</p>
            <button onClick={clearFilters} className="mt-2 text-xs text-indigo-500 hover:text-indigo-700 font-medium">Clear filters</button>
          </div>
        ) : (
          <TicketAccordion tickets={filtered} />
        )}
      </div>

      {showModal && (
        <AddTicketModal onClose={() => setShowModal(false)} onAdded={handleAdded} />
      )}
    </div>
  );
}
