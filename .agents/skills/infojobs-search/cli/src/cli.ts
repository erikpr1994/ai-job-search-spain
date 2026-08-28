#!/usr/bin/env bun
// Self-contained CLI for searching jobs on InfoJobs (https://www.infojobs.net),
// Spain's largest general job board. The public search + offer pages are
// server-rendered, so results are parsed straight from the HTML. No external CLI
// framework and zero runtime dependencies — it runs anywhere `bun` is available.
//
// Personal use only. This reads InfoJobs' public pages; automated access is
// restricted by InfoJobs' Terms of Service, so keep volume low and do not use it
// commercially or for bulk data collection. Run it on your own responsibility.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

const KNOWN_SEARCH_FLAGS = new Set(["query", "jobage", "page", "limit", "format", "help"])
const KNOWN_DETAIL_FLAGS = new Set(["format", "help"])

function badFlag(name: string, cmd: string): number {
  process.stderr.write(JSON.stringify({ error: `Unknown flag "--${name}" for "${cmd}"`, code: "BAD_FLAG" }) + "\n")
  return 1
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
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

const HELP = `infojobs-cli — search jobs on InfoJobs (https://www.infojobs.net, Spain)

USAGE
  bun run src/cli.ts search -q "<keywords>" [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>   Keywords (job title, skill, or role). Recommended.
  --jobage <days>      Posted within N days. Buckets: 1 (24h), 7, 15. Default: all.
  --page <n>           1-indexed page (~5 results/page). Default 1.
  --limit, -n <n>      Cap results emitted (client-side).
  --format <fmt>       json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "React" --format table
  bun run src/cli.ts search -q "desarrollador backend" --jobage 7 --limit 5 --format table
  bun run src/cli.ts detail of-i5729505a1a431da38968e4bb91f095 --format plain

Personal use only — uses InfoJobs' public pages; keep volume low (InfoJobs ToS).
`

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  if (cmd === "search") {
    for (const key of Object.keys(flags)) {
      if (key !== "_" && !KNOWN_SEARCH_FLAGS.has(key)) return badFlag(key, "search")
    }

    const fmt = (flags.format as string) || "json"

    const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
      const val = parseInt(raw as string, 10)
      if (isNaN(val)) {
        process.stderr.write(JSON.stringify({ error: `--${name} must be a number, got "${raw}"`, code: "BAD_ARG" }) + "\n")
        return null
      }
      return val
    }

    if (flags.jobage !== undefined) {
      const v = parseIntFlag("jobage", flags.jobage)
      if (v === null) return 1
      flags.jobage = String(v)
    }
    if (flags.page !== undefined) {
      const v = parseIntFlag("page", flags.page)
      if (v === null) return 1
      flags.page = String(v)
    }
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit)
      if (v === null) return 1
      flags.limit = String(v)
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : 9999,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
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
      process.stderr.write(JSON.stringify({ error: "detail requires an <id|url>", code: "NO_ID" }) + "\n")
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      id,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main().then((code) => process.exit(code))
