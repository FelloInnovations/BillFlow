"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  FileText,
  FolderKanban,
  Wrench,
  TrendingUp,
  Activity,
  BarChart2,
  Lock,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/records", label: "Financial Records", icon: FileText },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/outcomes", label: "Outcomes", icon: BarChart2 },
  { href: "/tools", label: "Tools", icon: Wrench },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/forecasting", label: "Forecasting", icon: TrendingUp },
];

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      {/* Logo */}
      <div className="h-16 flex items-center px-5">
        <div className="flex items-center gap-2.5 flex-1">
          <div className="w-7 h-7 rounded-lg bg-salmon-600 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-black tracking-tighter leading-none">BF</span>
          </div>
          <div>
            <span className="font-bold text-slate-900 dark:text-white text-sm tracking-tight">BillFlow</span>
            <p className="text-slate-400 dark:text-slate-600 text-[10px] font-medium tracking-widest uppercase">AI Cost Tracker</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="mx-4 border-t border-slate-100 dark:border-slate-800 mb-1" />

      {/* Nav */}
      <nav className="flex-1 py-2 px-3 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                active
                  ? "bg-[#FF725C]/10 text-[#FF725C]"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <Icon className={cn("w-4 h-4 shrink-0", active ? "text-[#FF725C]" : "text-gray-400")} />
              {label}
              {active && <div className="ml-auto w-1 h-4 rounded-full bg-salmon-500" />}
            </Link>
          );
        })}
      </nav>

      <div className="mx-4 border-t border-slate-100 dark:border-slate-800 mb-2 mt-2" />
      <div className="px-3 pb-2">
        <a
          href="/vault.html"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-800 dark:hover:text-slate-200"
        >
          <Lock className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500" />
          Vault
        </a>
      </div>
      <div className="mx-4 border-t border-slate-100 dark:border-slate-800 mb-4 mt-1" />
      <div className="px-5 pb-5">
        <p className="text-slate-300 dark:text-slate-700 text-[11px] font-medium">Internal · Confidential</p>
      </div>
    </>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const currentPage = NAV.find((n) => n.href === pathname)?.label ?? "BillFlow";

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="w-60 shrink-0 hidden md:flex flex-col h-screen sticky top-0 bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800">
        <SidebarContent />
      </aside>

      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-30 h-14 flex items-center justify-between px-4 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-salmon-600 flex items-center justify-center shrink-0">
            <span className="text-white text-[10px] font-black tracking-tighter leading-none">BF</span>
          </div>
          <span className="font-semibold text-slate-900 dark:text-white text-sm">BillFlow</span>
        </div>
        <span className="text-xs font-medium text-slate-400 dark:text-slate-500">{currentPage}</span>
      </div>

      {/* Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 w-72 h-full flex flex-col bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 transition-transform duration-300 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SidebarContent onClose={() => setMobileOpen(false)} />
      </aside>
    </>
  );
}
