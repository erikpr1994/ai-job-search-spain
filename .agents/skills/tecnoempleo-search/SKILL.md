---
name: tecnoempleo-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for tech / IT jobs in Spain,
  find Spanish job listings, or look up a specific job posting on Tecnoempleo
  (tecnoempleo.com), Spain's leading technology job board — even if they don't
  mention tecnoempleo explicitly. Invoke for open positions, vacancies, and
  hiring for software, data, DevOps, QA, IT, and engineering roles across Spain
  and Spanish provinces (Madrid, Barcelona, Valencia, Sevilla, Málaga, etc.) or
  remote. Trigger phrases (English and Spanish): find a job in Spain, tech jobs
  Spain, IT jobs Spain, developer jobs Madrid, programador, desarrollador,
  ofertas de empleo, ofertas de trabajo, trabajo, empleo IT, búsqueda de empleo,
  buscar trabajo, ofertas informática, trabajo en remoto España,
  "hay ofertas de X en <provincia>", look up this Tecnoempleo posting.
context: fork
allowed-tools: Bash(bun run skills/tecnoempleo-search/cli/src/cli.ts *)
---

# Tecnoempleo Search Skill

Search live tech/IT job listings from **Tecnoempleo.com**, Spain's leading
technology job board (market: **Spain**, language: **Spanish**). No
authentication, no API key, and **zero runtime dependencies** — it runs with
just `bun`.

## ⚠️ Personal use only

Tecnoempleo's `robots.txt` **explicitly disallows Anthropic / Claude crawlers**
(`ClaudeBot`, `anthropic-ai`, `Claude-Web`, `Claude-SearchBot`, `GPTBot`, and
others are given `Disallow: /`). This CLI fetches Tecnoempleo's public pages
with a normal browser User-Agent, but automated access is against the spirit of
that policy and likely their Terms of Service.

**Use this strictly for your own manual, low-volume job search.** Keep request
volume minimal, do not run it at scale, do not use it commercially or for bulk
data collection, and run it on your own responsibility. If you are not the human
candidate doing your own job hunt, do not use this skill.

(The listings themselves are public — no login is required to read search
results or job details — so the tool works; the restriction is a matter of
policy and courtesy, not a technical wall.)

## When to use this skill

- Search for tech/IT job openings in Spain by keyword, skill, or technology
- Narrow by Spanish province (e.g. Madrid, Barcelona) or find remote roles
- Filter by recency (posted in the last day / 7 / 14 / 30 days)
- Get the full description, requirements, and metadata of a specific listing

## Commands

### Search job listings

```bash
bun run skills/tecnoempleo-search/cli/src/cli.ts search --query "<keywords>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — **required.** Keywords: job title, skill, or
  technology (e.g. `"React"`, `"Java"`, `"DevOps"`, `"data engineer"`).
- `--location <text>` / `-l <text>` — Spanish **province** name (e.g. `"Madrid"`,
  `"Barcelona"`, `"Valencia"`, `"Málaga"`) or a raw numeric `pr` code. Optional.
  Accent- and case-insensitive; common synonyms (Vizcaya→Bizkaia, Gerona→Girona)
  are accepted. For remote-only roles, just search without a location.
- `--jobage <days>` — posted within N days. `1` uses the site's native
  last-24h filter; `7` / `14` / `30` are applied client-side from each card's
  posting date. Omit for all postings.
- `--page <n>` — page number (1-indexed, 30 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run skills/tecnoempleo-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the reference from `search` results (e.g. `d97516df323a73b22543`, with or
without the `rf-` prefix). You may also pass a full Tecnoempleo job URL. Returns
the full description, location, modality, posting date, employment type, contract
type, required experience, function, technologies, and (when present) salary.

## Usage examples

```bash
# React roles anywhere in Spain, quick table
bun run skills/tecnoempleo-search/cli/src/cli.ts search -q "React" --limit 10 --format table

# Java roles in Barcelona posted in the last 7 days
bun run skills/tecnoempleo-search/cli/src/cli.ts search -q "Java" -l "Barcelona" --jobage 7 --format table

# DevOps roles in Madrid, page 2
bun run skills/tecnoempleo-search/cli/src/cli.ts search -q "DevOps" -l "Madrid" --page 2 --format json

# Full details for a specific job (id from search)
bun run skills/tecnoempleo-search/cli/src/cli.ts detail d97516df323a73b22543 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

The search JSON shape is `{ "meta": { "count", "total", "page" }, "results": [...] }`;
each result always includes `id, title, company, companyUrl, location, modality,
date, url` (missing values are `null`, never omitted).

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and
the process exits with code `1`.

## Notes

- Data is from Tecnoempleo's public pages — no credentials required.
- Page size is fixed at 30 results per page.
- Location filtering uses province codes; pass a province **name** and the CLI
  maps it. To find remote roles, omit `--location`.
- The site only offers a native "last 24h" recency filter; `--jobage 7/14/30` is
  applied client-side, so it filters within the fetched page rather than
  server-side. Combine with `--page` to reach older postings.
- Tecnoempleo may rate-limit; the CLI retries 429/5xx with exponential backoff.
  Keep volume low (see the personal-use note above).
- Job IDs are hex references (e.g. `d97516df323a73b22543`) — pass them as-is (or
  with the `rf-` prefix) to `detail`.
