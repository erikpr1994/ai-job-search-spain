---
name: joppy-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for tech jobs in Spain on
  Joppy (joppy.me), the Barcelona-based tech hiring platform — even if they don't
  mention Joppy explicitly. Best for startup, scale-up and tech-consultancy roles
  in Barcelona, Madrid, Valencia, Málaga and remote-in-Spain: software
  engineering, frontend, backend, fullstack, mobile, data, AI, DevOps, QA,
  security, and product. Joppy postings are unusually rich — most publish a
  salary range and a structured skill list — so this is the skill to reach for
  when the user asks about pay. Trigger phrases (English and Spanish): tech jobs
  Spain, jobs in Barcelona, startup jobs Spain, developer jobs Madrid, ofertas de
  empleo, ofertas de trabajo, empleo tech, trabajo de programador, desarrollador,
  búsqueda de trabajo, buscar empleo, trabajo en remoto España, sueldo/salario de
  una oferta, "cuánto pagan", look up this Joppy posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/joppy-search/cli/src/cli.ts *)
---

# Joppy Search Skill

Search live tech job listings from **Joppy** (joppy.me), a Barcelona-based tech
hiring platform (market: **Spain**; postings in **Spanish and English**). No
authentication, no API key, and **zero runtime dependencies** — it runs with just
`bun`.

## How this portal differs

Joppy is a swipe/match app, and its candidate-facing search sits behind a login.
This skill therefore reads the **public company directory** instead, which is
fully open (`robots.txt` is `Allow: /`) and, unusually, exposes complete job
records as structured JSON rather than scraped markup.

Two practical consequences:

- **The corpus is small but high-quality.** Roughly **80 open postings across
  ~37 companies** — far fewer than InfoJobs or LinkedIn, but most carry a
  **published salary range**, a **structured skill list** (with must-haves
  flagged), required **language levels**, and visa/relocation flags. Treat Joppy
  as a high-signal supplement, not a volume source.
- **Search is client-side.** There is no keyword endpoint, so the CLI scans the
  whole public corpus and filters locally. A cold scan takes ~3 seconds and ~38
  requests; the result is cached for 30 minutes, so repeat searches are instant.
  Prefer the cache over repeated `--refresh` runs — keep volume low and polite.

## When to use this skill

- Search Spanish tech openings by keyword, skill, technology, or company
- Filter by city (Barcelona, Madrid, Valencia, Málaga…) or work modality
- Find roles above a salary threshold — Joppy publishes ranges most boards hide
- Get the full description, skills, languages, and hiring process for a listing

## Commands

### Search job listings

```bash
bun run .agents/skills/joppy-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keywords: title, skill, technology, or company
  (e.g. `"React"`, `"backend Java"`, `"machine learning"`). **Optional** — omit it
  to list the entire public corpus. All terms must match; title and skill hits
  rank above incidental mentions in the body text.
- `--location <text>` / `-l <text>` — matches the posting's location text
  (e.g. `"Barcelona"`, `"Madrid"`, `"Málaga"`). Accent- and case-insensitive.
- `--remote <mode>` — `remote`, `hybrid`, or `onsite`.
- `--jobage <days>` — only postings updated within N days. Omit for all.
- `--min-salary <eur>` — only postings whose published range reaches this figure.
  Postings with a private salary are excluded by this filter.
- `--page <n>` — page number (1-indexed, 20 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.
- `--refresh` — re-scan the portal, ignoring the 30-minute cache.

### Fetch full job detail

```bash
bun run .agents/skills/joppy-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the job uid from `search`. The **8-character short id** printed by
`--format table` works too (the CLI resolves it, and reports an error rather than
guessing if a prefix is ambiguous). A full `joppy.me/companies/...` URL or an
`app.joppy.me/job/...` apply URL is also accepted. Returns the full description,
skills (with must-haves), specialities, language requirements, salary,
visa/relocation flags, hiring process, and the apply link.

## Usage examples

```bash
# React roles anywhere in Spain
bun run .agents/skills/joppy-search/cli/src/cli.ts search -q "React" --format table

# Backend Java roles in Madrid
bun run .agents/skills/joppy-search/cli/src/cli.ts search -q "backend Java" -l "Madrid" --format table

# Fully remote roles paying at least €50k
bun run .agents/skills/joppy-search/cli/src/cli.ts search --remote remote --min-salary 50000 --format table

# Everything posted or updated in the last two weeks
bun run .agents/skills/joppy-search/cli/src/cli.ts search --jobage 14 --format table

# Full details for a specific job (short id from the table)
bun run .agents/skills/joppy-search/cli/src/cli.ts detail fc32d0d8 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning (shows salary and modality) |
| `plain` | Reading a single job's full detail (`detail` command) |

The search JSON shape is
`{ "meta": { "count", "total", "page", "pages", "corpusSize", "cached", "scannedAt" }, "results": [...] }`;
each result always includes `id, title, company, companyUrl, location, modality,
date, salaryMin, salaryMax, skills, url` (missing values are `null`, never omitted).

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and
the process exits with code `1`.

## Notes

- Data comes from Joppy's public company directory — no credentials required, and
  `robots.txt` permits it.
- **`date` is the posting's `lastmod` from the sitemap**, i.e. when it was last
  updated, not strictly when it was first published. `--jobage` filters on that,
  so treat it as "recently touched" rather than "newly posted".
- Salary is `null` when the employer marked the range private; it is a real EUR
  gross-annual range otherwise.
- Job ids are UUIDs (e.g. `fc32d0d8-b322-48bc-8a5a-535052ba566c`). The `table`
  format prints the first 8 characters, which `detail` accepts directly.
- Applying happens in Joppy's app (`app.joppy.me`) and requires an account — the
  CLI surfaces the `applyUrl` but cannot apply for you.
- Joppy may rate-limit; the CLI retries 429/5xx with exponential backoff and
  skips any company page that fails rather than aborting the whole scan.
