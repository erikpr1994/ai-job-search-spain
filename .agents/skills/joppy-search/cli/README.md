# joppy-cli

Search tech job listings from **Joppy** (joppy.me), a Barcelona-based tech hiring
platform. Market: Spain.

**Zero runtime dependencies** — plain `bun` + `fetch`. `bun install` only pulls
dev-time TypeScript types.

## Install

```bash
cd .agents/skills/joppy-search/cli && bun install
```

(Optional — the CLI runs without installing anything; `bun install` only enables
`bun run typecheck`.)

## Usage

```bash
bun run src/cli.ts search -q "React" --format table
bun run src/cli.ts search -q "backend Java" -l "Madrid" --format table
bun run src/cli.ts search --remote remote --min-salary 50000 --format table
bun run src/cli.ts detail fc32d0d8 --format plain
```

Run `bun run src/cli.ts --help` for the full flag reference.

## How it works

Joppy has no public keyword-search endpoint — its candidate-facing search is
behind the app login. The public surface is the company directory, and it is
richer than most scraped boards:

1. `sitemap.directory.xml` enumerates every open job (`/companies/<slug>/<uid>`)
   with a `lastmod` timestamp.
2. Each company page embeds the **complete** job objects — description, skills,
   salary, languages, modality — in its Next.js `__NEXT_DATA__` JSON blob.

So `search` scans that corpus (~80 jobs across ~37 companies, ~38 requests, ~3s)
and filters locally, then caches the parsed corpus at
`<tmpdir>/joppy-search-corpus.json` for 30 minutes. Repeat searches and `detail`
lookups are served from cache at zero request cost; `--refresh` forces a re-scan.

Because parsing goes through real JSON rather than rendered markup, it does not
break when Joppy restyles its pages. See `../url-reference.md` for the field map
and the dead ends already ruled out.

## Output contract

Search emits `{ meta: { count, total, page, pages, corpusSize, cached, scannedAt },
results: [...] }`. Each result carries at least `id, title, company, location,
date, url`; unknown values are `null`, never omitted.

Errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.
Codes: `BAD_FLAG`, `BAD_ARG`, `BAD_CMD`, `NO_ID`, `BAD_ID`, `AMBIGUOUS_ID`,
`NOT_FOUND`, `SEARCH_FAILED`, `DETAIL_FAILED`, `INTERNAL_ERROR`.

## Tests

```bash
bun run test        # bun test --timeout 30000
bun run typecheck   # tsc --noEmit
```

`tests/parsing.test.ts` is offline and covers the sitemap, `__NEXT_DATA__`
extraction, job normalization, entity/HTML rendering, scoring, and filters.
`tests/smoke.test.ts` hits the live site (sharing one cached scan);
`tests/cli-flag-validation.test.ts` pins the error contract.
