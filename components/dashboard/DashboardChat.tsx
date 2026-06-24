"use client";

import { useState, useRef } from "react";
import { Sparkles, Send, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardMetrics } from "@/types";
import ReactMarkdown from "react-markdown";

const STARTERS = [
  "What's our total AI spend this month?",
  "Which projects are closest to their budget limits?",
  "What's the forecast for next month's spend?",
  "How is Arthur's AI referral funnel performing?",
  "What's the enrichment pipeline conversion rate?",
  "Which project has the best ROI right now?",
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
      <div className="mb-4 text-center">
        {!hasMessages ? (
          <>
            <p className="text-2xl font-semibold text-[var(--text-primary)] tracking-tight">
              What&apos;s on your mind today?
            </p>
            <p className="text-xs text-[var(--text-quaternary)] mt-1 flex items-center justify-center gap-1">
              <Sparkles className="w-3 h-3 text-[var(--fg-brand-primary)]" />
              Orion · Spend Intelligence
            </p>
          </>
        ) : (
          <p className="text-xs text-[var(--text-quaternary)] flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3 text-[var(--fg-brand-primary)]" />
            Orion · Spend Intelligence
          </p>
        )}
      </div>

      {hasMessages && (
        <div
          ref={scrollRef}
          className="mb-4 space-y-3 max-h-96 overflow-y-auto px-1"
          style={{ scrollbarWidth: "thin", scrollbarColor: "var(--bg-brand-solid) transparent" }}
        >
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              {m.role === "assistant" && (
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mr-2 mt-0.5" style={{ background: "linear-gradient(135deg, var(--bg-brand-solid), var(--bg-brand-solid_hover))" }}>
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed",
                  m.role === "user"
                    ? "text-white rounded-br-sm"
                    : "rounded-bl-sm"
                )}
                style={
                  m.role === "user"
                    ? { backgroundColor: "var(--bg-brand-solid)" }
                    : { backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)" }
                }
              >
                {m.content ? (
                  m.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-headings:text-sm prose-td:px-2 prose-td:py-1 prose-th:px-2 prose-th:py-1 prose-table:text-xs" style={{ "--tw-prose-body": "var(--text-primary)", "--tw-prose-bold": "var(--text-brand-primary)" } as React.CSSProperties}>
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    m.content
                  )
                ) : (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-quaternary)]" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        className={cn(
          "flex items-center gap-3 rounded-full border px-5 py-3 transition-all duration-200",
          focused
            ? "bg-[var(--bg-primary)] border-[var(--border-brand-solid)] shadow-lg"
            : "bg-[var(--bg-secondary)] border-[var(--border-tertiary)] shadow-sm"
        )}
      >
        {hasMessages && (
          <button
            onClick={() => setMessages([])}
            className="text-[var(--text-quaternary)] hover:text-[var(--text-tertiary)] transition-colors shrink-0"
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
          className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-placeholder)] outline-none disabled:opacity-50"
        />

        <button
          onClick={() => send(input)}
          disabled={!input.trim() || streaming}
          className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30 hover:opacity-80 transition-all shrink-0"
          style={{ backgroundColor: "var(--bg-primary-solid)" }}
        >
          {streaming
            ? <Loader2 className="w-4 h-4 animate-spin text-white" />
            : <Send className="w-3.5 h-3.5 text-white" />
          }
        </button>
      </div>

      {!hasMessages && (
        <div className="flex flex-wrap gap-2 mt-3 justify-center">
          {STARTERS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="text-xs px-3 py-1.5 rounded-full bg-[var(--bg-primary)] border border-[var(--border-tertiary)] text-[var(--text-tertiary)] hover:border-[var(--border-brand-solid)] hover:text-[var(--text-brand-primary)] hover:bg-[var(--bg-brand-primary)] transition-all duration-150 font-medium whitespace-nowrap"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
