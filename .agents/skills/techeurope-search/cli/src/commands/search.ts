import { fetchSitemap, fetchJob, mapLimit, slugMatches, writeError, type JobCard } from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  limit: number
  format: "json" | "table" | "plain"
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = c.title.slice(0, 42).padEnd(42)
    const company = (c.company || "—").slice(0, 22).padEnd(22)
    const loc = (c.location || "—").slice(0, 20).padEnd(20)
    const date = (c.date || "—").slice(0, 10)
    return `${title} ${company} ${loc} ${date}`
  })
  const header = "TITLE".padEnd(42) + " " + "COMPANY".padEnd(22) + " " + "LOCATION".padEnd(20) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const entries = (await fetchSitemap()).filter(
      (e) =>
        (!opts.query || slugMatches(e.slug, opts.query)) &&
        (!opts.location || slugMatches(e.slug, opts.location)),
    )
    const total = entries.length
    // One page fetch per kept job, so the limit also caps network requests.
    const kept = entries.slice(0, opts.limit)
    const settled = await mapLimit(kept, 5, (e) => fetchJob(e.slug).catch(() => null))
    const cards: JobCard[] = settled
      .filter((j) => j !== null)
      .map(({ id, title, company, location, date, url }) => ({ id, title, company, location, date, url }))

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards.map((c) => `${c.title}\n  ${c.company || "—"} · ${c.location || "—"}\n  id: ${c.id}\n  ${c.url}`).join("\n\n") +
          "\n",
      )
    } else {
      process.stdout.write(JSON.stringify({ meta: { count: cards.length, matched: total }, results: cards }, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
