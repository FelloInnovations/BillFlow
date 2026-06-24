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
  { href: "/outcomes", label: "Metrics", icon: BarChart2 },
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
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--bg-brand-solid)" }}>
            <span className="text-white text-xs font-semibold tracking-tighter leading-none">BF</span>
          </div>
          <div>
            <span className="font-semibold text-white text-sm tracking-tight">BillFlow</span>
            <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: "#FFC7BE" }}>AI Cost Tracker</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "#FFC7BE" }}
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="mx-4 mb-1" style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }} />

      {/* Nav */}
      <nav className="flex-1 py-2 px-3 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 h-10",
                active
                  ? "text-[var(--text-brand-primary)]"
                  : "hover:text-white"
              )}
              style={
                active
                  ? { backgroundColor: "var(--bg-brand-primary)" }
                  : { color: "#FFC7BE", backgroundColor: "transparent" }
              }
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.08)";
              }}
              onMouseLeave={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
              }}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
              {active && <div className="ml-auto w-1 h-4 rounded-full" style={{ backgroundColor: "var(--bg-brand-solid)" }} />}
            </Link>
          );
        })}
      </nav>

      <div className="mx-4 mb-2 mt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }} />
      <div className="px-3 pb-2">
        <a
          href="/vault.html"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 h-10"
          style={{ color: "#FFC7BE" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLElement).style.color = "#ffffff"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = "#FFC7BE"; }}
        >
          <Lock className="w-4 h-4 shrink-0" />
          Vault
        </a>
      </div>
      <div className="mx-4 mb-4 mt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }} />
      <div className="px-5 pb-5">
        <p className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.30)" }}>Internal · Confidential</p>
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
      <aside
        className="w-60 shrink-0 hidden md:flex flex-col h-screen sticky top-0"
        style={{ backgroundColor: "var(--bg-primary-solid)" }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile top bar */}
      <div
        className="fixed top-0 left-0 right-0 z-30 h-14 flex items-center justify-between px-4 md:hidden"
        style={{ backgroundColor: "var(--bg-primary-solid)", borderBottom: "1px solid rgba(255,255,255,0.12)" }}
      >
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg transition-colors text-white"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--bg-brand-solid)" }}>
            <span className="text-white text-[10px] font-semibold tracking-tighter leading-none">BF</span>
          </div>
          <span className="font-semibold text-white text-sm">BillFlow</span>
        </div>
        <span className="text-xs font-medium" style={{ color: "#FFC7BE" }}>{currentPage}</span>
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
          "fixed top-0 left-0 z-50 w-72 h-full flex flex-col transition-transform duration-300 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ backgroundColor: "var(--bg-primary-solid)" }}
      >
        <SidebarContent onClose={() => setMobileOpen(false)} />
      </aside>
    </>
  );
}
