#!/usr/bin/env bun
// Self-contained CLI for searching tech jobs on Joppy's public company directory
// (joppy.me). Market: Spain. No external CLI framework and zero runtime
// dependencies, so it runs anywhere `bun` is available with nothing but a clone.
//
// Joppy exposes no public keyword-search endpoint, so `search` scans the public
// directory corpus and filters it locally. See helpers.ts and url-reference.md.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

const KNOWN_SEARCH_FLAGS = new Set([
  "query",
  "location",
  "remote",
  "jobage",
  "min-salary",
  "page",
  "limit",
  "format",
  "refresh",
  "help",
])

const KNOWN_DETAIL_FLAGS = new Set(["format", "refresh", "help"])

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = {
    q: "query",
    l: "location",
    n: "limit",
    h: "help",
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `joppy-cli — search tech jobs on Joppy's public directory (joppy.me, Spain)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords: title, skill, tech, or company. Optional —
                          omit to list the whole public corpus.
  --location, -l <text>   Filter on the posting's location text, e.g. "Madrid",
                          "Barcelona", "Valencia". Accent-insensitive.
  --remote <mode>         remote | hybrid | onsite. Filter by work modality.
  --jobage <days>         Only postings updated within N days. Default: all.
  --min-salary <eur>      Only postings whose published salary reaches this.
  --page <n>              1-indexed page (20 results/page). Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.
  --refresh               Re-scan the portal, ignoring the 30-minute cache.

EXAMPLES
  bun run src/cli.ts search -q "React" --format table
  bun run src/cli.ts search -q "backend Java" -l "Madrid" --format table
  bun run src/cli.ts search --remote remote --min-salary 50000 --format table
  bun run src/cli.ts search -q "frontend" --jobage 14 --limit 5 --format plain
  bun run src/cli.ts detail 7941c018-b7c5-42f2-a92a-bced77649fc4 --format plain

Personal, low-volume use. Joppy's robots.txt allows these public pages; a search
scans ~40 company pages, so prefer the cache over repeated --refresh runs.
`

function badFlag(name: string, cmd: string): number {
  process.stderr.write(
    JSON.stringify({ error: `Unknown flag "--${name}" for "${cmd}"`, code: "BAD_FLAG" }) + "\n",
  )
  return 1
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
    const val = parseInt(raw as string, 10)
    if (isNaN(val)) {
      process.stderr.write(
        JSON.stringify({ error: `--${name} must be a number, got "${raw}"`, code: "BAD_ARG" }) + "\n",
      )
      return null
    }
    return val
  }

  if (cmd === "search") {
    for (const key of Object.keys(flags)) {
      if (key !== "_" && !KNOWN_SEARCH_FLAGS.has(key)) return badFlag(key, "search")
    }

    for (const name of ["jobage", "page", "limit", "min-salary"]) {
      if (flags[name] !== undefined) {
        const v = parseIntFlag(name, flags[name]!)
        if (v === null) return 1
        flags[name] = String(v)
      }
    }

    const remote = typeof flags.remote === "string" ? flags.remote : undefined
    if (remote && !["remote", "hybrid", "onsite", "on-site", "office"].includes(remote.toLowerCase())) {
      process.stderr.write(
        JSON.stringify({
          error: `--remote must be one of remote|hybrid|onsite, got "${remote}"`,
          code: "BAD_ARG",
        }) + "\n",
      )
      return 1
    }

    const fmt = (flags.format as string) || "json"
    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      remote,
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : 9999,
      minSalary: flags["min-salary"]
        ? parseInt(flags["min-salary"] as string, 10)
        : undefined,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      refresh: flags.refresh === true,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    for (const key of Object.keys(flags)) {
      if (key !== "_" && !KNOWN_DETAIL_FLAGS.has(key)) return badFlag(key, "detail")
    }
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(
        JSON.stringify({ error: "detail requires an <id|url>", code: "NO_ID" }) + "\n",
      )
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      id,
      refresh: flags.refresh === true,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
        code: "INTERNAL_ERROR",
      }) + "\n",
    )
    process.exit(1)
  })
