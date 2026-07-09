# tecnoempleo-cli

A self-contained CLI for searching tech/IT jobs on **Tecnoempleo.com** (Spain).
No authentication, no API key, and **zero runtime dependencies** — plain `bun` +
`fetch` + regex parsing. Only dev-time type packages are listed in
`package.json`.

> **Personal use only.** Tecnoempleo's `robots.txt` explicitly disallows
> Anthropic/Claude crawlers. Use this strictly for your own manual, low-volume
> job search. See `../SKILL.md` and `../url-reference.md` for details.

## Install

```bash
bun install
```

## Commands

```bash
# Search (‑‑query is required)
bun run src/cli.ts search -q "React" [--location "Madrid"] [--jobage 7] [--page 1] [--limit 10] [--format json|table|plain]

# Detail by id (with or without rf- prefix) or full URL
bun run src/cli.ts detail <id|url> [--format json|plain]
```

- **Search flags:** `--query`/`-q` (required), `--location`/`-l` (Spanish
  province name or `pr` code), `--jobage <days>`, `--page <n>` (1-indexed),
  `--limit`/`-n <n>`, `--format`.
- **JSON shape:** `{ "meta": { "count", "total", "page" }, "results": [...] }`.
  Each result always includes `id, title, company, companyUrl, location,
  modality, date, url` (missing → `null`).
- **Errors** go to **stderr** as `{ "error", "code" }` with exit code `1`, never
  to stdout.

## Design notes

- **Zero runtime deps.** The markup is shallow and stable; a full DOM parser is
  unnecessary and `node-html-parser` has known nesting bugs on cards with
  unclosed tags inside `onclick` wrappers. Parsing is done with scoped,
  per-card regex so one malformed card can't break the rest.
- **Detail parsing** prefers the page's `schema.org/JobPosting` JSON-LD block
  (authoritative for company, date, employment type, location) and falls back to
  the human-readable info panel and `itemprop="description"` div.
- **Location** is resolved from a built-in province name→`pr` code table
  (accent/case-insensitive, with common synonyms).
- **Recency:** the site only exposes a native "last 24h" filter (`ult_24h=1`);
  `--jobage 7/14/30` is applied client-side from each card's `DD/MM/YYYY` date.

## Scripts

```bash
bun run typecheck   # tsc --noEmit
bun run test        # bun test --timeout 30000  (includes live smoke tests)
```

The test suite has offline parsing/validation tests plus a few **live** smoke
tests that hit tecnoempleo.com (kept few and low-volume).
