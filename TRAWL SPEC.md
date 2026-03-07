# Trawl — B2B Lead Intelligence Platform

> Locally-hosted, SQLite-backed, single-user B2B lead generation and outreach automation.  
> Discovers businesses via Google Maps, enriches with Playwright + LLM, scores fit, sends personalised cold emails, and hands warm replies off to a human salesperson.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Technology Stack](#2-technology-stack)
3. [System Architecture](#3-system-architecture)
4. [Database Schema](#4-database-schema)
5. [Feature Modules](#5-feature-modules)
6. [UI / Screen Map](#6-ui--screen-map)
7. [Configuration & Settings](#7-configuration--settings)
8. [Phased Build Plan](#8-phased-build-plan)
9. [Email Outreach Strategy](#9-email-outreach-strategy)
10. [Estimated Operating Costs](#10-estimated-operating-costs)
11. [Future Considerations](#11-future-considerations)
12. [Appendix A — LLM Prompt Design](#appendix-a--llm-prompt-design)

---

## 1. Overview

Trawl automates the full sales development cycle for B2B service businesses:

1. Discover target businesses in a geographic area via Google Maps
2. Profile your own company by crawling your website with Playwright + LLM
3. Enrich each lead — scrape their site, extract intelligence
4. Score fit — LLM compares lead profile to your supplier profile
5. Send personalised AI-written cold emails via your own SMTP
6. Poll for replies, draft an AI bridge email, and CC a human to take over

**Core principles:**
- Fully local — no cloud dependency, no SaaS subscription, no data leaves the machine
- Single-user, zero-ops — SQLite, no Docker, no external database server
- Generic by design — any B2B company onboards by pointing Trawl at their website
- AI-first enrichment — LLMs and Playwright do the research and writing
- Human-in-the-loop at the right moment — AI handles intro, humans close

**Reference deployment:** Rassaun Services Inc., industrial mechanical and electrical contractor, Simcoe, Ontario.

---

## 2. Technology Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router) | Local dev server, browser UI at localhost:3000 |
| Backend | Next.js API Routes + Server Actions | |
| Database | SQLite via `better-sqlite3` | Synchronous, embedded, zero setup |
| Browser Automation | Playwright (Chromium) | Website scraping + screenshot capture |
| LLM | Vercel AI SDK + provider adapters | Model-agnostic runtime selection across OpenAI and Anthropic |
| Email Send | Nodemailer (SMTP) | Gmail App Password or custom SMTP |
| Email Receive | IMAP via `imapflow` | Reply polling + threading |
| Search / Discovery | Google Maps Places API (New) | Text Search + Place Details |
| Job Queue | In-process queue backed by SQLite | Simple status machine on `search_jobs` + `leads` tables |
| Styling | Tailwind CSS + shadcn/ui | |
| Package Manager | pnpm | |
| Runtime | Node.js 20+ | |

---

## 3. System Architecture

Trawl is a **pipeline architecture** with five discrete stages. Each stage enriches the lead record and stores results in SQLite. Stages are independently re-runnable — if enrichment fails on one lead, retry without re-running discovery.

```
[Google Maps API]
      │
      ▼
Stage 1 — DISCOVER ──────────────► leads table (status: discovered)
                                          │
Stage 2 — PROFILE (your company) ────────┤ (anchors scoring)
                                          │
                                          ▼
Stage 3 — ENRICH ────────────────► lead_enrichments table (status: enriched)
                                          │
                                          ▼
Stage 4 — SCORE ─────────────────► lead_scores table (status: scored)
                                          │
                                          ▼
Stage 5 — OUTREACH ──────────────► outreach_emails table (status: contacted)
                                          │
                              ┌───────────┘
                              ▼
                    IMAP reply polling
                              │
                              ▼
                    conversations table (status: replied)
                              │
                              ▼
                    AI handoff email → human CC'd (status: handed_off)
```

### Directory Structure

```
trawl/
├── app/
│   ├── (dashboard)/
│   │   ├── page.tsx                  # Dashboard
│   │   ├── discover/page.tsx         # Discovery UI
│   │   ├── leads/page.tsx            # Leads table
│   │   ├── leads/[id]/page.tsx       # Lead detail
│   │   ├── outreach/page.tsx         # Email drafts + send queue
│   │   ├── inbox/page.tsx            # Reply tracker
│   │   └── settings/page.tsx         # Config + API keys
│   └── api/
│       ├── discover/route.ts         # POST: run Google Maps search
│       ├── profile/route.ts          # POST: crawl + profile own website
│       ├── enrich/[id]/route.ts      # POST: enrich single lead
│       ├── enrich/batch/route.ts     # POST: batch enrich queue
│       ├── score/[id]/route.ts       # POST: score single lead
│       ├── score/batch/route.ts      # POST: batch score queue
│       ├── email/generate/[id]/route.ts   # POST: generate email draft
│       ├── email/send/[id]/route.ts       # POST: send email
│       ├── email/send/batch/route.ts      # POST: drain send queue (cap enforced)
│       └── inbox/poll/route.ts       # POST: poll IMAP for replies
├── lib/
│   ├── db/
│   │   ├── client.ts                 # better-sqlite3 singleton
│   │   ├── migrations/               # SQL migration files
│   │   └── queries/                  # Typed query helpers per table
│   ├── playwright/
│   │   ├── crawler.ts                # Multi-page site crawler
│   │   └── screenshot.ts             # Full-page screenshot capture
│   ├── llm/
│   │   ├── client.ts                 # Vercel AI SDK wrapper + provider routing
│   │   ├── prompts/
│   │   │   ├── enrich.ts             # Enrichment extraction prompt
│   │   │   ├── score.ts              # Fit scoring prompt
│   │   │   ├── email.ts              # Cold email generation prompt
│   │   │   └── handoff.ts            # Handoff email prompt
│   │   └── types.ts                  # Typed LLM response schemas
│   ├── google-maps/
│   │   └── places.ts                 # Text Search + Place Details API wrapper
│   ├── email/
│   │   ├── smtp.ts                   # Nodemailer send wrapper
│   │   └── imap.ts                   # imapflow reply polling
│   └── config.ts                     # Load + validate SQLite-backed settings
├── components/
│   ├── leads/
│   │   ├── LeadsTable.tsx
│   │   ├── LeadDetail.tsx
│   │   └── ScoreBadge.tsx
│   ├── outreach/
│   │   ├── EmailPreview.tsx
│   │   └── HandoffPanel.tsx
│   ├── dashboard/
│   │   └── PipelineFunnel.tsx
│   └── ui/                           # shadcn/ui re-exports
├── trawl.db                          # SQLite database (gitignored)
└── README.md
```

---

## 4. Database Schema

All migrations live in `lib/db/migrations/` and run on startup via a simple version table.

### 4.1 `companies`

Your own company profile — populated once by pointing Trawl at your website.

```sql
CREATE TABLE companies (
  id                INTEGER PRIMARY KEY,
  name              TEXT NOT NULL,
  website           TEXT NOT NULL,
  description       TEXT,                    -- LLM-generated summary
  services          TEXT,                    -- JSON: string[]
  industries_served TEXT,                    -- JSON: string[]
  geographies       TEXT,                    -- JSON: string[]
  differentiators   TEXT,                    -- JSON: string[]
  screenshots       TEXT,                    -- JSON: string[] (local file paths)
  raw_content       TEXT,                    -- full scraped text
  last_profiled_at  DATETIME,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 4.2 `leads`

One row per discovered business. Central table — all other tables reference this.

```sql
CREATE TABLE leads (
  id                  INTEGER PRIMARY KEY,
  google_place_id     TEXT UNIQUE NOT NULL,  -- deduplication key
  name                TEXT NOT NULL,
  address             TEXT,
  city                TEXT,
  province            TEXT,
  phone               TEXT,
  website             TEXT,
  google_rating       REAL,
  google_review_count INTEGER,
  categories          TEXT,                  -- JSON: string[] (Google Maps categories)
  status              TEXT NOT NULL DEFAULT 'discovered',
                      -- discovered | enriched | scored | contacted | replied | handed_off | disqualified
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_city ON leads(city);
```

### 4.3 `lead_enrichments`

Playwright + LLM enrichment results per lead.

```sql
CREATE TABLE lead_enrichments (
  id                       INTEGER PRIMARY KEY,
  lead_id                  INTEGER NOT NULL REFERENCES leads(id),
  website_summary          TEXT,             -- LLM one-paragraph summary
  industry                 TEXT,             -- detected primary industry
  company_size             TEXT,             -- estimated band: micro/small/mid/large
  services_needed          TEXT,             -- JSON: string[] inferred procurement needs
  decision_maker_signals   TEXT,             -- job titles, org hints from site
  pain_points              TEXT,             -- LLM-inferred pain points
  tech_stack               TEXT,             -- JSON: string[] (detected from job postings etc.)
  social_links             TEXT,             -- JSON: { linkedin, facebook, ... }
  screenshots              TEXT,             -- JSON: string[] (local paths)
  raw_content              TEXT,             -- full scraped text
  enriched_at              DATETIME,
  model_used               TEXT
);
```

### 4.4 `lead_scores`

LLM fit scoring results.

```sql
CREATE TABLE lead_scores (
  id                   INTEGER PRIMARY KEY,
  lead_id              INTEGER NOT NULL REFERENCES leads(id),
  fit_score            INTEGER NOT NULL,     -- 0–100
  fit_tier             TEXT NOT NULL,        -- hot | warm | cold
  reasoning            TEXT,                -- LLM narrative
  strengths            TEXT,                -- JSON: string[]
  risks                TEXT,                -- JSON: string[]
  recommended_angle    TEXT,                -- suggested outreach hook
  scored_at            DATETIME,
  model_used           TEXT
);
```

### 4.5 `outreach_emails`

Generated and sent cold emails.

```sql
CREATE TABLE outreach_emails (
  id           INTEGER PRIMARY KEY,
  lead_id      INTEGER NOT NULL REFERENCES leads(id),
  to_email     TEXT,
  to_name      TEXT,
  subject      TEXT,
  body_html    TEXT,
  body_text    TEXT,
  status       TEXT NOT NULL DEFAULT 'draft',
               -- draft | sent | replied | bounced
  sent_at      DATETIME,
  replied_at   DATETIME,
  thread_id    TEXT,                         -- email Message-ID for IMAP threading
  model_used   TEXT,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 4.6 `conversations`

Inbound replies and AI/human response threads.

```sql
CREATE TABLE conversations (
  id               INTEGER PRIMARY KEY,
  lead_id          INTEGER NOT NULL REFERENCES leads(id),
  email_id         INTEGER REFERENCES outreach_emails(id),
  direction        TEXT NOT NULL,            -- inbound | outbound
  sender           TEXT,
  body             TEXT,
  is_ai_response   INTEGER DEFAULT 0,        -- 0 | 1
  handoff_tag      TEXT,                     -- null | 'sales' | 'pm' etc.
  handoff_to_email TEXT,                     -- human email CC'd on handoff
  received_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 4.7 `search_jobs`

Log of all discovery runs.

```sql
CREATE TABLE search_jobs (
  id            INTEGER PRIMARY KEY,
  query         TEXT NOT NULL,
  location      TEXT NOT NULL,
  radius_km     INTEGER,
  results_count INTEGER DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending',
               -- pending | running | complete | failed
  error         TEXT,
  started_at    DATETIME,
  completed_at  DATETIME,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 4.8 `settings`

Key-value store for runtime config and app-managed secrets.

```sql
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. Feature Modules

### 5.1 Discovery — Find Businesses

**What it does:** User enters a keyword (e.g. `"food processing plant"`, `"steel fabricator"`, `"pulp mill"`), picks a radius, and selects one or more cities. Trawl calls Google Maps Places API, pages through results, and upserts into `leads` using `google_place_id` as the dedup key.

**Implementation notes:**
- `lib/google-maps/places.ts` — wraps Text Search (`POST /v1/places:searchText`) and Place Details (`GET /v1/places/{id}`)
- Pagination via `nextPageToken` until exhausted or `max_results` hit
- Place Details call fetches: `displayName`, `formattedAddress`, `nationalPhoneNumber`, `websiteUri`, `rating`, `userRatingCount`, `types`
- Upsert on `google_place_id` — safe to re-run, updates mutable fields (rating, phone)
- `search_jobs` row created before run, updated to `complete`/`failed` on finish
- UI shows: new leads found, duplicates skipped, failed lookups

**API route:** `POST /api/discover`
```typescript
body: {
  query: string
  location: string       // e.g. "Simcoe, Ontario"
  radius_km: number      // 10 | 25 | 50 | 100
  max_results?: number   // default 100
}
```

---

### 5.2 Company Profile — Who You Are

**What it does:** User enters their website URL, clicks "Profile My Company". Trawl runs a Playwright crawl across home, about, services, and contact pages — captures full text and screenshots — then sends content to an LLM to extract a structured company profile. Profile anchors all lead scoring.

**Implementation notes:**
- `lib/playwright/crawler.ts` — BFS crawl starting at root, follows internal links, max `N` pages (configurable, default 8)
- Pages to prioritise: `/`, `/about`, `/services`, `/what-we-do`, `/industries`, `/contact`
- `lib/playwright/screenshot.ts` — full-page PNG saved to `./data/screenshots/company/`
- LLM prompt returns JSON: `{ name, description, services[], industries_served[], geographies[], differentiators[] }`
- All fields editable in UI before saving — manual override always wins
- Re-profile anytime without losing lead data

**API route:** `POST /api/profile`
```typescript
body: { website: string }
```

---

### 5.3 Enrichment — Know Your Leads

**What it does:** For each lead, visits their website with Playwright, extracts all visible text, captures screenshots, and runs an LLM enrichment prompt to build an intelligence profile.

**Implementation notes:**
- Playwright with realistic user-agent, JS enabled, waits for `networkidle`
- Full-page screenshots saved to `./data/screenshots/leads/{lead_id}/`
- Crawl up to 4 pages per lead (home + any linked service/about pages found)
- Fallback when no website: enrich from Google Maps categories + name using LLM inference
- Concurrency: configurable parallel Playwright instances (default 2)
- Retry on failure: 2 retries with 5s backoff, then mark `enrichment_failed`
- Rate limiting: 2s minimum between requests to same domain

**Enrichment LLM output schema:**
```typescript
{
  website_summary: string           // 2–3 sentence company summary
  industry: string                  // primary industry label
  company_size: 'micro' | 'small' | 'mid' | 'large'
  services_needed: string[]         // services they likely procure externally
  decision_maker_signals: string    // e.g. "Engineering Manager role posted, VP Operations named on site"
  pain_points: string               // inferred operational challenges
  tech_stack: string[]              // detected from job postings, footer badges, etc.
  social_links: Record<string, string>
}
```

**API routes:**
- `POST /api/enrich/:id` — enrich single lead
- `POST /api/enrich/batch` — enqueue all leads with status `discovered`

---

### 5.4 Scoring — Find the Best Fit

**What it does:** With your company profile and a lead's enrichment data in hand, asks the LLM to evaluate fit 0–100, tier the result (hot/warm/cold), and produce a reasoning block with a recommended outreach angle.

**Implementation notes:**
- System prompt includes full company profile as context
- User message includes lead enrichment JSON
- Temperature: 0.2 (low — deterministic scoring)
- Scores auto-tier: Hot ≥ 70, Warm 40–69, Cold < 40 (thresholds configurable in settings)
- Bulk scoring: process all `enriched` leads in order of `google_rating DESC` (higher-rated businesses first)
- Re-score on demand after updating company profile

**Scoring LLM output schema:**
```typescript
{
  fit_score: number           // 0–100
  fit_tier: 'hot' | 'warm' | 'cold'
  reasoning: string           // 2–4 sentence explanation
  strengths: string[]         // why this is a good match
  risks: string[]             // potential objections or mismatches
  recommended_angle: string   // specific hook: e.g. "Their recent plant expansion suggests active capex"
}
```

**API routes:**
- `POST /api/score/:id`
- `POST /api/score/batch`

---

### 5.5 Outreach — Send Personalised Emails

**What it does:** Generates a unique cold email per lead anchored to the scoring `recommended_angle`, previews in UI for review, then sends via SMTP. Tracks sent status and `thread_id` for reply matching.

**Implementation notes:**
- Email gen prompt receives: company profile, lead enrichment, fit score, recommended_angle
- Generates 3 subject line variants — user selects one in preview
- Output: `{ subject, body_html, body_text }`
- Preview editor: full HTML preview with edit-in-place before send
- Send via Nodemailer: `from` = configured sender, `to` = lead email, `messageId` stored as `thread_id`
- Daily send cap enforced in `POST /api/email/send/batch` — rejects once cap hit, resets midnight
- Send delay: configurable minimum seconds between sends (default 45s)
- Bulk send drains queue in fit_score DESC order

**API routes:**
- `POST /api/email/generate/:id`
- `POST /api/email/send/:id`
- `POST /api/email/send/batch`

---

### 5.6 Reply Handling & AI Handoff

**What it does:** Polls inbox via IMAP for replies to outreach emails. On reply detection, flags lead as `replied`, generates an AI bridge email that acknowledges the reply, introduces a named human contact, and CC's them — from that point the human owns the thread.

**Implementation notes:**
- `lib/email/imap.ts` — polls on configurable interval (default every 15 min, triggered by cron or manual button)
- Matching: check `In-Reply-To` / `References` headers against stored `thread_id` values
- On match: create `conversations` row (direction: `inbound`), update lead status to `replied`
- Handoff routing: look up `handoff_rules` in settings, match by lead industry → `handoff_tag` → `handoff_contact`
- AI bridge email prompt: receives original outreach, reply text, lead profile, handoff contact details
- Bridge email structure: acknowledge reply → confirm interest → introduce human by name/title → "they'll be in touch shortly"
- Send bridge email with human CC'd (`cc: handoff_contact.email`)
- Store bridge email in `conversations` (direction: `outbound`, `is_ai_response: 1`, `handoff_tag` set)
- Manual override: skip AI bridge, write handoff email manually in UI

**Handoff routing config (stored in settings as JSON):**
```json
[
  { "match_industry": ["manufacturing", "industrial", "food processing"], "tag": "pm" },
  { "match_industry": ["construction", "infrastructure"], "tag": "sales" },
  { "default": true, "tag": "sales" }
]
```

**Handoff contacts config:**
```json
[
  {
    "tag": "sales",
    "name": "Jane Smith",
    "title": "Business Development Manager",
    "email": "jane@company.com",
    "phone": "519-555-0101"
  },
  {
    "tag": "pm",
    "name": "Mike Johnson",
    "title": "Project Manager",
    "email": "mike@company.com",
    "phone": "519-555-0102"
  }
]
```

---

## 6. UI / Screen Map

### Navigation (sidebar)

| Route | Screen |
|---|---|
| `/` | Dashboard |
| `/discover` | Discovery — run searches |
| `/leads` | Leads table |
| `/leads/:id` | Lead detail |
| `/outreach` | Email draft queue + send history |
| `/inbox` | Reply tracker + conversation threads |
| `/settings` | Config: company, SMTP, API keys, handoff contacts |

---

### Dashboard

- Pipeline funnel: Discovered → Enriched → Scored → Contacted → Replied → Handed Off (count per stage)
- Hot leads count (score ≥ 70) prominently displayed
- Recent activity feed (last 20 events across all leads)
- Today's sends vs. daily cap — progress bar
- Quick actions: Run Search, Enrich Pending, Score Pending, Review Drafts

---

### Leads Table

- Columns: Name, City, Industry, Score, Tier badge, Status, Website, Last Activity
- Filter bar: tier, status, city, industry, has-website toggle
- Sort: score (default desc), name, city, created date
- Bulk select + bulk actions: Enrich Selected, Score Selected, Generate Emails, Disqualify
- Row click → Lead Detail
- Export to CSV button

---

### Lead Detail

Tabs:

| Tab | Content |
|---|---|
| Overview | Google data, contact info, website link, map embed, categories |
| Enrichment | LLM summary, industry, size, pain points, screenshot gallery, raw content toggle |
| Score | Fit score dial, tier badge, reasoning narrative, strengths/risks lists, recommended angle |
| Emails | List of outreach emails; click to view HTML; resend option |
| Conversations | Threaded reply/response view; handoff status; who was CC'd |

---

### Settings

Sections:

- **Company Profile** — website URL, profile run button, editable extracted fields
- **Provider Auth** — OpenAI + Anthropic API keys or OAuth, plus dynamic model loading
- **SMTP / IMAP** — host, port, user, password
- **Outreach Config** — daily send cap, send delay seconds, score thresholds
- **LLM Config** — selected provider + selected model
- **Handoff Contacts** — add/edit/delete named contacts
- **Handoff Rules** — industry-to-tag routing rules

---

## 7. Configuration & Settings

### 7.1 Runtime Settings (in SQLite, editable via UI)

| Key | Default | Description |
|---|---|---|
| `google_maps_api_key` | `""` | Google Maps Places API key |
| `llm_provider` | `openai` | Selected LLM provider |
| `llm_model` | `""` | Selected provider model |
| `daily_send_cap` | `50` | Max emails sent per calendar day |
| `send_delay_seconds` | `45` | Minimum delay between outbound sends |
| `enrichment_concurrency` | `2` | Parallel Playwright instances |
| `imap_poll_interval_minutes` | `15` | Inbox check frequency |
| `hot_score_threshold` | `70` | Minimum score for Hot tier |
| `warm_score_threshold` | `40` | Minimum score for Warm tier |
| `max_crawl_pages` | `8` | Max pages per domain in Playwright crawl |
| `screenshots_dir` | `./data/screenshots` | Local path for screenshot storage |
| `smtp_*` / `imap_*` | provider defaults | Mail credentials and connection settings |
| `sender_name` / `sender_title` | app defaults | Email sender identity |
| `handoff_contacts` / `handoff_rules` | `[]` | JSON-encoded routing settings |

### 7.2 Provider Credentials (in `provider_settings`)

- OpenAI and Anthropic support `api_key` and `oauth` auth modes
- OAuth client configuration, access tokens, refresh tokens, and selected base URLs are stored in SQLite
- Available models are fetched live from the selected provider API

---

## 8. Phased Build Plan

### Phase 1 — Foundation

| Module | Description | Notes |
|---|---|---|
| Scaffold | Next.js 15 + pnpm + Tailwind + shadcn/ui, basic layout + sidebar | |
| Database | `better-sqlite3` client, migration runner, all schema migrations | Run on app startup |
| Settings screen | SQLite-backed settings CRUD, provider auth, live model loading | |
| Discovery | Google Maps search, lead upsert, `search_jobs` log, basic leads table | Core value delivery |

### Phase 2 — Intelligence

| Module | Description | Notes |
|---|---|---|
| Company Profile | Playwright crawl, LLM extraction, editable profile UI | Required before scoring |
| Enrichment | Per-lead Playwright + LLM, screenshot gallery, batch queue | |
| Scoring | LLM fit scoring, tier assignment, bulk score, score display on leads table | |

### Phase 3 — Outreach

| Module | Description | Notes |
|---|---|---|
| Email Generation | AI email + 3 subject variants, HTML preview, edit before send | |
| Email Send | Nodemailer SMTP, daily cap, send delay, `thread_id` storage | |
| Dashboard | Pipeline funnel, activity feed, quick action buttons | |

### Phase 4 — Reply Loop

| Module | Description | Notes |
|---|---|---|
| IMAP Reply Polling | `imapflow` poll, `In-Reply-To` matching, conversation log | |
| AI Handoff | Bridge email generation, routing rules, CC logic, conversation thread UI | |
| Batch Actions | Overnight batch: enrich all, score all, drain send queue with cap | |

### Phase 5 — Polish

| Module | Description | Notes |
|---|---|---|
| Lead Detail | Full detail view, all tabs, screenshot gallery | |
| CSV Export | Export leads table with all enrichment + score fields | |
| Re-crawl | Re-enrich stale leads, re-score after profile update | |
| Error handling | Retry UI, failure logs, per-lead error display | |

---

## 9. Email Outreach Strategy

### 9.1 Cold Email Structure

AI-generated emails follow a proven 4-line B2B cold email structure:

```
Line 1 — Credibility hook:    reference something specific about their business
Line 2 — Relevance bridge:    connect their situation to a service you provide  
Line 3 — Proof or outcome:    one concrete result or client type you've served
Line 4 — Soft CTA:            low-friction ask — "open to a quick call?"

Signature: sender name, title, company, phone, website
```

### 9.2 Handoff Email Structure

When a reply comes in, the AI bridge email:

1. Acknowledges their reply specifically (mirror their language)
2. Confirms genuine interest and sets a positive tone
3. Introduces the human by name, title, and one sentence about their expertise
4. States that `[Human]` will be in touch shortly — CC's them directly
5. Total length: 4–6 sentences

### 9.3 Deliverability Best Practices

- Send from a real mailbox on your company domain (not `noreply@`)
- Daily send cap ≤ 50 cold emails per address
- 45-second minimum delay between sends
- Plain-text fallback always included alongside HTML
- No tracking pixels in v1 — prioritise inbox placement
- SPF, DKIM, DMARC records should be verified on your sending domain before launch

---

## 10. Estimated Operating Costs

All costs per-lead, approximate. Trawl runs at minimal cost — locally hosted, pay-per-use APIs only.

| Item | Approx. Cost |
|---|---|
| Google Maps Place Details | ~$0.017 per lead |
| LLM Enrichment (provider/model selected in settings) | ~$0.003–0.008 per lead |
| LLM Scoring | ~$0.002–0.004 per lead |
| LLM Email Generation | ~$0.002–0.004 per email |
| LLM Handoff Email | ~$0.002 per reply |
| **Total per lead (end-to-end)** | **~$0.03–0.05** |
| 500 leads fully processed | ~$15–25 all-in |
| SMTP sending | $0 — your own mail server |
| Hosting | $0 — runs locally |

---

## 11. Future Considerations

- **LinkedIn enrichment** — company page scraping for headcount, employee titles
- **Contact finder** — scan website, LinkedIn, Hunter.io for decision-maker emails
- **Multi-sender rotation** — distribute sends across multiple inboxes to scale volume
- **Follow-up sequences** — automated 2nd and 3rd touch if no reply after N days
- **Open/click tracking** — webhook receiver for email pixel events
- **CRM export** — push contacted/replied leads to HubSpot or Pipedrive
- **Multi-company mode** — run Trawl for multiple businesses from one install
- **Persona targeting** — filter/score by job title when contact data is available
- **Custom scoring weights** — owner adjusts importance of industry, geography, size signals
- **Slack notifications** — ping a channel when a hot lead replies

---

## Appendix A — LLM Prompt Design

All LLM calls use structured JSON output. Temperature and schema notes per prompt:

### A.1 Enrichment Prompt

```
System:
You are a B2B sales intelligence analyst. Given the scraped text content of a company website,
extract a structured intelligence profile. Respond ONLY with valid JSON matching this schema.
Do not include markdown fences or any text outside the JSON object.

Schema: { website_summary, industry, company_size, services_needed[], 
          decision_maker_signals, pain_points, tech_stack[], social_links{} }

User:
Company name: {name}
Website: {website}
Scraped content:
{raw_content}
```

Temperature: `0.3` | Max tokens: `1000`

---

### A.2 Scoring Prompt

```
System:
You are a B2B sales fit analyst. You will be given a supplier's company profile and a potential
customer's intelligence profile. Score the fit between them 0–100 and explain your reasoning.
Respond ONLY with valid JSON. Do not include markdown fences.

Supplier profile:
{company_profile_json}

Schema: { fit_score, fit_tier, reasoning, strengths[], risks[], recommended_angle }

User:
Potential customer profile:
{lead_enrichment_json}
```

Temperature: `0.2` | Max tokens: `800`

---

### A.3 Email Generation Prompt

```
System:
You are an expert B2B cold email copywriter. Write concise, specific, non-spammy cold emails
that feel personally researched — not templated. Never use hollow phrases like "I hope this
finds you well". Respond ONLY with valid JSON.

Supplier context:
{company_profile_json}

Schema: { subject_variants: string[3], body_html: string, body_text: string }

User:
Lead profile: {lead_enrichment_json}
Fit score: {fit_score}
Recommended angle: {recommended_angle}
Sender name: {sender_name}
Sender title: {sender_title}
```

Temperature: `0.7` | Max tokens: `1200`

---

### A.4 Handoff Email Prompt

```
System:
You are writing a warm handoff email on behalf of a B2B company. The AI sent a cold email,
the prospect replied, and now you are bridging to a human team member. Keep it to 4–6 sentences.
Professional, warm, no fluff. Respond ONLY with valid JSON.

Schema: { subject: string, body_html: string, body_text: string }

User:
Original outreach email: {original_email}
Prospect's reply: {reply_text}
Human contact: {handoff_contact_json}
Supplier context: {company_profile_json}
```

Temperature: `0.5` | Max tokens: `600`

---

*Trawl — Built for Rassaun Services Inc., Simcoe, Ontario. Generic B2B — adapt for any service business.*
