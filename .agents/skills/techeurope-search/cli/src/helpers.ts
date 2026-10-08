// Data source: jobs.techeurope.io. robots.txt disallows /api and the home page list is
// gated behind a newsletter, so this reads only public pages:
//   1. GET /sitemap.xml   -> every job slug (company-title-location-id) with its lastmod
//   2. GET /jobs/<slug>   -> one schema.org JobPosting in a <script type="application/ld+json">
// Search filters slugs first, then fetches JSON-LD only for the kept jobs.

export const BASE_URL = "https://jobs.techeurope.io"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; techeurope-search-cli/1.0)"

export interface SitemapEntry {
  slug: string
  lastmod: string | null
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
  applyUrl: string | null
  companyUrl: string | null
}

/** GET with exponential backoff on 429/5xx. */
async function fetchText(url: string): Promise<string> {
  const maxRetries = 4
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, { headers: { "User-Agent": UA } })
    if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, delay + Math.floor(Math.random() * 500)))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) throw Object.assign(new Error("Job not found"), { code: "NOT_FOUND" })
    if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

/** All job slugs from the sitemap, newest lastmod first. */
export async function fetchSitemap(): Promise<SitemapEntry[]> {
  const xml = await fetchText(`${BASE_URL}/sitemap.xml`)
  const entries: SitemapEntry[] = []
  for (const block of xml.match(/<url>[\s\S]*?<\/url>/g) || []) {
    const slug = block.match(/<loc>[^<]*\/jobs\/([^<]+)<\/loc>/)?.[1]
    if (!slug) continue
    entries.push({ slug, lastmod: block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? null })
  }
  return entries.sort((a, b) => (b.lastmod || "").localeCompare(a.lastmod || ""))
}

/** Every whitespace-separated term must appear in the slug (slugs hold company, title and location). */
export function slugMatches(slug: string, text: string): boolean {
  const s = slug.toLowerCase()
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => s.includes(term))
}

/** Accept a slug or a full jobs.techeurope.io/jobs/<slug> URL. */
export function normalizeSlug(input: string): string {
  return input.match(/\/jobs\/([^/?#]+)/)?.[1] ?? input.replace(/^\/+|\/+$/g, "")
}

interface JobPostingLD {
  title?: string
  description?: string
  datePosted?: string
  hiringOrganization?: { name?: string; sameAs?: string }
  jobLocation?: { address?: { addressLocality?: string } } | Array<{ address?: { addressLocality?: string } }>
  url?: string
}

/** Fetch one job page and read its JobPosting JSON-LD. */
export async function fetchJob(slug: string): Promise<JobDetail> {
  const html = await fetchText(`${BASE_URL}/jobs/${encodeURIComponent(slug)}`)
  const blocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || []
  let ld: JobPostingLD | undefined
  for (const b of blocks) {
    try {
      const parsed = JSON.parse(b.replace(/^<script[^>]*>|<\/script>$/g, ""))
      if (parsed["@type"] === "JobPosting") ld = parsed
    } catch {
      // not JSON we can read; try the next block
    }
  }
  if (!ld) throw Object.assign(new Error("No JobPosting data on the job page"), { code: "NOT_FOUND" })
  const locs = Array.isArray(ld.jobLocation) ? ld.jobLocation : ld.jobLocation ? [ld.jobLocation] : []
  const location = locs.map((l) => l.address?.addressLocality).filter(Boolean).join("; ") || null
  return {
    id: slug,
    title: ld.title || "(untitled)",
    company: ld.hiringOrganization?.name || null,
    location,
    date: ld.datePosted || null,
    url: `${BASE_URL}/jobs/${slug}`,
    description: ld.description || null,
    applyUrl: ld.url || null,
    companyUrl: ld.hiringOrganization?.sameAs || null,
  }
}

/** Run fn over items with at most `n` in flight, keeping input order. */
export async function mapLimit<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker))
  return out
}
