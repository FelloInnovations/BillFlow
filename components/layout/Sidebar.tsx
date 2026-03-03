"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  FileText,
  FolderKanban,
  Wrench,
  BarChart3,
  Sun,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/records", label: "Financial Records", icon: FileText },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/tools", label: "Tools", icon: Wrench },
];

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="w-8 h-8" />;
  return (
    <button
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
      aria-label="Toggle theme"
    >
      {resolvedTheme === "dark" ? (
        <Sun className="w-4 h-4" />
      ) : (
        <Moon className="w-4 h-4" />
      )}
    </button>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 flex flex-col h-screen sticky top-0 bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800">
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-5">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950">
            <BarChart3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <span className="font-bold text-slate-900 dark:text-white text-sm tracking-tight">SpendAnalyzer</span>
            <p className="text-slate-400 dark:text-slate-600 text-[10px] font-medium tracking-widest uppercase">AI Cost Tracker</p>
          </div>
        </div>
        <ThemeToggle />
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
                  ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-800 dark:hover:text-slate-200"
              )}
            >
              <Icon className={cn("w-4 h-4 shrink-0", active ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500")} />
              {label}
              {active && <div className="ml-auto w-1 h-4 rounded-full bg-indigo-500" />}
            </Link>
          );
        })}
      </nav>

      <div className="mx-4 border-t border-slate-100 dark:border-slate-800 mb-4 mt-2" />
      <div className="px-5 pb-5">
        <p className="text-slate-300 dark:text-slate-700 text-[11px] font-medium">Internal · Confidential</p>
      </div>
    </aside>
  );
}
