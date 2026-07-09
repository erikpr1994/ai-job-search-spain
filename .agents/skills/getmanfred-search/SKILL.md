---
name: getmanfred-search
version: 1.0.0
description: >
  Search live tech job listings on GetManfred (getmanfred.com), a curated
  Spanish / remote-in-Europe developer job board where every offer publishes a
  transparent salary range. Use whenever the user wants to find tech / software /
  data / product jobs in Spain (Madrid, Barcelona, Valencia, Sevilla, Málaga,
  Bilbao...) or remote in Europe, look up a specific GetManfred posting, or see
  offers with salary info. Trigger phrases (EN): find jobs, job search, tech jobs
  Spain, remote developer jobs, jobs with salary, GetManfred, Manfred, software
  jobs Madrid/Barcelona. Trigger phrases (ES): buscar trabajo, ofertas de empleo,
  empleo tecnológico, trabajo remoto, ofertas con salario, trabajo de programador,
  empleo en Madrid/Barcelona, GetManfred, Manfred.
context: fork
allowed-tools: Bash(bun run skills/getmanfred-search/cli/src/cli.ts *)
---

# GetManfred Search Skill

Search live tech job listings on **GetManfred** (https://www.getmanfred.com) — a
curated job board for **Spain and remote-in-Europe** developer roles where every
offer publishes a **transparent salary range**. No authentication, **zero runtime
dependencies** — runs just `bun`.

GetManfred is a Next.js SPA, but it is backed by a **public JSON API**, so this
skill queries that API directly (reliable, no HTML scraping). The API's list
endpoint returns every active offer at once, so `--query`, `--location`,
`--jobage`, `--page`, and `--limit` are all applied **client-side**.

## When to use this skill

- Find tech/software/data/product openings in Spain or remote-in-Europe
- Surface offers together with their salary range (a key differentiator here)
- Filter by recency (`--jobage`) or location, then read a full posting with `detail`

## Commands

### Search job listings

```bash
bun run skills/getmanfred-search/cli/src/cli.ts search [flags]
```

- `--query <text>` / `-q <text>` — keywords. Recommended. If the query names a
  known technology (e.g. `"React"`, `"Python"`, `"Kubernetes"`), it filters by the
  offer's **tech stack** (server-side); otherwise it matches the offer title,
  company, and highlight tags (client-side).
- `--location <text>` / `-l <text>` — city/country substring (`"Madrid"`,
  `"Barcelona"`, `"Valencia"`) or `"Remote"` for fully-remote offers.
- `--jobage <days>` — only offers updated within N days (client-side). Omit for all.
- `--page <n>` — 1-indexed page (25 results/page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

> **How query matching works:** GetManfred's offers-list payload does not carry
> the tech stack, so tech-name queries are resolved to GetManfred's numeric tech
> id and sent to the server-side `techs=<id>` filter. Non-tech queries (roles,
> company names) fall back to a client-side text match over title/company/
> highlights. Use `detail` to see an offer's full required stack.

### Fetch full job detail

```bash
bun run skills/getmanfred-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric offer id from `search` results (e.g. `8400`). You may also pass
a full `https://www.getmanfred.com/ofertas-empleo/<id>/<slug>` URL. Returns the full
description, salary, remote percentage, required tech stack, and spoken languages.

## Usage examples

```bash
# React roles, table view
bun run skills/getmanfred-search/cli/src/cli.ts search -q "React" --limit 10 --format table

# Backend roles in Madrid
bun run skills/getmanfred-search/cli/src/cli.ts search -q "backend" -l "Madrid" --format table

# Fully-remote data roles updated in the last 30 days
bun run skills/getmanfred-search/cli/src/cli.ts search -q "data" -l "Remote" --jobage 30 --format table

# Frontend roles in Barcelona, plain output
bun run skills/getmanfred-search/cli/src/cli.ts search -q "frontend" -l "Barcelona" --format plain

# Recently updated offers (any role), page 2
bun run skills/getmanfred-search/cli/src/cli.ts search --jobage 7 --page 2 --format table

# Full details for one offer
bun run skills/getmanfred-search/cli/src/cli.ts detail 8400 --format plain
```

## Output

Default `json` shape:

```json
{
  "meta": { "count": 5, "page": 1 },
  "results": [
    {
      "id": "8328",
      "title": "React Native Developer",
      "company": "Essentialist",
      "location": "Remote",
      "date": "2026-07-06T12:45:25.742Z",
      "url": "https://www.getmanfred.com/ofertas-empleo/8328/...",
      "salary": "60000 €",
      "remote": 100
    }
  ]
}
```

Every result carries at least `id`, `title`, `company`, `location`, `date`, `url`
(missing values are `null`, never omitted), plus GetManfred's `salary` and `remote`
fields. `table` and `plain` are human-readable renderings of the same data. Errors
are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code 1.

## Notes

- **Data source:** GetManfred's public JSON API (`/api/v2/public/offers`). No auth.
  See `url-reference.md` for endpoints, parameters, and field mappings.
- **Filters:** the list endpoint returns the whole active catalogue (~1600 offers,
  ~2 MB) with no server-side text query or pagination, so `--location`, `--jobage`,
  `--page`, and `--limit` are applied client-side. The one server-side filter is
  `techs=<id>`, used when `-q` resolves to a known technology; keep volume low.
- **Language:** offer content is Markdown in the original language (usually Spanish);
  the CLI strips Markdown for `plain`/`table` output.
- **Salary:** GetManfred publishes salary ranges; `0` values mean "unset" and are
  reported as `null`. Freelance offers report a daily fee rate instead.
- Offer ids are numeric (e.g. `8400`) — pass them straight to `detail`.
