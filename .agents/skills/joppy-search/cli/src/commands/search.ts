import {
  PAGE_SIZE,
  filterJobs,
  loadCorpus,
  toCard,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  remote?: string // "remote" | "hybrid" | "onsite"
  jobage: number
  minSalary?: number
  page: number
  limit?: number
  refresh: boolean
  format: "json" | "table" | "plain"
}

function salaryLabel(card: JobCard): string {
  const { salaryMin: min, salaryMax: max } = card
  if (min === null && max === null) return "—"
  const k = (n: number) => `${Math.round(n / 1000)}k`
  if (min !== null && max !== null) return min === max ? k(min) : `${k(min)}–${k(max)}`
  return k((min ?? max)!)
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 40).padEnd(40)
    const company = (c.company || "—").slice(0, 20).padEnd(20)
    const loc = (c.location || "—").slice(0, 22).padEnd(22)
    const mode = (c.modality || "—").slice(0, 15).padEnd(15)
    const salary = salaryLabel(c).padEnd(9)
    const date = (c.date || "—").slice(0, 10)
    return `${c.id.slice(0, 8)} ${title} ${company} ${loc} ${mode} ${salary} ${date}`
  })
  const header =
    "ID".padEnd(8) +
    " " +
    "TITLE".padEnd(40) +
    " " +
    "COMPANY".padEnd(20) +
    " " +
    "LOCATION".padEnd(22) +
    " " +
    "MODE".padEnd(15) +
    " " +
    "SALARY".padEnd(9) +
    " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

function renderPlain(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  return cards
    .map((c) => {
      const bits = [c.company || "—", c.location || "—", c.modality || "—", c.date || "—"]
      const skills = c.skills.length ? `\n  skills: ${c.skills.join(", ")}` : ""
      const salary =
        c.salaryMin !== null || c.salaryMax !== null ? `\n  salary: ${salaryLabel(c)}` : ""
      return `${c.title}\n  ${bits.join(" · ")}${salary}${skills}\n  id: ${c.id}\n  ${c.url}`
    })
    .join("\n\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const { corpus, cached } = await loadCorpus(opts.refresh)
    const matched = filterJobs(corpus.jobs, {
      query: opts.query,
      location: opts.location,
      remote: opts.remote,
      jobage: opts.jobage,
      minSalary: opts.minSalary,
    })

    const total = matched.length
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const start = (opts.page - 1) * PAGE_SIZE
    let cards = matched.slice(start, start + PAGE_SIZE).map(toCard)
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(renderPlain(cards) + "\n")
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: {
              count: cards.length,
              total,
              page: opts.page,
              pages,
              corpusSize: corpus.jobs.length,
              cached,
              scannedAt: new Date(corpus.fetchedAt).toISOString(),
            },
            results: cards,
          },
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
