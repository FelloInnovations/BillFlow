# BillFlow

Internal dashboard for tracking AI agent infrastructure costs across projects and vendors at Fello Innovations.

> UI branding: **BillFlow** · GitHub repo: **SpendSync** · Deployed at: `spendsync-production.up.railway.app`

---

## Pages

| Page | Description |
|---|---|
| **Dashboard** | Orion AI assistant, stat cards, vendor spend chart, monthly trend + forecast summary, upcoming due invoices |
| **Financial Records** | Paginated, filterable invoice table with bulk mark-as-paid, single-row mark-as-paid, and manual invoice entry |
| **Projects** | Cards for each AI project showing LLMs, services, status, and estimated spend |
| **Tools** | Aggregated view of all LLM providers and external services with flagged-tool indicators |
| **Forecasting** | Projected next-month spend per vendor (3-month average), trend indicators, full vendor breakdown table and bar chart |
| **HubSpot Tickets** | Enrichment ticket tracker with KPI summary and collapsible ticket details |
| **Vault** | End-to-end encrypted shared password manager at `/vault.html` — AES-256-GCM, PBKDF2, zero-knowledge |

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js (App Router), TypeScript |
| Styling | Tailwind CSS, Shadcn UI |
| Charts | Recharts + custom SVG bars |
| Database | Supabase (PostgreSQL) |
| AI chat | OpenAI GPT-4o mini (streaming) |
| Deployment | Railway |

---

## Local Development

**Prerequisites**: Node 20+

```bash
npm install
```

Create `.env.local`:
```
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_key
```

```bash
npm run dev
```

App runs at `http://localhost:3000`.

> `NEXT_PUBLIC_BASE_URL` is not needed locally — only required in Railway so server components can self-fetch API routes.

---

## Deployment (Railway)

1. Push to `main` on GitHub — Railway auto-deploys
2. Required environment variables:
   ```
   SUPABASE_URL
   SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   NEXT_PUBLIC_BASE_URL=https://spendsync-production.up.railway.app
   OPENAI_API_KEY
   ```
3. App listens on port **8080** (hardcoded in `package.json` and `railway.json`)

---

## Changelog

### v2 — March 2026

#### Vault (Password Manager)
- End-to-end encrypted shared password manager, integrated into BillFlow at `/vault.html`
- AES-256-GCM encryption via Web Crypto API — all encryption client-side, Supabase never sees plaintext
- PBKDF2 key derivation (310,000 iterations) from master password
- Two-layer auth: Supabase Auth (identity) + Master Vault Key (encryption)
- Role-based access: admin/manager use master password, members authenticate via OTP
- Custom OTP system via Edge Functions + Resend — bypasses Supabase email rate limits
- Key wrapping: admin vault key wrapped per-member so OTP users decrypt the same vault
- Four credential categories: Projects, LLM & AI Tools, HubSpot & CRM, General & Other
- Password strength meter, password generator with length and character set toggles
- Vault Health score displayed as a circular progress ring (0–100)
- Sign-in activity tracking (`last_signin_at`, `last_signin_method`)
- Lock button clears vault key from memory immediately
- Team allowlist via `vault_members` table — only pre-approved emails can access

#### Flagged Tools
- Detects vendors billed recently but absent from all active projects
- Detects tools never linked to any project (active or shut down)
- Shown as amber alert card in the Dashboard stat row (replaces Months Tracked)
- Amber badges on individual tool cards on the Tools page
- Review link navigates to Tools page

#### Orion (AI Chat) Improvements
- Fixed spend total mismatch — AI now queries `financial_records` directly, no date filter, all statuses
- Uses `total_amount` as the definitive spend column (never `subtotal`)
- Forecast context added to system prompt — Orion can answer questions about projected spend

#### Bulk Mark-as-Paid (Financial Records)
- Checkbox column on all unpaid rows; master checkbox in header for select all / deselect all
- Floating action toolbar appears at bottom when rows are selected
- Confirmation dialog before bulk update
- Single-row Mark as Paid button on hover (no checkbox required)
- Instant UI update after marking — no full page reload
- Toast notifications for success and error states

#### Manual Invoice Entry (Financial Records)
- `+ Add Invoice` button opens a modal form
- Fields: Vendor Name, Invoice Number, Invoice Date, Due Date, Subtotal, Tax Amount, Total Amount, Currency, Payment Status, Description
- Total Amount auto-calculated from Subtotal + Tax in real time; overrideable
- Full validation with inline field errors
- Inserts into `financial_records` with email-sourced fields set to null
- Discard confirmation if modal is closed with unsaved changes

#### Spend Forecasting
- New **Forecasting** page in sidebar
- Projects next month's spend per vendor using a simple 3-month rolling average (paid and pending invoices included)
- Page includes: summary stat cards, full vendor table with 3-month history, trend indicators (↑ ↓ →), horizontal bar chart coloured by trend
- Inactive vendors (no invoices in last 3 months) shown in a collapsed section, excluded from the total
- Forecast summary embedded in the right chart column on the Dashboard
- Forecast data passed into Orion's context

#### Dashboard Layout Restructure
- Layout order: Orion → stat cards → charts → upcoming due invoices
- Flagged tools moved into 4th stat card (replacing Months Tracked) — amber left border, counts, Review link
- Forecast summary embedded inside the Monthly Spend Trend card — single unified card, no extra full-width strips
- Spend by Vendor and Monthly Trend charts moved directly below stat cards

---

### v1 — March 2026 (initial features)
- Custom date range spend card with calendar picker and paid/unpaid/upcoming breakdown
- Fixed vendor chart (was querying current year only — now last 12 months)
- Fixed monthly trend (was showing paid-only — now all invoices)
- HubSpot Tickets page with enrichment KPI summary and collapsible ticket list
- Dark/light mode support across all pages
- DashboardChat — floating Orion AI chat widget powered by OpenAI GPT-4o mini

### v0 — February 2025 (initial release)
- Dashboard KPI cards, vendor bar chart, monthly area chart
- Financial Records table with pagination and vendor/status/date filters
- Projects page with LLM and service badges
- Tools page with LLM providers and services breakdown
- Upcoming due invoices widget
- Railway deployment with Node 20
