"use client";

import { useState } from "react";
import { AlertTriangle, Ban } from "lucide-react";
import { FlaggedBilledVendor, NeverUsedVendor } from "@/types";
import { FlaggedToolsModal } from "@/components/FlaggedToolsModal";

interface Props {
  billedInactive: FlaggedBilledVendor[];
  neverUsed: NeverUsedVendor[];
}

export function FlaggedToolsBanner({ billedInactive, neverUsed }: Props) {
  const [open, setOpen] = useState(false);
  const total = billedInactive.length + neverUsed.length;
  if (total === 0) return null;

  function scrollToFlagged() {
    document.getElementById("flagged")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        {billedInactive.length > 0 && (
          <button
            onClick={() => { scrollToFlagged(); setOpen(true); }}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-[var(--bg-warning-primary)] text-[var(--text-warning-primary)] border border-[var(--border-warning)] hover:opacity-90 transition-opacity"
          >
            <AlertTriangle className="w-3 h-3" />
            {billedInactive.length} billed &amp; inactive
          </button>
        )}
        {neverUsed.length > 0 && (
          <button
            onClick={() => { scrollToFlagged(); setOpen(true); }}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-[var(--bg-error-primary)] text-[var(--text-error-primary)] border border-[var(--border-error)] hover:opacity-90 transition-opacity"
          >
            <Ban className="w-3 h-3" />
            {neverUsed.length} never used
          </button>
        )}
      </div>

      {open && (
        <FlaggedToolsModal
          billedInactive={billedInactive}
          neverUsed={neverUsed}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
