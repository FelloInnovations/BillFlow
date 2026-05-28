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
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700/50 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors"
          >
            <AlertTriangle className="w-3 h-3" />
            {billedInactive.length} billed &amp; inactive
          </button>
        )}
        {neverUsed.length > 0 && (
          <button
            onClick={() => { scrollToFlagged(); setOpen(true); }}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-700/50 hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors"
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
