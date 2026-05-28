# BillFlow — Codebase Reference

> Read this file before making any change to the BillFlow codebase. It is the authoritative reference for every table, file, pattern, and constraint in the project.

---

## 1. Project Overview

**BillFlow** is an internal web application for Fello Innovations that tracks AI infrastructure spend across projects and vendors. It also functions as a shared password manager (the Vault) for the team.

- **Live URL**: `https://spendsync-production.up.railway.app`
- **GitHub repo**: `FelloInnovations/SpendSync` (repo name differs from UI branding)
- **UI branding**: BillFlow
- **Who uses it**: Fello Innovations internal team (~8 members)
- **Access**: No authentication on the main dashboard. The Vault (`/vault.html`) requires Supabase Auth + master password or OTP.

**Core capabilities:**
- Track AI vendor invoices with payment status, amounts, dates
- Dashboard with spend KPIs, charts, Orion AI assistant, and spend forecasting
- View AI projects with their LLM/service dependencies
- View vendor/tool breakdown with flagged-tool detection
- HubSpot contact enrichment ticket tracking
- Spend forecasting (3-month rolling average per vendor)
- End-to-end encrypted team password vault

---

## 2. Tech Stack

| Layer | Technology | Version / Notes |
|---|---|---|
| Framework | Next.js App Router | ^16.1.6, TypeScript |
| Styling | Tailwind CSS | ^3.4.1, `darkMode: ["class"]` |
| UI primitives | Shadcn UI / Radix UI | `@radix-ui/react-{dialog,select,separator,slot,tooltip}` |
| Charts | Recharts | ^2.14.1 (MonthlyTrendChart); custom SVG bars (SpendByVendorChart, ForecastBarChart) |
| Database | Supabase (PostgreSQL) | `@supabase/supabase-js` ^2.98.0 |
| Auth | Supabase Auth | Email/password + magic link (Vault only) |
| AI chat | OpenAI GPT-4o mini | `openai` ^6.27.0; streaming via `ReadableStream` |
| Email | Resend | via Edge Functions only (`RESEND_API_KEY` secret) |
| Edge Functions | Deno (Supabase) | 4 functions: send-otp, verify-otp, create-account, notify-admin |
| Deployment | Railway | Port 8080, Node >=20.9.0, auto-deploy from `main` |
| Theme | next-themes | ^0.4.6 |
| Icons | lucide-react | ^0.469.0 |
| Class merging | clsx + tailwind-merge | `cn()` helper in `lib/utils.ts` |
| Date utilities | date-fns | ^4.1.0 (used in SpendByMonthCard) |

**Note**: `@anthropic-ai/sdk` ^0.78.0 is installed but **unused**. All AI chat runs through OpenAI.

---

## 3. Database Schema

### `public.financial_records`
Primary data table. Every invoice from email parsing or manual entry.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | NO | `DEFAULT gen_random_uuid()`, PK |
| `created_at` | timestamptz | NO | `DEFAULT now()`, auto |
| `email_id` | text | YES | Source email ID; NULL for manually entered invoices |
| `email_subject` | text | YES | Source email subject |
| `email_from` | jsonb | YES | `{name?: string, email?: string}` |
| `email_date` | text | YES | Date of source email |
| `pdf_filename` | text | YES | Attached PDF filename |
| `vendor_name` | text | YES | Vendor/supplier name (used for all grouping) |
| `invoice_number` | text | YES | Invoice reference number |
| `invoice_date` | date | YES | Date on the invoice |
| `due_date` | date | YES | Payment due date |
| `subtotal` | numeric | YES | Pre-tax amount |
| `tax_amount` | numeric | YES | Tax component |
| `total_amount` | numeric | YES | **Definitive spend column** — always use this for totals, never subtotal |
| `currency` | text | NO | Default `'USD'` |
| `payment_status` | text | NO | `'pending'` \| `'paid'` \| `'overdue'` |
| `description` | text | YES | Optional notes |

**Critical rule**: Always exclude MakemyTrip — `.not("vendor_name", "ilike", "%makemytrip%")` on every query.
**RLS**: Disabled (internal use, no user-specific filtering).

---

### `public.agents_portfolio`
AI project metadata. **Warning**: The migration SQL in `supabase/migrations/agents_portfolio.sql` defines `llms` as JSONB and `services` as `text[]`, but the **live DB** uses different column names and types. The live schema (as queried by `app/api/sheets/route.ts` and `app/api/flagged-tools/route.ts`) is:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, auto |
| `created_at` | timestamptz | auto |
| `agents_projects` | text | Project name |
| `llms` | text | Comma-separated LLM provider names (e.g. `"Anthropic, OpenAI"`) |
| `llm_accounts` | text | LLM account details (comma-separated) |
| `services_used` | text | Comma-separated service names (e.g. `"Oxylabs, Apify"`) |
| `status` | text | Project status; `'shut down'` = inactive |
| `description` | text | NULL |
| `timeline` | text | NULL |

**RLS**: Disabled.

---

### `public.hubspot_tickets`
HubSpot contact enrichment requests.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, auto |
| `created_at` | timestamptz | auto |
| `ticket_link` | text | NULL — HubSpot record URL |
| `category` | text | NULL — ticket type (e.g. "Event Attendee List") |
| `list_detail` | text | NULL — description of the list |
| `contacts_to_enrich` | integer | NOT NULL, DEFAULT 0 |
| `fields_to_enrich` | text | NULL — comma-separated field names |
| `eta` | date | NULL |
| `enrichment_status` | text | NULL — e.g. `'Done'`, `'In Progress'` |
| `valid_enriched` | integer | NULL — count of successfully enriched contacts |
| `hit_rate` | numeric | NULL — ratio 0.0–1.0 (not percentage) |
| `final_status` | text | NULL |
| `notes` | text | NULL |
| `owner` | text | NULL |

