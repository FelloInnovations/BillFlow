import { HUBSPOT_TICKETS } from "@/lib/hubspot";
import { TicketAccordion } from "@/components/hubspot/TicketAccordion";
import { CheckCircle2, Users, TrendingUp } from "lucide-react";

export default function HubspotPage() {
  const doneCount = HUBSPOT_TICKETS.filter((t) => t.enrichmentStatus === "Done").length;
  const totalContacts = HUBSPOT_TICKETS.reduce((s, t) => s + t.contactsToEnrich, 0);
  const totalEnriched = HUBSPOT_TICKETS.reduce((s, t) => s + (t.validEnriched ?? 0), 0);
  const avgHitRate = totalContacts > 0 ? totalEnriched / totalContacts : 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">HubSpot Enrichment Tickets</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {HUBSPOT_TICKETS.length} total tickets
        </p>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Tickets Done */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 border-t-4 border-t-emerald-500 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Tickets Done</p>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/60">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">{doneCount}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">of {HUBSPOT_TICKETS.length} total</p>
        </div>

        {/* Contacts Enriched */}
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

        {/* Avg Hit Rate */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 border-t-4 border-t-amber-500 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Avg Hit Rate</p>
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

      {/* Collapsible Ticket List */}
      <div>
        <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-3">All Tickets</h2>
        <TicketAccordion tickets={HUBSPOT_TICKETS} />
      </div>
    </div>
  );
}
