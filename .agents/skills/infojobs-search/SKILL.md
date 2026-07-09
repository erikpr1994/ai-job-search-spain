---
name: infojobs-search
version: 1.0.0
description: >
  Search live job listings on InfoJobs (https://www.infojobs.net), the largest
  general job board in Spain (market: Spain, language: Spanish). Use this skill
  to find Spanish job openings, vacancies, and hiring across any sector or role
  (software, data, design, marketing, finance, legal, operations, etc.), or to
  look up a specific InfoJobs offer. Trigger phrases (EN): find a job in Spain,
  Spanish jobs, InfoJobs, jobs in Madrid/Barcelona/Valencia, search InfoJobs,
  look up this InfoJobs offer. Trigger phrases (ES): buscar trabajo, ofertas de
  empleo, empleo en España, buscar en InfoJobs, ofertas de trabajo, vacantes,
  ver esta oferta de InfoJobs.
context: fork
allowed-tools: Bash(bun run skills/infojobs-search/cli/src/cli.ts *)
---

# InfoJobs Search Skill

Search live job listings from **InfoJobs** (https://www.infojobs.net), Spain's
largest general job board. No authentication, no API key, and **zero runtime
dependencies** — it runs with just `bun`. Results are read from InfoJobs'
server-rendered public search pages, so the same skill works out of the box.

> Market: **Spain** · Language: **Spanish**. Listings, dates ("Hace 4d" = "4 days
> ago"), and offer text are in Spanish.

## ⚠️ Personal use only

This uses InfoJobs' public job pages; automated access is restricted by InfoJobs'
Terms of Service, so **keep volume low and don't use it commercially or for bulk
data collection.** Run it on your own responsibility.

## When to use this skill

- Search for job openings on InfoJobs by keyword (title, skill, or role)
- Filter by recency (posted in the last 24 hours / 7 / 15 days)
- Get the full description and details of a specific InfoJobs offer

## Commands

### Search job listings

```bash
bun run skills/infojobs-search/cli/src/cli.ts search -q "<keywords>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search (title, skill, role). Recommended.
- `--jobage <days>` — posted within N days. InfoJobs exposes three windows, so any
  value maps to the nearest bucket: `1` → 24h, `≤7` → 7 days, `≤15` → 15 days.
  Values above 15 (or omitted) return all postings.
- `--page <n>` — page number (1-indexed, ~5 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

> **Location:** InfoJobs filters by numeric internal province IDs that are not
> exposed on the public search page and cannot be mapped reliably from a place
> name, so this skill deliberately does **not** provide a `--location` flag rather
> than ship a wrong filter. Add a city/region term to `-q` (e.g. `-q "React Madrid"`)
> as a best-effort narrowing, or filter by the `location` field in the results.

### Fetch full offer detail

```bash
bun run skills/infojobs-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the offer id from `search` results (e.g. `5729505a1a431da38968e4bb91f095`).
You may pass the bare hex id, an `of-i<hex>` token, or a full InfoJobs offer URL.
Returns the title, company, location, header detail chips (modality, contract,
hours, salary…), and the full Spanish description.

## Usage examples

```bash
# React roles, human-readable table
bun run skills/infojobs-search/cli/src/cli.ts search -q "React" --format table

# Backend roles posted in the last 7 days, capped at 5
bun run skills/infojobs-search/cli/src/cli.ts search -q "desarrollador backend" --jobage 7 --limit 5 --format table

# Second page of results
bun run skills/infojobs-search/cli/src/cli.ts search -q "React" --page 2 --format table

# Full details for a specific offer
bun run skills/infojobs-search/cli/src/cli.ts detail of-i5729505a1a431da38968e4bb91f095 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single offer's full detail (`detail` command) |

The JSON shape is `{ "meta": { "count", "page" }, "results": [...] }`; each result
carries `id, title, company, companyUrl, location, modality, date, url` (missing
fields are `null`). All errors are written to **stderr** as
`{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from InfoJobs' public server-rendered search/offer pages — no credentials required.
- Page size is ~5 offers per page; use `--page` to paginate.
- Dates are relative Spanish strings as shown on the card (e.g. `Hace 4d`, `Hace 1h`).
- InfoJobs may rate-limit; the CLI retries 429/5xx with exponential backoff + jitter. Keep volume low (see ToS note above).
- Offer ids are lowercase hex (e.g. `5729505a1a431da38968e4bb91f095`) — pass them as-is (or as `of-i<hex>`) to `detail`.
