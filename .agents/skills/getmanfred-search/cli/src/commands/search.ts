import {
  jsonFetch,
  offersListUrl,
  resolveTechId,
  toResult,
  matchesQuery,
  matchesLocation,
  withinJobAge,
  isActive,
  writeError,
  type RawOffer,
  type JobResult,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

const PAGE_SIZE = 25

function renderTable(rows: JobResult[]): string {
  if (rows.length === 0) return "No results."
  const line = (c: JobResult) => {
    const id = c.id.padEnd(6)
    const title = (c.title || "").slice(0, 34).padEnd(34)
    const company = (c.company || "—").slice(0, 20).padEnd(20)
    const loc = (c.location || "—").slice(0, 18).padEnd(18)
    const salary = (c.salary || "—").slice(0, 16).padEnd(16)
    const date = (c.date || "—").slice(0, 10)
    return `${id} ${title} ${company} ${loc} ${salary} ${date}`
  }
  const header =
    "ID".padEnd(6) +
    " " +
    "TITLE".padEnd(34) +
    " " +
    "COMPANY".padEnd(20) +
    " " +
    "LOCATION".padEnd(18) +
    " " +
    "SALARY".padEnd(16) +
    " DATE"
  return [header, "-".repeat(header.length), ...rows.map(line)].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    // Tech-stack matching: if the query names a known tech (e.g. "React"), use
    // the server-side techs=<id> filter — the list payload has no stack field,
    // so a text filter alone would miss stack-only matches. Otherwise fetch the
    // full catalogue and filter the query text client-side.
    const techId = opts.query ? await resolveTechId(opts.query) : null
    const all = await jsonFetch<RawOffer[]>(offersListUrl(techId))
    if (!all || !Array.isArray(all)) {
      writeError("Unexpected response from GetManfred offers API", "BAD_RESPONSE")
      return 1
    }

    let offers = all.filter(isActive)
    if (opts.query && techId === null) {
      offers = offers.filter((o) => matchesQuery(o, opts.query!))
    }
    if (opts.location) offers = offers.filter((o) => matchesLocation(o, opts.location!))
    offers = offers.filter((o) => withinJobAge(o, opts.jobage))

    // Newest first.
    offers.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))

    const start = (opts.page - 1) * PAGE_SIZE
    let page = offers.slice(start, start + PAGE_SIZE)
    if (opts.limit && opts.limit > 0) page = page.slice(0, opts.limit)

    const results = page.map(toResult)

    if (opts.format === "table") {
      process.stdout.write(renderTable(results) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        results
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${
                c.salary || "salary n/a"
              } · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: results.length, page: opts.page }, results },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
