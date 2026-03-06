"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { HubspotTicket } from "@/types";

const CATEGORY_COLORS: Record<string, string> = {
  "Event Attendee List": "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300",
  "Event Registration List": "bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300",
  "Sales Outbound Request": "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300",
  "CS Request": "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300",
  "Vector": "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
};

function hitRateColor(rate: number) {
  if (rate >= 0.8) return "text-emerald-600 dark:text-emerald-400";
  if (rate >= 0.5) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function hitRateBg(rate: number) {
  if (rate >= 0.8) return "bg-emerald-50 dark:bg-emerald-950/50";
  if (rate >= 0.5) return "bg-amber-50 dark:bg-amber-950/50";
  return "bg-rose-50 dark:bg-rose-950/50";
}

function formatDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s + "T00:00:00");
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function TicketRow({ ticket, index }: { ticket: HubspotTicket; index: number }) {
  const [open, setOpen] = useState(false);
  const title = ticket.list_detail ?? ticket.category ?? `Ticket #${index + 1}`;

  return (
    <div className="border-b border-slate-100 dark:border-slate-800 last:border-0">
      {/* Collapsed header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-left"
      >
        <ChevronDown
          className={cn(
            "w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200",
            open && "rotate-180"
          )}
        />

        {/* Title */}
        <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
          {title}
        </span>

        {/* Owner */}
        {ticket.owner && (
          <span className="hidden sm:inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 shrink-0">
            <User className="w-3 h-3" />
            {ticket.owner}
          </span>
        )}

        {/* Category badge */}
        <span
          className={cn(
            "hidden md:inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap shrink-0",
            CATEGORY_COLORS[ticket.category ?? ""] ??
              "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
          )}
        >
          {ticket.category ?? "—"}
        </span>

        {/* Contacts */}
        <span className="hidden lg:block text-xs text-slate-500 dark:text-slate-400 shrink-0 w-24 text-right">
          {ticket.contacts_to_enrich.toLocaleString()} contacts
        </span>

        {/* Hit rate pill */}
        {ticket.hit_rate != null && (
          <span
            className={cn(
              "text-xs font-bold px-2.5 py-0.5 rounded-full shrink-0 tabular-nums",
              hitRateBg(ticket.hit_rate),
              hitRateColor(ticket.hit_rate)
            )}
          >
            {Math.round(ticket.hit_rate * 100)}%
          </span>
        )}

        {/* Status */}
        <span
          className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full shrink-0",
            ticket.enrichment_status === "Done"
              ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400"
              : "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400"
          )}
        >
          {ticket.enrichment_status ?? "—"}
        </span>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="px-12 pb-5 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 bg-slate-50/60 dark:bg-slate-800/20">
          {ticket.owner && (
            <div>
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">
                Owner
              </p>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{ticket.owner}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">
              Contacts to Enrich
            </p>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {ticket.contacts_to_enrich.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">
              Valid Enriched
            </p>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {ticket.valid_enriched?.toLocaleString() ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">
              Hit Rate
            </p>
            <p
              className={cn(
                "text-sm font-bold",
                ticket.hit_rate != null ? hitRateColor(ticket.hit_rate) : "text-slate-400"
              )}
            >
              {ticket.hit_rate != null ? `${Math.round(ticket.hit_rate * 100)}%` : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">
              Fields to Enrich
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300">{ticket.fields_to_enrich ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">
              ETA
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300">{formatDate(ticket.eta)}</p>
          </div>
          {ticket.final_status && (
            <div>
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">
                Final Status
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">{ticket.final_status}</p>
            </div>
          )}
          {ticket.notes && (
            <div>
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">
                Notes
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">{ticket.notes}</p>
            </div>
          )}
          {ticket.ticket_link && (
            <div className="col-span-2 md:col-span-3 pt-1">
              <a
                href={ticket.ticket_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open HubSpot Ticket
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TicketAccordion({ tickets }: { tickets: HubspotTicket[] }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      {tickets.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-12">No tickets yet.</p>
      )}
      {tickets.map((ticket, i) => (
        <TicketRow key={ticket.id ?? i} ticket={ticket} index={i} />
      ))}
    </div>
  );
}