**RLS**: Disabled.

---

### `public.vault_members`
Allowlist of users who can access the Vault. Pre-seeded with 8 members.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, auto |
| `email` | text | NOT NULL, UNIQUE |
| `role` | text | NOT NULL, DEFAULT `'member'` — `'admin'` \| `'manager'` \| `'member'` |
| `is_active` | boolean | NOT NULL, DEFAULT true — set false to revoke access |
| `last_signin_at` | timestamptz | NULL — updated on every vault open |
| `last_signin_method` | text | NULL — `'master_password'` \| `'otp'` |
| `otp_hash` | text | NULL — SHA-256 hex of the active OTP |
| `otp_expires_at` | timestamptz | NULL — 10-minute window |
| `otp_used` | boolean | DEFAULT false — prevents replay |
| `created_at` | timestamptz | DEFAULT now() |

**RLS policies:**
- `vault_members_select_all`: SELECT open to all (needed for pre-auth email check before login)
- `vault_members_write_admin`: INSERT/UPDATE/DELETE only if `user_settings.role = 'admin'`
- `vault_members_update_own`: UPDATE own row allowed for sign-in tracking (`email = auth.users.email`)

---

### `public.user_settings`
Per-user vault encryption configuration. One row per authenticated vault user.

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | PK, FK → `auth.users` |
| `pbkdf2_salt` | text | NULL — base64-encoded 16 random bytes for PBKDF2 |
| `verification_blob` | text | NULL — AES-GCM ciphertext of `'billflow-vault-verified'` |
| `verification_iv` | text | NULL — base64 IV for verification_blob |
| `is_admin_settings` | boolean | DEFAULT false — `true` only on admin's row; members use this to find the wrapped vault key |
| `role` | text | NOT NULL, DEFAULT `'member'` |
| `signin_method` | text | NULL — `'master_password'` \| `'otp'` |
| `last_signin_at` | timestamptz | NULL |
| `signin_count` | integer | NOT NULL, DEFAULT 0 |
| `last_ip` | text | NULL |
| `last_user_agent` | text | NULL |
| `member_access_key` | text | NULL — base64 raw AES-256 key; admin generates this per user to wrap/unwrap the vault key |
| `wrapped_vault_key` | text | NULL — base64 AES-GCM ciphertext of the raw vault key, encrypted with member_access_key |
| `wrapped_vault_key_iv` | text | NULL — base64 IV for wrapped_vault_key |

