# getmanfred-cli

Self-contained CLI for searching tech jobs on [GetManfred](https://www.getmanfred.com)'s
public JSON API (Spain + remote-in-Europe, with transparent salary ranges).
Zero runtime dependencies — runs on `bun` alone.

## Install (dev types only)

```bash
cd .agents/skills/getmanfred-search/cli && bun install
```

Runtime needs nothing installed; `bun install` only pulls dev typings for `typecheck`.

## Usage

```bash
bun run src/cli.ts search -q "React" --limit 10 --format table
bun run src/cli.ts search -q "backend" -l "Madrid" --format plain
bun run src/cli.ts detail 8400 --format plain
```

## Commands & flags

- `search` — `--query/-q`, `--location/-l`, `--jobage <days>`, `--page <n>`,
  `--limit/-n <n>`, `--format json|table|plain` (default `json`). All filters are
  applied client-side (the API returns the whole active catalogue at once).
- `detail <id|url>` — `--format json|plain`.

JSON output: `{ "meta": { "count", "page" }, "results": [ { id, title, company,
location, date, url, salary, remote } ] }`. Errors go to stderr as
`{ "error", "code" }` with exit code 1.

## Tests

```bash
bun run typecheck   # tsc --noEmit
bun test            # live smoke test against the public API
```

See `../url-reference.md` for the API endpoints and field mappings.
