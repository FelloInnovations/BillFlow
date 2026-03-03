import { Project } from "@/types";

// Static data from AI Agents Portfolio.xlsx — update when sheet changes
export const STATIC_PROJECTS: Project[] = [
  {
    name: "Scrapey",
    description:
      "Auto-enriches Real Estate and Mortgage professional details from Zillow, LinkedIn, and web sources, delivering to Sales on demo bookings",
    timeline: null,
    llms: [
      { provider: "Perplexity", model: "sonar-reasoning-pro", owner: "Riyon" },
      { provider: "Anthropic", model: "Sonnet 4", owner: "Riyon" },
      { provider: "Anthropic", model: "Sonnet 4.5", owner: "Riyon" },
      { provider: "Google", model: "Gemini 2.0-flash", owner: "Riyon" },
      { provider: "OpenAI", model: "gpt-4o-mini", owner: "Innovations" },
    ],
    services: ["ScraperAPI"],
    totalSpend: null,
  },
  {
    name: "AI SDR",
    description:
      "Identifies website visitors, researches their activity and company, sends personalized outreach emails",
    timeline: null,
    llms: [],
    services: ["Vector"],
    totalSpend: null,
  },
  {
    name: "DB Health Report Quiz",
    description: "Comprehensive agent database diagnostics through intelligent questioning",
    timeline: null,
    llms: [{ provider: "OpenAI", model: "gpt-4", owner: "Tom" }],
    services: [],
    totalSpend: null,
  },
  {
    name: "Real Estate Team Analyser",
    description:
      "Multi-agent system gathering team transactions, details, tech stack, social presence, reviews and ratings",
    timeline: null,
    llms: [],
    services: ["Oxylabs", "Apify"],
    totalSpend: null,
  },
  {
    name: "LLM SEO",
    description:
      "Produces 25+ AI-optimized articles weekly on Fello and real estate for maximum LLM citations and reach",
    timeline: null,
    llms: [{ provider: "Anthropic", model: "TBD", owner: "TBD" }],
    services: ["Profound"],
    totalSpend: null,
  },
  {
    name: "Churn Call Analysis",
    description: "Comprehensive chronological report on churned client calls",
    timeline: null,
    llms: [{ provider: "Anthropic", model: "TBD", owner: "TBD" }],
    services: [],
    totalSpend: null,
  },
  {
    name: "Reddit Mentions",
    description: "Real-time monitoring of brand mentions and discussions on Reddit",
    timeline: null,
    llms: [],
    services: ["Mention"],
    totalSpend: null,
  },
  {
    name: "AI Reviewer / QA",
    description: "Independent validation layer with autonomous logic across all AI workflows",
    timeline: null,
    llms: [{ provider: "Anthropic", model: "TBD", owner: "TBD" }],
    services: [],
    totalSpend: null,
  },
  {
    name: "Product Marketing AI Agent",
    description: "Real-time competitive gap analysis identifying opportunities against competitor features",
    timeline: null,
    llms: [{ provider: "Anthropic", model: "TBD", owner: "TBD" }],
    services: [],
    totalSpend: null,
  },
  {
    name: "AI Resume Analyser",
    description: "Ranks top candidates from application pools based on requirements",
    timeline: null,
    llms: [{ provider: "OpenAI", model: "TBD", owner: "TBD" }],
    services: [],
    totalSpend: null,
  },
  {
    name: "Mega Agent Directory",
    description:
      "Enriching entire US Real Estate professionals and teams in proprietary infrastructure",
    timeline: null,
    llms: [{ provider: "Anthropic", model: "TBD", owner: "TBD" }],
    services: ["Oxylabs", "Apify"],
    totalSpend: null,
  },
  {
    name: "Testimonial Agent",
    description: "Converts customer call recordings into testimonial blogs",
    timeline: null,
    llms: [{ provider: "Anthropic", model: "TBD", owner: "TBD" }],
    services: [],
    totalSpend: null,
  },
  {
    name: "Data Enrichment Pipeline",
    description:
      "Comprehensive data operations supporting Sales, Marketing, and RevOps teams",
    timeline: null,
    llms: [],
    services: ["Apollo", "Oxylabs"],
    totalSpend: null,
  },
  {
    name: "CRM Agent",
    description: "Enriching CRM for MAD",
    timeline: null,
    llms: [{ provider: "xAI", model: "Grok", owner: "TBD" }],
    services: [],
    totalSpend: null,
  },
  {
    name: "Social Media Agent",
    description: "Enriching Social Media for MAD",
    timeline: null,
    llms: [{ provider: "Google", model: "Gemini", owner: "TBD" }],
    services: [],
    totalSpend: null,
  },
  {
    name: "Octo (MCP)",
    description: "MCP-based orchestration agent",
    timeline: null,
    llms: [],
    services: ["ngrok"],
    totalSpend: null,
  },
  {
    name: "HubSpot Enrichment",
    description:
      "Enriches HubSpot contact lists for Sales, CS, and event attendees",
    timeline: null,
    llms: [{ provider: "Anthropic", model: "TBD", owner: "TBD" }],
    services: ["Apollo", "ScraperAPI"],
    totalSpend: null,
  },
];

export async function getProjects(): Promise<Project[]> {
  return STATIC_PROJECTS;
}
