import {
  BASE,
  SITEMAP_URL,
  htmlFetch,
  loadCorpus,
  parseCompanyPage,
  parseSitemap,
  writeError,
  type CorpusJob,
  type SitemapJob,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  refresh: boolean
  format: "json" | "plain"
}

const UUID = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/

export interface ParsedId {
  /** Full uid, or the prefix to resolve. Always lowercase. */
  token: string
  /** True when `token` is a complete uid rather than a prefix. */
  isFull: boolean
  /** Company slug, when the input was a public job URL. */
  slug: string | null
}

/**
 * Accept a full job uid, a short id prefix as printed by `search --format table`
 * (8 hex chars), or a Joppy job URL in either the public
 * (`joppy.me/companies/<slug>/<uid>`) or app (`app.joppy.me/job/<uid>/web`) form.
 */
export function normalizeId(input: string): ParsedId | null {
  const slug = input.match(/\/companies\/([^/?#]+)\//)?.[1] ?? null
  const full = input.match(UUID)?.[0]
  if (full) return { token: full.toLowerCase(), isFull: true, slug }
  // A bare prefix only counts when it is the entire argument — never pull one
  // out of a URL, where it would almost certainly be the wrong substring.
  if (/^[0-9a-fA-F]{6,}$/.test(input.trim())) {
    return { token: input.trim().toLowerCase(), isFull: false, slug: null }
  }
  return null
}

/** Resolve a uid prefix against the sitemap's uid list. */
export function resolvePrefix(
  entries: Pick<SitemapJob, "uid" | "slug">[],
  prefix: string,
): { uid: string; slug: string } | { ambiguous: string[] } | null {
  const hits = entries.filter((e) => e.uid.toLowerCase().startsWith(prefix))
  if (hits.length === 0) return null
  if (hits.length > 1) return { ambiguous: hits.map((h) => h.uid) }
  return { uid: hits[0]!.uid.toLowerCase(), slug: hits[0]!.slug }
}

class AmbiguousId extends Error {
  constructor(public readonly matches: string[]) {
    super(
      `Ambiguous job id — ${matches.length} postings match that prefix: ${matches.join(", ")}`,
    )
  }
}

/**
 * Fetch one job. A fresh corpus cache answers this with zero requests; otherwise
 * we resolve the uid via the sitemap and fetch only that one company page.
 */
async function fetchJob(parsed: ParsedId, refresh: boolean): Promise<CorpusJob | null> {
  if (!refresh) {
    try {
      const { corpus } = await loadCorpus(false)
      const hits = corpus.jobs.filter((j) =>
        parsed.isFull ? j.id.toLowerCase() === parsed.token : j.id.toLowerCase().startsWith(parsed.token),
      )
      if (hits.length > 1) throw new AmbiguousId(hits.map((h) => h.id))
      if (hits.length === 1) return hits[0]!
    } catch (e) {
      if (e instanceof AmbiguousId) throw e
      // Otherwise fall through to the targeted fetch below.
    }
  }

  const xml = await htmlFetch(SITEMAP_URL)
  const entries = xml ? parseSitemap(xml) : []

  let uid = parsed.token
  let slug = parsed.slug
  if (!parsed.isFull) {
    const resolved = resolvePrefix(entries, parsed.token)
    if (!resolved) return null
    if ("ambiguous" in resolved) throw new AmbiguousId(resolved.ambiguous)
    uid = resolved.uid
    slug = resolved.slug
  }
  slug ??= entries.find((e) => e.uid.toLowerCase() === uid)?.slug ?? null
  if (!slug) return null

  const html = await htmlFetch(`${BASE}/companies/${slug}`)
  if (!html) return null

  // The company page carries no lastmod; pull it from the sitemap so `date`
  // stays consistent with what `search` reports.
  const lastmods = new Map<string, string | null>(entries.map((e) => [e.uid, e.lastmod]))
  return parseCompanyPage(html, slug, lastmods).find((j) => j.id.toLowerCase() === uid) ?? null
}

function renderPlain(job: CorpusJob): string {
  const money = (n: number) => n.toLocaleString("en-US")
  const salary =
    job.salaryMin !== null || job.salaryMax !== null
      ? `${money(job.salaryMin ?? job.salaryMax!)} – ${money(job.salaryMax ?? job.salaryMin!)} EUR/year`
      : null

  const perks = [
    job.sponsorVisa ? "sponsors visa" : null,
    job.relocationPack ? "relocation package" : null,
    job.onlyEuCandidates ? "EU candidates only" : null,
  ].filter(Boolean)

  const lines = [
    job.title,
    `${job.company || "—"} · ${job.location || "—"}${job.modality ? ` · ${job.modality}` : ""}`,
    "",
    salary ? `Salary: ${salary}` : "",
    job.skills.length ? `Skills: ${job.skills.join(", ")}` : "",
    job.mandatorySkills.length ? `Must-have: ${job.mandatorySkills.join(", ")}` : "",
    job.specialities.length ? `Specialities: ${job.specialities.join(", ")}` : "",
    job.languages.length ? `Languages: ${job.languages.join(", ")}` : "",
    perks.length ? `Notes: ${perks.join(", ")}` : "",
    job.date ? `Updated: ${job.date}` : "",
    "",
    job.description || "(no description)",
    "",
    job.hiringProcess ? `HIRING PROCESS\n${job.hiringProcess}\n` : "",
    `URL: ${job.url}`,
    `Apply: ${job.applyUrl}`,
  ].filter((l) => l !== "")
  return lines.join("\n")
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const parsed = normalizeId(opts.id)
  if (!parsed) {
    writeError(
      `Could not parse a Joppy job id from "${opts.id}" (expected a uid, an 8-char id prefix, or a joppy.me job URL)`,
      "BAD_ID",
    )
    return 1
  }
  try {
    const job = await fetchJob(parsed, opts.refresh)
    if (!job) {
      writeError("Job not found (it may have been closed or removed)", "NOT_FOUND")
      return 1
    }
    if (opts.format === "plain") {
      process.stdout.write(renderPlain(job) + "\n")
    } else {
      const { slug: _slug, ...rest } = job
      process.stdout.write(JSON.stringify(rest, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    if (e instanceof AmbiguousId) {
      writeError(e.message, "AMBIGUOUS_ID")
      return 1
    }
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
