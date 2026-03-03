import { ToolCard } from "@/components/tools/ToolCard";
import { Tool } from "@/types";
import { formatCurrency } from "@/lib/utils";

async function getTools(): Promise<{ tools: Tool[] }> {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const res = await fetch(`${base}/api/tools`, { cache: "no-store" });
  if (!res.ok) return { tools: [] };
  return res.json();
}

export default async function ToolsPage() {
  const { tools } = await getTools();

  const llms = tools.filter((t) => t.type === "llm");
  const services = tools.filter((t) => t.type === "service");
  const totalSpend = tools.reduce((s, t) => s + t.totalSpend, 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Tools</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {tools.length} vendors · {formatCurrency(totalSpend)} total spend
        </p>
      </div>

      {llms.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
            LLM Providers
          </h2>
          <div className="space-y-2">
            {llms.map((tool) => (
              <ToolCard key={tool.name} tool={tool} />
            ))}
          </div>
        </section>
      )}

      {services.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
            Services
          </h2>
          <div className="space-y-2">
            {services.map((tool) => (
              <ToolCard key={tool.name} tool={tool} />
            ))}
          </div>
        </section>
      )}

      {tools.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-16">
          No tools data available.
        </p>
      )}
    </div>
  );
}
