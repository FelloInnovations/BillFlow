# BillFlow — Claude Instructions

## Project Overview
Internal web app for Fello Innovations to track AI agent costs across projects and vendors.
No authentication required. Deployed on Railway.

> UI branding and package name: **BillFlow**. GitHub repo is currently named **SpendSync** (`FelloInnovations/SpendSync`) — rename to BillFlow manually via GitHub repo Settings. Railway URL `spendsync-production.up.railway.app` is the live deployment URL and cannot be changed in code.

## Tech Stack
- **Framework**: Next.js (App Router), TypeScript
- **Styling**: Tailwind CSS, Shadcn UI primitives
- **Charts**: Recharts
- **Database**: Supabase (PostgreSQL) — `financial_records`, `agents_portfolio`, `hubspot_tickets` tables
- **Static data**: `lib/sheets.ts` (projects fallback), `lib/hubspot.ts` (HubSpot fallback) — hardcoded from xlsx
- **AI Chat**: OpenAI GPT-4o mini via `/api/chat` (streaming) — `@anthropic-ai/sdk` is installed but unused
- **Deployment**: Railway (port 8080), GitHub repo: `FelloInnovations/SpendSync` (pending rename to BillFlow)

## Key Conventions

### Data sources
- **Live data** comes from Supabase via `lib/supabase.ts` — never query directly, always use the `supabase` client
- **`financial_records`** — invoice/spend data (vendor_name, invoice_date, due_date, total_amount, payment_status, etc.)
- **`agents_portfolio`** — project data queried in the Projects page
- **`hubspot_tickets`** — HubSpot enrichment tickets; falls back to `lib/hubspot.ts` static data if DB unavailable
- **Static data** in `lib/sheets.ts` and `lib/hubspot.ts` — update manually when the xlsx changes
- **Always exclude MakemyTrip** from all Supabase queries: `.not("vendor_name", "ilike", "%makemytrip%")`

### API routes
| Route | Purpose |
|---|---|
| `GET /api/dashboard` | KPI cards + charts data (last 12 months) |
| `GET /api/dashboard/range?from=&to=` | Custom date range breakdown (paid/unpaid/upcoming) |
| `GET /api/invoices` | Paginated invoice table with filters (supports multi-vendor comma-separated) |
| `GET /api/invoices/vendors` | Unique vendor list for filter dropdown |
| `PATCH /api/invoices/[id]/paid` | Mark invoice as paid |
| `GET /api/sheets` | Projects + spend map from static data |
| `GET /api/tools` | Tools/vendors aggregated from static data |
| `GET /api/hubspot` | HubSpot tickets (DB with static fallback) |
| `POST /api/hubspot` | Add new HubSpot ticket |
| `POST /api/chat` | Streaming OpenAI chat for dashboard AI assistant |

### Self-fetch pattern
Server components fetch their own API routes. The base URL must be set:
```
NEXT_PUBLIC_BASE_URL=https://spendsync-production.up.railway.app
```
Without this, server components fall back to `http://localhost:3000` which fails on Railway (app runs on port 8080). All server component fetches are wrapped in try/catch returning empty data on failure.

### Component structure
```
components/
  dashboard/    — KPICard, SpendByMonthCard (range picker), SpendByVendorChart, MonthlyTrendChart,
                  DashboardChat (AI chat widget), DashboardClient (main dashboard orchestrator)
  records/      — RecordsTable, InvoiceDrawer
  projects/     — ProjectCard
  tools/        — ToolCard
  hubspot/      — TicketAccordion, AddTicketModal
  layout/       — Sidebar
  providers/    — ThemeProvider
```

### DashboardChat
`components/dashboard/DashboardChat.tsx` — floating AI chat widget (minimized pill or full popup modal).
- Calls `POST /api/chat` which streams from OpenAI GPT-4o mini
- Builds context from live dashboard metrics (top vendors, monthly spend, unpaid/overdue counts)
- 4 conversation starters pre-loaded
- System prompt: concise 2-4 sentence answers, spend insights only, professional tone

### Adding a new page
1. Create `app/<name>/page.tsx` (server component with try/catch)
2. Add to `NAV` array in `components/layout/Sidebar.tsx`
3. Add icon import from `lucide-react`

### Styling rules
- Card pattern: `rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm`
- Accent colors: indigo (spend/primary), amber (unpaid/warning), rose (overdue/danger), emerald (done/success)
- Always support dark mode with `dark:` variants

## Environment Variables
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
NEXT_PUBLIC_BASE_URL=https://spendsync-production.up.railway.app
OPENAI_API_KEY=      # required for DashboardChat (/api/chat)
```

## Deployment
- Push to `main` on GitHub → Railway auto-deploys
- Node >=20.9.0 required (`.nvmrc` set to `20`)
- Start command: `next start -p 8080` (set in both `package.json` and `railway.json`)
- Port 8080 is hardcoded (Railway assigns 8080)

## Scheduled Jobs

### snapshot-openrouter-usage
- **Purpose**: Per-key activity sync from OpenRouter → `api_invocation_logs` + `openrouter_usage_snapshots`
- **Trigger**: pg_cron daily at 2 AM UTC, or via Sync Now button → `POST /api/activity/sync`
- **Auth**: Uses `OPENROUTER_PROVISIONING_KEY` to list keys and fetch `/api/v1/activity?api_key_hash=<hash>`
- **Dedup**: Unique constraint on `api_invocation_logs(key_name, endpoint_id, invoked_at)` — safe to rerun
- **Selective sync**: POST body `{ key_names: ["key-foo"] }` syncs only those keys

### get-openrouter-usage
- **Per-key path** (`?key_name=`): reads monthly totals from `openrouter_usage_snapshots` (no live OR call)
- **Account-level** (no param): calls `/api/v1/credits` with `OPENROUTER_API_KEY`

### New API route
| Route | Purpose |
|---|---|
| `POST /api/activity/sync` | Triggers `snapshot-openrouter-usage` edge function, returns sync summary |

## Feature Log
<!-- Append new features here as they are added -->

### 2025-02 (Initial build)
- Dashboard with KPI cards, vendor chart, monthly trend chart, upcoming due invoices
- Financial Records page with paginated table, filters, mark-as-paid
- Projects page from static xlsx data
- Tools page from static xlsx data

### 2026-03
- **HubSpot Tickets page** — summary KPI cards + collapsable accordion, clickable links, hit rate color coding; Add Ticket modal with DB persistence + static fallback
- **Date range spend card** — replaced static "Last Month's Spend" with custom date picker (From/To), shows paid total with expandable paid/unpaid/upcoming breakdown
- **Fixed vendor chart** — was querying from Jan 1 current year (empty); now queries last 12 months
- **Fixed monthly trend** — was showing paid-only; now shows all invoices (paid + unpaid)
- **Monthly trend split** — API now returns paid/unpaid/overdue breakdown per month
- **DashboardChat** — floating AI chat widget powered by OpenAI GPT-4o mini with streaming, context-aware spend insights
- **Projects live data** — Projects page now queries `agents_portfolio` Supabase table (not just static xlsx)