**RLS policies:**
- `user_settings_select`: own row OR `is_admin_settings = true` (so members can read admin's wrapped key)
- `user_settings_insert/update/delete`: own row only

---

### `public.vault_entries`
Encrypted credential entries. Each field has both a ciphertext column and an IV column.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, auto |
| `user_id` | uuid | NOT NULL, FK → `auth.users` |
| `service_name` | text | NOT NULL — credential name |
| `category` | text | NOT NULL — `'Projects'` \| `'LLM & AI Tools'` \| `'HubSpot & CRM'` \| `'General & Other'` |
| `tags` | text | NULL |
| `enc_username` | text | NULL — AES-GCM ciphertext |
| `iv_username` | text | NULL — base64 IV |
| `enc_password` | text | NULL — AES-GCM ciphertext |
| `iv_password` | text | NULL — base64 IV |
| `enc_url` | text | NULL — AES-GCM ciphertext |
| `iv_url` | text | NULL — base64 IV |
| `enc_notes` | text | NULL — AES-GCM ciphertext |
| `iv_notes` | text | NULL — base64 IV |
| `created_at` | timestamptz | DEFAULT now() |
| `updated_at` | timestamptz | NULL |

**RLS policy**: `own entries only` — `auth.uid() = user_id` for ALL operations.

---

## 4. File Structure

```
BillFlow/
├── app/                          Next.js App Router pages and API routes
│   ├── layout.tsx                Root layout — wraps all pages with Sidebar, ThemeProvider, VaultAuthRedirect
│   ├── globals.css               Global CSS variables (Shadcn color tokens, dark mode vars)
│   ├── page.tsx                  Dashboard page — server component, fetches /api/dashboard, renders DashboardClient
│   ├── records/page.tsx          Financial Records page — server component, renders RecordsTable
│   ├── projects/page.tsx         Projects page — server component, fetches agents_portfolio, renders ProjectsClient
│   ├── tools/page.tsx            Tools page — server component, fetches /api/tools + /api/flagged-tools
│   ├── forecasting/page.tsx      Forecasting page — server component, calls buildForecast() directly
│   ├── hubspot/page.tsx          HubSpot Tickets page — server component, renders TicketAccordion
│   └── api/
│       ├── dashboard/
│       │   ├── route.ts          GET /api/dashboard — KPI metrics, vendor spend, monthly trend (last 12 months)
│       │   └── range/route.ts    GET /api/dashboard/range?from=&to= — custom date range spend breakdown
│       ├── invoices/
│       │   ├── route.ts          GET /api/invoices (paginated+filtered) + POST /api/invoices (create)
│       │   ├── vendors/route.ts  GET /api/invoices/vendors — unique vendor list for filter dropdown
│       │   ├── bulk-paid/route.ts PATCH — bulk mark invoices as paid by id array
│       │   └── [id]/paid/route.ts PATCH — mark single invoice as paid
│       ├── chat/route.ts         POST /api/chat — OpenAI streaming chat with full BillFlow context + forecast
│       ├── sheets/route.ts       GET /api/sheets — projects from agents_portfolio + spend map
│       ├── tools/route.ts        GET /api/tools — vendor/tool aggregation with monthly trends
│       ├── flagged-tools/route.ts GET /api/flagged-tools — billed-inactive + never-used vendor detection
│       ├── forecast/route.ts     GET /api/forecast — calls buildForecast(), returns ForecastResult
│       ├── hubspot/route.ts      GET /api/hubspot (DB + static fallback) + POST (add ticket)
│       └── vault/register/route.ts POST — vault credential registration helper
│
├── components/
│   ├── layout/
│   │   └── Sidebar.tsx           Navigation sidebar with theme toggle; NAV array defines all routes
│   ├── providers/
│   │   ├── ThemeProvider.tsx     Wraps next-themes ThemeProvider; attribute="class"
│   │   └── VaultAuthRedirect.tsx Client component that redirects /vault path to /vault.html
│   ├── dashboard/
│   │   ├── DashboardClient.tsx   Main dashboard orchestrator — state, fetching, layout assembly
│   │   ├── DashboardChat.tsx     Orion AI chat widget (minimised pill → full modal)
│   │   ├── KPICard.tsx           Reusable stat card with icon, value, subtitle, accent colour
│   │   ├── SpendByMonthCard.tsx  Date range picker card — custom From/To picker, paid/unpaid/upcoming breakdown
│   │   ├── SpendByVendorChart.tsx Custom horizontal bar chart — vendor spend (last 12 months), hover tooltip
│   │   ├── MonthlyTrendChart.tsx  Recharts AreaChart — monthly spend trend (standalone, used by non-dashboard contexts)
│   │   ├── TrendAndForecastCard.tsx Unified right-column card — trend chart (top) + forecast summary (bottom)
│   │   └── SpendForecastSection.tsx Legacy full-width forecast strip (still exists but no longer used in DashboardClient)
│   ├── records/
│   │   ├── RecordsTable.tsx      Paginated invoice table — filters, checkboxes, bulk paid, drawer, add modal
│   │   ├── InvoiceDrawer.tsx     Side drawer showing full invoice details on row click
│   │   └── AddInvoiceModal.tsx   Manual invoice entry modal with auto-calc total and discard confirmation
│   ├── projects/
│   │   ├── ProjectsClient.tsx    Client wrapper for projects page — state management
│   │   └── ProjectCard.tsx       Individual project card — LLM badges, service tags, spend, status
│   ├── tools/
│   │   ├── ToolCard.tsx          Vendor/tool card — flagType badges (paying_not_in_use, never_used)
│   │   └── FlaggedToolsBanner.tsx Tools page header banner — amber/red pills, opens FlaggedToolsModal
│   ├── hubspot/
│   │   ├── TicketAccordion.tsx   Collapsible ticket rows with hit rate colour coding
│   │   └── AddTicketModal.tsx    Modal form for creating new HubSpot tickets
│   ├── forecasting/
│   │   └── ForecastingClient.tsx Full forecasting page — stat cards, table, bar chart, inactive vendors
│   └── FlaggedToolsModal.tsx     Shared modal used by Tools page — shows billed-inactive + never-used lists
│
├── lib/
│   ├── supabase.ts               Supabase client (server-only) — never import in client components
│   ├── utils.ts                  Shared utilities: cn(), formatCurrency(), formatDate(), isOverdue(), canonicalVendor()
│   ├── forecast.ts               buildForecast() — 3-month rolling average per vendor, trend classification
│   ├── sheets.ts                 STATIC_PROJECTS array — hardcoded from xlsx, fallback for Projects page
│   └── hubspot.ts                HUBSPOT_TICKETS array — hardcoded from xlsx, fallback for HubSpot page
│
├── types/
│   └── index.ts                  All TypeScript interfaces: HubspotTicket, FinancialRecord, DashboardMetrics,
│                                  Project, LLMEntry, Tool, FlaggedBilledVendor, NeverUsedVendor,
│                                  FlaggedToolsData, VendorForecast, ForecastResult, InvoiceFilters, PaginatedResult
│
├── public/
│   └── vault.html                BillFlow Vault — 2,082-line standalone HTML/CSS/JS file, no framework
│                                  Contains complete schema docs in HTML comment at top (lines 1–59)
│
├── supabase/
│   ├── functions/
│   │   ├── send-otp/index.ts     Edge Function — generates OTP, hashes it, stores in vault_members, sends via Resend
│   │   ├── verify-otp/index.ts   Edge Function — verifies OTP hash, generates magic-link token for Supabase Auth
│   │   ├── create-account/index.ts Edge Function — creates/updates Supabase auth user, bypasses email confirmation
│   │   └── notify-admin/index.ts  Edge Function — sends admin notification email via Resend on new account creation
│   └── migrations/
│       ├── hubspot_tickets.sql    CREATE TABLE hubspot_tickets + seed data (20 tickets)
│       ├── agents_portfolio.sql   CREATE TABLE agents_portfolio (JSONB schema) + seed data — NOTE: live DB uses text columns
│       └── agents_portfolio_status.sql ALTER TABLE to add status column
│
├── setup-vault-key.mjs           One-time admin script — derives vault key, creates member_access_key,
│                                  upserts user_settings for admin. Run once: node setup-vault-key.mjs
├── CLAUDE.md                     Claude Code instructions — conventions, API routes, styling rules
├── SKILL.md                      This file
├── README.md                     Project documentation
├── package.json                  Dependencies, scripts (dev/build/start -p 8080/lint)
├── next.config.ts                serverExternalPackages: ["pg"]
├── tailwind.config.ts            darkMode: class, Shadcn CSS variable colour tokens
├── tsconfig.json                 @/* path alias maps to ./
├── railway.json                  Build: DOCKERFILE, restart: ON_FAILURE
└── .nvmrc                        "20" — Node 20 required
```

---

## 5. Pages and Components

### Dashboard (`/`) — `app/page.tsx` + `components/dashboard/DashboardClient.tsx`

**Displays**: Orion AI chat, 4 stat cards, Spend by Vendor chart + Trend+Forecast unified card, Upcoming Due invoices.

**Supabase tables read**: `financial_records` (via `/api/dashboard`), `agents_portfolio` (via `/api/sheets`), `financial_records` again (via `/api/flagged-tools` and `/api/forecast`)

**Layout (top to bottom)**:
1. Header row with Refresh button
2. Orion AI chat widget (`DashboardChat`)
3. 4 stat cards: SpendRangeCard | Unpaid Invoices | Overdue | FlaggedAlertCard (inline JSX)
4. Two-column charts: SpendByVendorChart (left) | TrendAndForecastCard (right)
5. Upcoming Due Invoices list (conditional)

**State managed in DashboardClient**:
- `metrics` (DashboardMetrics) — from server-side fetch, refreshable
- `loading` (boolean) — Refresh button state
- `lastRefreshed` (Date)
- `vendorProjects` (Record<string, string[]>) — vendor → project list mapping, from `/api/sheets`
- `flaggedData` (FlaggedToolsData) — from `/api/flagged-tools`, used by inline FlaggedAlertCard

**User actions**: Click Refresh, open Orion chat, click Review → (links to /tools), click View full forecast → (links to /forecasting)

---

### Financial Records (`/records`) — `app/records/page.tsx` + `components/records/RecordsTable.tsx`

**Displays**: Paginated invoice table with filters, bulk selection, mark-as-paid, drawer, add modal.

**Supabase tables**: `financial_records` (read via `/api/invoices`, write via PATCH + POST endpoints)

**Filters**: vendor (multi-select dropdown from `/api/invoices/vendors`), status (pending/paid), date range (from/to)

**State managed in RecordsTable**:
- `records`, `total`, `page`, `totalPages` — pagination state
- `vendors` — for filter dropdown
- `filters` (InvoiceFilters) — current filter state
- `loading` (boolean)
- `selectedId` — open drawer
- `checkedIds` (Set<string>) — selected rows for bulk action
- `confirming` (boolean) — bulk-paid confirmation state
- `markingPaid` (boolean) — in-flight state
- `toast` — toast message state
- `showAddModal` (boolean)

**User actions**:
- Filter by vendor/status/dates
- Click row → opens InvoiceDrawer
- Checkbox → selects row (unpaid only)
- Master checkbox → select all / deselect all
- Floating toolbar → Mark as Paid (bulk) with confirmation dialog
- Row hover → single Mark as Paid button (in Status cell)
- `+ Add Invoice` → opens AddInvoiceModal

**Key sub-components**:
- `Checkbox` — internal sub-component with indeterminate ref support via callback ref
- `Toast` — fixed top-right, 3-second auto-dismiss
- `InvoiceDrawer` — full-height side panel with all invoice fields
- `AddInvoiceModal` — full modal with auto-calc total (subtotal + tax), discard confirmation

---

### Projects (`/projects`) — `app/projects/page.tsx` + `components/projects/ProjectsClient.tsx`

**Displays**: Grid of ProjectCard components. Each card shows name, status, description, LLMs used (badges), services (tags), timeline, estimated spend.

**Supabase tables**: `agents_portfolio` (live data); falls back to `lib/sheets.ts` (STATIC_PROJECTS) if DB unavailable.

**Data source note**: `app/api/sheets/route.ts` queries `agents_portfolio` and maps the live DB columns (`agents_projects`, `llms`, `llm_accounts`, `services_used`, `status`) to the `Project` interface. `lib/sheets.ts` provides a static fallback.

---

### Tools (`/tools`) — `app/tools/page.tsx`

**Displays**: ToolCard grid, FlaggedToolsBanner if any flagged tools exist.

**Supabase tables**: `financial_records` (via `/api/tools` and `/api/flagged-tools`), `agents_portfolio` (via `/api/flagged-tools`)

**Flagging logic** (in `/api/flagged-tools/route.ts`):
- Type 1 (amber, `paying_not_in_use`): vendor invoiced in last 60 days OR has pending invoice, but NOT in any active project's tools list
- Type 2 (red, `never_used`): vendor in `financial_records` but NOT in any project at all (active or shut down)
- Tool name matching is fuzzy: bidirectional `.toLowerCase().includes()` check

**User actions**: Click amber/red pill → opens FlaggedToolsModal

---

### Forecasting (`/forecasting`) — `app/forecasting/page.tsx` + `components/forecasting/ForecastingClient.tsx`

**Displays**: 3 stat cards (Projected Total, Vendors Tracked, Highest Spend Vendor), forecast table (3-month history + forecasted + trend), full colour-coded bar chart, collapsed inactive vendors section.

**Data source**: `buildForecast()` from `lib/forecast.ts` called directly in server page component.

**Trend classification**: ↑ (amber) = last month >10% higher than 3 months ago; ↓ (green) = >10% lower; → (gray) = within 10%.

**Inactive vendors**: Had invoices historically but none in last 3 months. Excluded from forecast total. Shown in collapsed accordion at bottom.

**User actions**: Refresh button (re-fetches `/api/forecast`), expand/collapse inactive section, View full forecast link (just this page's own entry point)

---

### HubSpot Tickets (`/hubspot`) — `app/hubspot/page.tsx` + `components/hubspot/TicketAccordion.tsx`

**Displays**: KPI summary cards (total, completed, avg hit rate, avg contacts enriched) + collapsible ticket rows.

**Supabase tables**: `hubspot_tickets` (live); falls back to `lib/hubspot.ts` if DB errors.

**User actions**: Expand/collapse ticket rows, click ticket links (external HubSpot URLs), Add Ticket modal (`AddTicketModal`)

---

### Vault (`/vault.html`) — `public/vault.html`

Standalone single-file app. No Next.js, no React. Pure HTML + vanilla JS + Supabase JS SDK loaded from CDN.

**Displays**: Auth screen → Master screen (unlock) → Vault entries by category.

**Supabase tables**: `vault_members`, `user_settings`, `vault_entries`

**Screens**: `auth-screen`, `master-screen`, `setpw-screen`, `vault-screen`

**Credential categories**: Projects, LLM & AI Tools, HubSpot & CRM, General & Other

---

## 6. Shared Utilities

### `lib/utils.ts`

| Function | Signature | Purpose |
|---|---|---|
| `cn` | `(...inputs: ClassValue[]) => string` | Tailwind class merging via clsx + twMerge |
| `formatCurrency` | `(amount: number \| null, currency = "USD") => string` | Formats to `$X,XXX.XX`; returns `"—"` for null |
| `formatDate` | `(dateStr: string \| null) => string` | Formats to `"Mon DD, YYYY"`; returns `"—"` for null |
| `isOverdue` | `(dueDate: string \| null, status: string) => boolean` | Returns true if due date is past and status !== 'paid' |
| `canonicalVendor` | `(name: string) => string` | Normalises vendor name strings for matching (e.g. "x.ai" → "xAI", "scraperapi" → "ScraperAPI"). Used when building vendorProjects map in DashboardClient. 16 hardcoded mappings; falls through to original name. |

### `lib/forecast.ts`

| Function | Signature | Purpose |
|---|---|---|
| `buildForecast` | `() => Promise<ForecastResult>` | Server-only. Queries financial_records, groups by vendor+month, computes 3-month rolling average per vendor, classifies trend, separates inactive vendors. Used by both `app/api/forecast/route.ts` and `app/forecasting/page.tsx` directly. |

**`buildForecast()` internals**:
- Last 3 months = `[-1, -2, -3]` offsets from current month (index 0 = most recent)
- `monthValues[0]` = last month, `[2]` = 3 months ago
- Average = `sum(monthValues) / 3` (always divides by 3, even if vendor had $0 in some months — per spec)
- Trend: `(latest - oldest) / oldest > 0.1` → "up"; `< -0.1` → "down"; else "stable"
- `last3Months` stored as formatted strings ("Mar 2026") in `VendorForecast.last3Months`
- Excludes MakemyTrip

### `lib/supabase.ts`

Exports a single `supabase` client instance. **Server-only**. Never import in client components (no `"use client"` files should import this).

---

## 7. Edge Functions

All functions are Deno TypeScript, deployed to Supabase Edge Functions. All use `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secrets automatically injected by Supabase. All return CORS headers allowing `*`.

### `send-otp`
**Purpose**: Generates a 6-digit OTP, hashes it with SHA-256, stores the hash in `vault_members`, sends the plaintext code via Resend.

**Input** (JSON body): `{ email: string }`

**Output** (JSON): `{ success: true }` or `{ success: false, error: string }`

**Logic**:
1. Check `vault_members` — email must exist and `is_active = true`
2. Generate OTP via `crypto.getRandomValues(new Uint32Array(1))` → `100000 + (val % 900000)`
3. SHA-256 hash of OTP string
4. Upsert `otp_hash`, `otp_expires_at` (now + 10 min), `otp_used = false` to `vault_members`
5. POST to Resend API with styled HTML email

**Secrets used**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`

---

### `verify-otp`
**Purpose**: Verifies a submitted OTP, marks it used, returns a Supabase magic-link `token_hash` for the frontend to exchange for a real session.

**Input**: `{ email: string, otp: string }`

**Output**: `{ success: true, token_hash: string }` or `{ success: false, error: string }`

**Logic**:
1. Hash the incoming OTP with SHA-256
2. Fetch `vault_members` row — check `otp_used`, `otp_expires_at`, `otp_hash` match
3. Mark `otp_used = true`
4. Call `supabase.auth.admin.generateLink({ type: 'magiclink', email, shouldCreateUser: true })`
5. Return `hashed_token` from `linkData.properties`

**Secrets used**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

---

### `create-account`
**Purpose**: Creates (or updates) a Supabase Auth user without triggering a confirmation email. Used by vault first-time setup.

**Input**: `{ email: string, password: string }`

**Output**: `{ success: true, userId: string, role: string }` or `{ success: false, error: string }`

**Logic**:
1. Check `vault_members` — email must exist and `is_active = true`
2. Call `supabase.auth.admin.createUser({ email, password, email_confirm: true })`
3. If user already exists: list all auth users, find by email, update password via `updateUserById`
4. Return userId and role from `vault_members`

**Secrets used**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

---

### `notify-admin`
**Purpose**: Sends an admin notification email when a new vault account is created.

**Input**: `{ newUserEmail: string, role: string, createdAt: string }`

**Output**: Resend API response JSON

**Secrets used**: `RESEND_API_KEY`

---

## 8. Auth Flow

### Main App (Dashboard, Records, Projects, Tools, etc.)
No authentication required. All pages are publicly accessible. The `VaultAuthRedirect` provider only handles the `/vault` path, redirecting to `/vault.html`.

---

### Vault — Admin / Manager (Master Password flow)

1. User visits `/vault.html`
2. `auth-screen` shown — user enters email + clicks "Continue"
3. Frontend checks `vault_members` (SELECT open to all) — if email not found or `is_active = false`, show error
4. Password input shown (master password UI)
5. User submits password to "Create Account" (first time) or uses existing session
6. **First-time**: Calls `create-account` Edge Function → creates Supabase Auth user, returns userId
7. Frontend calls `supabase.auth.signInWithPassword({ email, password })`
8. On success, `onAuthStateChange` fires → `setupMasterScreen()`
9. `setupMasterScreen()`: Fetches `user_settings` WHERE `user_id = auth.uid()` OR `is_admin_settings = true`
10. **If admin**: Uses admin's `pbkdf2_salt`, runs PBKDF2 (310k iterations, SHA-256) on master password → derives `vaultKey`
11. Decrypts `verification_blob` with `vaultKey` — must equal `'billflow-vault-verified'`
12. On success: opens vault, loads entries from `vault_entries`, decrypts each field
13. Tracks sign-in in `vault_members.last_signin_at`, `user_settings.signin_count`

---

### Vault — Member (OTP flow)

1. User visits `/vault.html`, enters email
2. Clicks "Send OTP code" — calls `send-otp` Edge Function
3. Receives 6-digit code by email (via Resend, expires in 10 min)
4. Enters code on screen → frontend calls `verify-otp` Edge Function
5. `verify-otp` returns `token_hash`
6. Frontend calls `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })` → gets real Supabase session
7. `onAuthStateChange` fires with `SIGNED_IN` → `setupMasterScreen()`
8. `setupMasterScreen()` detects member (no master password) → reads admin's `user_settings` row (`is_admin_settings = true`)
9. Admin's row contains `member_access_key` (raw base64 AES-256) and `wrapped_vault_key`
10. Frontend imports `member_access_key` → AES-GCM decrypts `wrapped_vault_key` → recovers raw `vaultKey`
11. Imports raw `vaultKey` as non-extractable AES-GCM key
12. Verifies against `verification_blob` — if match, vault opens
13. All subsequent entry decrypt/encrypt uses this recovered `vaultKey`

---

### Vault Lock
Clicking the Lock button calls `signOut()` which calls `supabase.auth.signOut()` and **sets `vaultKey = null`** in memory. The raw key material is never stored anywhere except in the JS variable.

---

## 9. Encryption Architecture

### What is stored in Supabase (ciphertext only)
- `vault_entries`: Every sensitive field (`username`, `password`, `url`, `notes`) stored as AES-GCM ciphertext + IV. Each field has its own IV.
- `user_settings.verification_blob/iv`: AES-GCM encryption of the string `'billflow-vault-verified'` using `vaultKey`. Used to verify the derived key is correct.
- `user_settings.wrapped_vault_key/iv`: AES-GCM encryption of the **raw bytes** of `vaultKey`, using `member_access_key`. Allows members to access the vault without knowing the master password.
- `user_settings.pbkdf2_salt`: Random 16 bytes (base64). Used as PBKDF2 salt. Not secret.
- `user_settings.member_access_key`: Raw AES-256 key bytes (base64). This IS stored in Supabase but is only used to wrap/unwrap `wrapped_vault_key`. The vault key itself is never stored in plaintext.

### What never leaves the browser
- `vaultKey` as a `CryptoKey` object in the JS variable `vaultKey`
- The master password string (used only for PBKDF2 derivation, immediately discarded)
- Decrypted plaintext of any credential field

### Key derivation (admin / master password path)
```
masterPassword + pbkdf2_salt
  → PBKDF2(SHA-256, 310,000 iterations)
  → AES-256-GCM CryptoKey (vaultKey)
  → decrypt verification_blob → must equal 'billflow-vault-verified'
  → decrypt vault_entries fields
```

### Key recovery (member / OTP path)
```
member_access_key (raw bytes from user_settings)
  → importKey('raw', ..., 'AES-GCM', false, ['decrypt'])
  → AES-GCM decrypt(wrapped_vault_key, wrapped_vault_key_iv)
  → raw bytes of vaultKey
  → importKey('raw', ..., 'AES-GCM', false, ['encrypt', 'decrypt'])
  → same vaultKey as admin's, but derived differently
```

### Encryption of entries
Each field encrypted independently with its own random 12-byte IV:
```javascript
iv = crypto.getRandomValues(new Uint8Array(12))
ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vaultKey, encoder.encode(plaintext))
stored as: { enc_field: base64(ciphertext), iv_field: base64(iv) }
```

---

## 10. Naming Conventions

### TypeScript / React
- **Components**: PascalCase (`DashboardClient`, `TrendAndForecastCard`)
- **Hooks / state**: camelCase (`flaggedData`, `vendorProjects`, `showAddModal`)
- **Interfaces**: PascalCase in `types/index.ts` (`FinancialRecord`, `ForecastResult`)
- **API handler functions**: Named by HTTP verb (`GET`, `POST`, `PATCH`)
- **Utility functions**: camelCase (`buildForecast`, `canonicalVendor`, `formatCurrency`)
- **Component props interfaces**: Named `Props` (local to file, not exported unless needed)

### Database columns
- All snake_case (`vendor_name`, `invoice_date`, `total_amount`, `payment_status`)
- Encrypted vault fields: `enc_` prefix for ciphertext, `iv_` prefix for IV (`enc_password`, `iv_password`)
- Timestamps: `_at` suffix (`created_at`, `last_signin_at`, `otp_expires_at`)
- Boolean flags: `is_` prefix (`is_active`, `is_admin_settings`), or past-tense (`otp_used`)

### API routes
- Kebab-case paths (`/api/flagged-tools`, `/api/bulk-paid`, `/api/dashboard/range`)
- Dynamic segments use brackets (`/api/invoices/[id]/paid`)

### Files
- Components: PascalCase `.tsx` (`RecordsTable.tsx`, `AddInvoiceModal.tsx`)
- Utilities/lib: camelCase `.ts` (`forecast.ts`, `supabase.ts`)
- Next.js pages: `page.tsx`, routes: `route.ts` (Next.js convention)
- Edge Functions: `index.ts` inside named folder (`send-otp/index.ts`)

### CSS / Tailwind
- Tailwind utilities only — no custom CSS classes except in `globals.css` (CSS variable tokens)
- Dark mode via `dark:` prefix variants
- Arbitrary values used for: `border-l-[3px]`, `text-[13px]`, `text-[15px]`

---

## 11. Key Dependencies

| Package | Version | Purpose |
|---|---|---|
| `next` | ^16.1.6 | Framework (App Router, server components, API routes) |
| `react` / `react-dom` | ^19.0.0 | UI library |
| `typescript` | ^5 | Type safety |
| `tailwindcss` | ^3.4.1 | Utility CSS |
| `clsx` | ^2.1.1 | Conditional class composition |
| `tailwind-merge` | ^2.6.0 | Tailwind class deduplication (used in `cn()`) |
| `lucide-react` | ^0.469.0 | Icons throughout the app |
| `next-themes` | ^0.4.6 | Dark/light mode toggle |
| `recharts` | ^2.14.1 | `MonthlyTrendChart` AreaChart only — SpendByVendorChart and forecast bars are custom |
| `@supabase/supabase-js` | ^2.98.0 | Database client (server-side in `lib/supabase.ts`) |
| `openai` | ^6.27.0 | GPT-4o mini streaming in `/api/chat` |
| `date-fns` | ^4.1.0 | Date formatting in `SpendByMonthCard` |
| `@radix-ui/react-dialog` | ^1.1.4 | Dialog primitive (some modals) |
| `@radix-ui/react-select` | ^2.1.4 | Select primitive |
| `@radix-ui/react-tooltip` | ^1.1.6 | Tooltip primitive |
| `class-variance-authority` | ^0.7.1 | CVA (installed, minimal use) |
| `@anthropic-ai/sdk` | ^0.78.0 | **INSTALLED BUT UNUSED** — do not remove (may be needed later) |

**CDN dependencies (vault.html only — not in package.json)**:
- `@supabase/supabase-js` via `https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm` (module import)
- All encryption via native `window.crypto.subtle` (no library)

---

## 12. Environment Variables

### Next.js app (`/.env.local` locally, Railway environment in production)

| Variable | Required | Used in | Notes |
|---|---|---|---|
| `SUPABASE_URL` | YES | `lib/supabase.ts` | Supabase project URL |
| `SUPABASE_ANON_KEY` | YES | `lib/supabase.ts` | Supabase anon/public key |
| `OPENAI_API_KEY` | YES | `app/api/chat/route.ts` | GPT-4o mini streaming |
| `NEXT_PUBLIC_BASE_URL` | Railway only | `app/page.tsx`, `app/api/chat/route.ts` | Full URL for server-side self-fetch. Not needed locally (falls back to `http://localhost:3000`). Required on Railway because app runs on port 8080, not 3000. |

### Edge Function secrets (set via `supabase secrets set`)

| Variable | Used in | Notes |
|---|---|---|
| `SUPABASE_URL` | All 4 functions | Auto-injected by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | `send-otp`, `verify-otp`, `create-account` | Auto-injected by Supabase |
| `RESEND_API_KEY` | `send-otp`, `notify-admin` | Must be set manually: `supabase secrets set RESEND_API_KEY=re_...` |

### vault.html (hardcoded constants)

The vault.html file contains the Supabase project URL and anon key **hardcoded as JavaScript constants** near the top of the script. This is intentional — vault.html has no build step. If the Supabase project changes, these must be updated manually in vault.html.

---

## 13. Known Patterns

### Server component data fetching
Server page components (`app/*/page.tsx`) fetch data from their own API routes using the `NEXT_PUBLIC_BASE_URL` base URL. All wrapped in try/catch returning empty fallback data:
```typescript
async function getData() {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const res = await fetch(`${base}/api/route`, { cache: "no-store" });
    if (!res.ok) return EMPTY_DATA;
    return res.json();
  } catch {
    return EMPTY_DATA;
  }
}
```
Exception: `app/forecasting/page.tsx` calls `buildForecast()` directly (no HTTP round-trip).

### Client-side data fetching (useEffect)
Client components that need fresh data on mount use `useEffect` with `fetch("/api/route")`:
```typescript
useEffect(() => {
  fetch("/api/flagged-tools")
    .then((r) => r.ok ? r.json() : null)
    .then((json) => { if (json) setFlaggedData(json); })
    .catch(() => {});
}, []);
```
Errors are silently ignored (`.catch(() => {})`). No loading state shown for these secondary fetches.

### Card styling pattern
Standard card: `rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm`
KPI card variant: adds `border-t-4 border-t-{color}-400` for accent top border.
Always use `dark:` variants. Never omit dark mode.

### Accent colour system
- Indigo: spend data, primary actions, charts
- Amber: unpaid, warnings, flagged tools
- Rose/red: overdue, danger, never-used tools
- Emerald/green: done, paid, decreasing spend (good)
- Cyan (`#00d4ff`): forecast projections
- Violet: upcoming due invoices

### Toasts (RecordsTable)
Internal `Toast` sub-component. State: `{ message: string; type: "success" | "error" } | null`. Auto-dismisses in 3 seconds via `setTimeout`. Fixed top-right, `z-50`.

### Modals (open/close)
Boolean state `showXyzModal`. Render conditional: `{showXyzModal && <XyzModal onClose={() => setShowXyzModal(false)} />}`. Backdrop click calls `onClose`. Internal `requestClose()` checks dirty state before closing (AddInvoiceModal pattern).

### Supabase bulk update
```typescript
await supabase
  .from("financial_records")
  .update({ payment_status: "paid" })
  .in("id", ids);
```

### Supabase single-record update
```typescript
await supabase
  .from("financial_records")
  .update({ payment_status: "paid" })
  .eq("id", id);
```

### Orion (AI chat) context building
`app/api/chat/route.ts` calls `buildFullContext()` on every request. This function:
1. Queries ALL `financial_records` directly (no date filter, excludes MakemyTrip)
2. Calls `buildForecast()` from `lib/forecast.ts`
3. Fetches `/api/sheets`, `/api/tools`, `/api/hubspot` in parallel via `Promise.allSettled`
4. Assembles a multi-section text context string
5. Injects into OpenAI system prompt
Context is rebuilt fresh on every chat message — no caching.

### Flagged tools matching
`app/api/flagged-tools/route.ts` uses fuzzy bidirectional matching:
```typescript
function fuzzyMatch(vendorKey: string, toolList: string[]): boolean {
  return toolList.some(t =>
    t.toLowerCase().includes(vendorKey) || vendorKey.includes(t.toLowerCase())
  );
}
```
Tools extracted from `agents_portfolio` by splitting `llms`, `llm_accounts`, `services_used` on commas, lowercasing, filtering out `"na"`, `"n/a"`, `"-"`.

### Forecast data display order
`VendorForecast.last3Months` is stored with **index 0 = last month (most recent)**, index 1 = 2 months ago, index 2 = 3 months ago. Display order in the forecast table is **reversed**: show oldest first (index 2 → 1 → 0). Always check this when touching ForecastingClient.tsx or TrendAndForecastCard.tsx.

### Static data fallbacks
`lib/sheets.ts` (STATIC_PROJECTS) and `lib/hubspot.ts` (HUBSPOT_TICKETS) are used as fallbacks if Supabase returns errors. These must be updated manually when the source xlsx changes.

---

## 14. What NOT to Touch

### `public/vault.html` — treat as a sealed unit
The vault is a 2,082-line standalone file. The schema documentation in the HTML comment at lines 1–59 is the canonical source of truth for vault table schemas. Changes to the vault's encryption flow must be made with full understanding of all key derivation and wrapping code. A bug here leaks credentials or locks users out permanently.

**Specifically, never change**:
- The PBKDF2 parameters (iterations: 310,000, hash: SHA-256, salt length: 16 bytes) — changing these makes all existing wrapped keys unreadable
- The AES-GCM IV generation (always 12 bytes random) — changing this breaks all stored ciphertext
- The `member_access_key` → `wrapped_vault_key` unwrapping path — this is the only way members access the vault

### `lib/supabase.ts` — server-only, do not import client-side
Importing this in any `"use client"` component will expose the Supabase anon key to the browser bundle in an unintended way. The anon key is public, but keeping server queries server-side is intentional for security and performance.

### MakemyTrip exclusion — never remove
Every `financial_records` query must include `.not("vendor_name", "ilike", "%makemytrip%")`. This vendor has anomalous data that skews all totals and charts. If you see a query without this filter, add it.

### `total_amount` vs `subtotal` — never swap
`total_amount` is the definitive spend column (includes tax). `subtotal` is pre-tax. Every spend aggregation must use `total_amount`. The Orion system prompt explicitly enforces this. The dashboard/Tools page discrepancy bug was caused by a query accidentally using `subtotal` — this must never happen again.

### `app/api/chat/route.ts` — `buildFullContext()` must stay server-side
This function queries Supabase directly and calls `buildForecast()`. It must remain in the API route, not moved to a client component. The OpenAI API key is only available server-side.

### `setup-vault-key.mjs` — run once only
This script sets the admin's vault key derivation parameters and wrapped vault key in `user_settings`. Running it again with a different password would invalidate all member access keys. The vault password is `innovations_gtmaifello@2026`. **Do not commit changes to this file** — it contains a hardcoded service role key.

### `supabase/migrations/agents_portfolio.sql` — schema is stale
The migration SQL defines `llms` as JSONB and `services` as `text[]`. The **live DB** uses different column names (`agents_projects`, `llms` as text, `llm_accounts`, `services_used`, `status` as text). Do not use the migration SQL as a reference for the live schema. Use the API routes (`sheets/route.ts`, `flagged-tools/route.ts`) to understand the actual columns.

### `NEXT_PUBLIC_BASE_URL` — required on Railway
Server components self-fetch their own API routes using this URL. Without it, Railway deployments fail silently (fetches go to localhost:3000, the app runs on 8080). Never remove the fallback `?? "http://localhost:3000"` from server component fetches — that's the local dev path.

### `VendorForecast.last3Months` index order
Index 0 = most recent month (last month). This is counter-intuitive. `ForecastingClient.tsx` and `TrendAndForecastCard.tsx` both manually reverse this to display oldest-first. If you add new forecast display code, use `[f.last3Months[2], f.last3Months[1], f.last3Months[0]]` for table columns.
