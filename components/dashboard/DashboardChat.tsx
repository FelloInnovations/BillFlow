"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, X, Minus, Loader2, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardMetrics } from "@/types";
import { formatCurrency } from "@/lib/utils";

const STARTERS = [
  "Give me an overview of this month's spend",
  "Which vendor costs the most?",
  "How many invoices are overdue?",
  "What's our avg monthly spend trend?",
];

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  metrics: DashboardMetrics;
}

function buildContext(metrics: DashboardMetrics): string {
  const topVendors = metrics.spendByVendor
    .slice(0, 5)
    .map((v) => `${v.vendor}: ${formatCurrency(v.total)}`)
    .join(", ");

  const recentMonths = metrics.monthlyTrend
    .slice(-3)
    .map((m) => `${m.month}: ${formatCurrency(m.total)} (paid: ${formatCurrency(m.paid)}, unpaid: ${formatCurrency(m.unpaid)})`)
    .join(" | ");

  return [
    `Unpaid invoices: ${metrics.unpaidCount} totalling ${formatCurrency(metrics.unpaidTotal)}`,
    `Overdue invoices: ${metrics.overdueCount}`,
    `Months of data tracked: ${metrics.monthlyTrend.length}`,
    `Top vendors (last 12 months): ${topVendors}`,
    `Recent monthly trend: ${recentMonths}`,
    `Upcoming due invoices: ${metrics.upcomingDue.length}`,
  ].join("\n");
}

export function DashboardChat({ metrics }: Props) {
  // popup = full modal on load, minimized = small pill in corner
  const [mode, setMode] = useState<"popup" | "minimized">("popup");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "popup") {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [mode]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setStreaming(true);
    setMessages([...next, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          context: buildContext(metrics),
        }),
      });

      if (!res.ok || !res.body) throw new Error("Failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages([...next, { role: "assistant", content: accumulated }]);
      }
    } catch {
      setMessages([...next, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setStreaming(false);
    }
  }

  // Minimized pill — fixed bottom right
  if (mode === "minimized") {
    return (
      <button
        onClick={() => setMode("popup")}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl transition-all hover:scale-105 active:scale-95"
      >
        <MessageCircle className="w-4 h-4" />
        <span className="text-sm font-semibold">Ask AI</span>
        {messages.length > 0 && (
          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
        )}
      </button>
    );
  }

  // Full popup modal
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Blurred backdrop */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/60 via-slate-900/50 to-violet-950/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col"
        style={{ maxHeight: "80vh" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-950/40 dark:to-violet-950/40">
          <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 shrink-0">
            <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900 dark:text-white">SpendSync AI</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Ask anything about your dashboard</p>
          </div>
          <button
            onClick={() => setMode("minimized")}
            title="Minimize"
            className="p-2 rounded-xl hover:bg-white/60 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMode("minimized")}
            title="Close"
            className="p-2 rounded-xl hover:bg-white/60 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages / starters */}
        <div
          className="flex-1 overflow-y-auto px-6 py-5 space-y-3 min-h-0"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#c4b5fd #f1f5f9" }}
        >
          {messages.length === 0 ? (
            <div>
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">
                Conversation starters
              </p>
              <div className="grid grid-cols-2 gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-xs px-3.5 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 border border-slate-200 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-800 text-slate-700 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-300 transition-all leading-snug font-medium"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                    m.role === "user"
                      ? "bg-indigo-600 text-white rounded-br-sm"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-sm"
                  )}
                >
                  {m.content || <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-6 pb-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="Ask anything about your spend…"
            disabled={streaming}
            className="flex-1 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition disabled:opacity-50"
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || streaming}
            className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white transition-colors shrink-0"
          >
            {streaming
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />
            }
          </button>
        </div>
      </div>
    </div>
  );
}
