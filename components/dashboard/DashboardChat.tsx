"use client";

import { useState, useRef } from "react";
import { Sparkles, Send, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardMetrics } from "@/types";

const STARTERS = [
  "Overview of this month's spend",
  "Which projects are active and what do they cost?",
  "Which vendor costs the most?",
  "Summarise the HubSpot enrichment work",
];

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  metrics: DashboardMetrics;
}


export function DashboardChat(_props: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [focused, setFocused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setStreaming(true);
    setMessages([...next, { role: "assistant", content: "" }]);
    // Scroll the chat container to bottom once — never again during streaming
    setTimeout(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
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

  const hasMessages = messages.length > 0;

  return (
    <div className="w-full">
      {/* Persistent header — always visible */}
      <div className="mb-4 text-center">
        {!hasMessages ? (
          <>
            <p className="text-2xl font-semibold text-slate-700 dark:text-slate-200 tracking-tight">
              What's on your mind today?
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 flex items-center justify-center gap-1">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              Orion · Spend Intelligence
            </p>
          </>
        ) : (
          <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3 text-indigo-400" />
            Orion · Spend Intelligence
          </p>
        )}
      </div>

      {/* Message thread */}
      {hasMessages && (
        <div
          ref={scrollRef}
          className="mb-4 space-y-3 max-h-72 overflow-y-auto px-1"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#c4b5fd transparent" }}
        >
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              {m.role === "assistant" && (
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  m.role === "user"
                    ? "bg-indigo-600 text-white rounded-br-sm"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-sm"
                )}
              >
                {m.content || <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search bar */}
      <div
        className={cn(
          "flex items-center gap-3 rounded-full border px-5 py-3 transition-all duration-200",
          focused
            ? "bg-white dark:bg-slate-800 border-indigo-400 shadow-lg shadow-indigo-500/10"
            : "bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 shadow-sm"
        )}
      >
        {/* Clear button if has messages */}
        {hasMessages && (
          <button
            onClick={() => setMessages([])}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors shrink-0"
            title="Clear conversation"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={hasMessages ? "Ask a follow-up…" : "Ask anything about your spend…"}
          disabled={streaming}
          className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none disabled:opacity-50"
        />

        <button
          onClick={() => send(input)}
          disabled={!input.trim() || streaming}
          className="w-9 h-9 rounded-full bg-slate-900 dark:bg-white flex items-center justify-center disabled:opacity-30 hover:opacity-80 transition-all shrink-0"
        >
          {streaming
            ? <Loader2 className="w-4 h-4 animate-spin text-white dark:text-slate-900" />
            : <Send className="w-3.5 h-3.5 text-white dark:text-slate-900" />
          }
        </button>
      </div>

      {/* Starter chips — only when no conversation */}
      {!hasMessages && (
        <div className="flex flex-wrap gap-2 mt-3 justify-center">
          {STARTERS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="text-xs px-3.5 py-1.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-all font-medium"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
