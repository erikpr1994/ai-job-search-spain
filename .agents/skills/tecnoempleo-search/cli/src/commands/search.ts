import {
  BASE_URL,
  SEARCH_PATH,
  htmlFetch,
  parseJobCards,
  parseHitCount,
  provinceCode,
  parseDate,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function buildUrl(opts: SearchOpts, prCode: string | null): string {
  const params = new URLSearchParams()
  if (opts.query) params.set("te", opts.query)
  if (prCode) params.set("pr", prCode)
  // Tecnoempleo only exposes a "last 24h" server-side age filter; anything
  // finer/coarser is applied client-side from each card's posting date.
  if (opts.jobage <= 1) params.set("ult_24h", "1")
  if (opts.page > 1) params.set("pagina", String(opts.page))
  const qs = params.toString()
  return `${BASE_URL}${SEARCH_PATH}${qs ? `?${qs}` : ""}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 42).padEnd(42)
    const company = (c.company || "—").slice(0, 24).padEnd(24)
    const loc = (c.location || c.modality || "—").slice(0, 20).padEnd(20)
    const date = c.date || "—"
    return `${c.id.slice(0, 20).padEnd(20)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(20) +
    " " +
    "TITLE".padEnd(42) +
    " " +
    "COMPANY".padEnd(24) +
    " " +
    "LOCATION".padEnd(20) +
    " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

function renderPlain(cards: JobCard[]): string {
  return cards
    .map(
      (c) =>
        `${c.title}\n  ${c.company || "—"} · ${c.location || c.modality || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
    )
    .join("\n\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  let prCode: string | null = null
  if (opts.location) {
    prCode = provinceCode(opts.location)
    if (!prCode) {
      writeError(
        `unknown --location "${opts.location}". Pass a Spanish province name (e.g. "Madrid", "Barcelona", "Valencia") or a numeric pr code.`,
        "BAD_LOCATION",
      )
      return 1
    }
  }

  try {
    const html = await htmlFetch(buildUrl(opts, prCode))
    const total = parseHitCount(html)
    let cards = parseJobCards(html)

    // Client-side recency filter for jobage values the server can't express.
    if (opts.jobage > 1 && opts.jobage < 9999) {
      const cutoff = Date.now() - opts.jobage * 86400_000
      cards = cards.filter((c) => {
        const t = parseDate(c.date)
        return t === null ? true : t >= cutoff
      })
    }

    if (opts.limit && opts.limit > 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(renderPlain(cards) + "\n")
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: cards.length, total, page: opts.page }, results: cards },
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
