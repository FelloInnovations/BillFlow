import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | null, currency = "USD"): string {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === "paid") return false;
  return new Date(dueDate) < new Date();
}

// Normalise DB vendor_name to a canonical key for matching.
// Legacy LLM providers (Anthropic, xAI, OpenAI, etc.) are now routed via OpenRouter
// and are grouped under the "OpenRouter" canonical name.
export function canonicalVendor(name: string): string {
  const lower = name.toLowerCase();
  // OpenRouter + legacy LLM providers now routed through it
  if (lower.includes("openrouter")) return "OpenRouter";
  if (lower.includes("anthropic")) return "OpenRouter";
  if (lower.includes("openai")) return "OpenRouter";
  if (lower.includes("perplexity")) return "OpenRouter";
  if (lower.includes("google") || lower.includes("gemini")) return "OpenRouter";
  if (lower.includes("x.ai") || lower.includes("xai")) return "OpenRouter";
  // Services
  if (lower.includes("scraperapi") || lower.includes("scraper api") || lower.includes("scraper") || lower.includes("saas.group")) return "ScraperAPI";
  if (lower.includes("oxylabs")) return "Oxylabs";
  if (lower.includes("apify")) return "Apify";
  if (lower.includes("elevenlabs") || lower.includes("eleven labs")) return "ElevenLabs";
  if (lower.includes("supabase")) return "Supabase";
  if (lower.includes("apollo")) return "Apollo";
  if (lower.includes("mention")) return "Mention";
  if (lower.includes("vector")) return "Vector";
  if (lower.includes("ngrok")) return "ngrok";
  if (lower.includes("railway")) return "Railway";
  if (lower.includes("profound")) return "Profound";
  if (lower.includes("transmedia")) return "TransMedia";
  return name;
}
