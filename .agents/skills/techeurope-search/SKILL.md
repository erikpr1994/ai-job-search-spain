---
name: techeurope-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs on {Tech: Europe}
  (jobs.techeurope.io), or look up a specific {Tech: Europe} job posting. It is a
  curated board of early-stage technical and research roles at European startups
  and AI labs. Trigger phrases: Tech Europe jobs, techeurope, European startup
  jobs, early-stage tech roles in Europe, look up this jobs.techeurope.io posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/techeurope-search/cli/src/cli.ts *)
---

# {Tech: Europe} Search Skill

Search curated early-stage technical and research roles across Europe on
[jobs.techeurope.io](https://jobs.techeurope.io). No authentication, no API key, and
**zero runtime dependencies** — it runs with just `bun`.

## Commands

### Search job listings

```bash
bun run .agents/skills/techeurope-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — every word must appear in the job slug, which holds the
  company, title and location (e.g. `"research engineer"`, `"mistral"`).
- `--location <text>` / `-l <text>` — a city or region word from the slug (e.g. `"berlin"`,
  `"london"`, `"remote"`, `"europe"`).
- `--limit <n>` / `-n <n>` — max results, newest first. Default `25`. Each result costs one
  page fetch.
- `--format json|table|plain` — default `json`. JSON `meta.matched` is the number of slugs
  that matched before the limit.

### Fetch full job detail

```bash
bun run .agents/skills/techeurope-search/cli/src/cli.ts detail <slug|url> [--format json|plain]
```

`slug` is the `id` from `search` results. A full `jobs.techeurope.io/jobs/...` URL also works.
Returns the board's summary of the role and the employer's apply link (`applyUrl`). Fetch the
`applyUrl` for the full posting text.

## Usage examples

```bash
# Engineering roles in London
bun run .agents/skills/techeurope-search/cli/src/cli.ts search -q "engineer" -l "london" --format table

# Full details for a specific job
bun run .agents/skills/techeurope-search/cli/src/cli.ts detail viktor-growth-analytics-engineer-europe-v1jro9 --format plain
```

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- The home page list is gated behind the board's newsletter, and robots.txt disallows `/api`.
  This skill reads only public pages: `sitemap.xml` and each job page's JobPosting JSON-LD.
- Matching is on the URL slug, so use plain words, not phrases with punctuation.
- The sitemap can still list postings that the employer has closed. Check the `applyUrl`.
