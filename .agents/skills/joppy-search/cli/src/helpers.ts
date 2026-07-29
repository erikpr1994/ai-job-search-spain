// Data source: Joppy's public company directory on https://www.joppy.me.
//
// Joppy has NO public keyword-search endpoint — the candidate-facing search is
// behind the login of its swipe/match app. What IS public is the company
// directory, and it is unusually rich:
//
//   1. `sitemap.directory.xml` enumerates every open job as
//      `/companies/<slug>/<uid>` with a `<lastmod>` timestamp.
//   2. Each company page embeds the FULL job objects (title, description,
//      skills, salary, place, languages) in its Next.js `__NEXT_DATA__` blob.
//
// So "search" = fetch the sitemap, fetch the ~40 company pages that actually
// have jobs, and filter the resulting corpus locally. The public corpus is small
// (tens of jobs), which is why a full scan is affordable — and why we cache it.
//
// Parsing goes through `__NEXT_DATA__` (real JSON), not regex over rendered
// markup, so it is far more stable than a typical HTML-scraping portal skill.

import { tmpdir } from "node:os"
import { join } from "node:path"
import { readFile, writeFile } from "node:fs/promises"

export const BASE = "https://www.joppy.me"
export const SITEMAP_URL = `${BASE}/sitemap.directory.xml`
export const APP_BASE = "https://app.joppy.me"

/** Results per page for the client-side pagination of the scanned corpus. */
export const PAGE_SIZE = 20

/** How long a scanned corpus stays fresh on disk. */
export const CACHE_TTL_MS = 30 * 60 * 1000
export const CACHE_PATH = join(tmpdir(), "joppy-search-corpus.json")

/** Max company pages fetched at once. Kept low deliberately — be a good guest. */
const CONCURRENCY = 5

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/** Fetch text with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

/** Run `fn` over `items` with a bounded number of in-flight promises. */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i]!)
    }
  })
  await Promise.all(workers)
  return results
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

/**
 * Named entities worth decoding. Joppy stores descriptions as UTF-8, so accented
 * characters usually arrive literally — but employers paste from editors that
 * emit entities, and Spanish copy is full of them.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü",
  ccedil: "ç", Ccedil: "Ç",
  agrave: "à", egrave: "è", igrave: "ì", ograve: "ò", ugrave: "ù",
  iquest: "¿", iexcl: "¡", ordm: "º", ordf: "ª", deg: "°",
  euro: "€", pound: "£", cent: "¢",
  mdash: "—", ndash: "–", hellip: "…", bull: "•", middot: "·",
  laquo: "«", raquo: "»", ldquo: "“", rdquo: "”",
  lsquo: "‘", rsquo: "’", trade: "™", copy: "©", reg: "®",
}

export function decodeHtmlEntities(text: string): string {
  return text
    // Numeric character references: decimal (&#233;) and hexadecimal (&#xE9;).
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    // Named references. `&amp;` is decoded last-ish by construction: the regex
    // scans left to right in one pass, so "&amp;lt;" yields "&lt;", not "<".
    .replace(/&([a-zA-Z][a-zA-Z0-9]{1,9});/g, (match, name: string) =>
      Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name)
        ? NAMED_ENTITIES[name]!
        : match,
    )
}

/** Render a stored HTML fragment (descriptions are rich text) to plain text. */
export function htmlToText(html: string | null | undefined): string | null {
  if (!html) return null
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    // Block-level elements end a paragraph; list items and rows end a line.
    .replace(/<\/(p|div|h\d|ul|ol)>/gi, "\n\n")
    .replace(/<\/(li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
  const text = decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, ""))
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text || null
}

/** Lowercase + strip diacritics, so "Diseño"/"diseno" and "Málaga"/"malaga" match. */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining accents
    .toLowerCase()
}

// ---------------------------------------------------------------------------
// Sitemap
// ---------------------------------------------------------------------------

export interface SitemapJob {
  uid: string
  slug: string
  url: string
  lastmod: string | null
}

/**
 * Parse `sitemap.directory.xml` into the list of job pages. Company-only URLs
 * (`/companies/<slug>`) are skipped; we only want `/companies/<slug>/<uid>`.
 * Each <url> block is parsed independently so one malformed entry cannot break
 * the rest.
 */
export function parseSitemap(xml: string): SitemapJob[] {
  const jobs: SitemapJob[] = []
  const blocks = xml.split(/<url>/).slice(1)
  for (const block of blocks) {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1]
    if (!loc) continue
    const m = loc.match(/\/companies\/([^/]+)\/([0-9a-fA-F-]{8,})\s*$/)
    if (!m) continue
    jobs.push({
      uid: m[2]!,
      slug: m[1]!,
      url: decodeHtmlEntities(loc).trim(),
      lastmod: block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]?.trim() ?? null,
    })
  }
  return jobs
}

// ---------------------------------------------------------------------------
// __NEXT_DATA__ extraction
// ---------------------------------------------------------------------------

/** Pull and parse the Next.js `__NEXT_DATA__` payload out of a page. */
export function extractNextData(html: string): Record<string, unknown> | null {
  const m = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i,
  )
  if (!m) return null
  try {
    return JSON.parse(m[1]!) as Record<string, unknown>
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Job model
// ---------------------------------------------------------------------------

export interface Skill {
  name: string
  isMandatory: boolean
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  companyUrl: string | null
  location: string | null
  modality: string | null
  date: string | null
  salaryMin: number | null
  salaryMax: number | null
  skills: string[]
  url: string
}

export interface JobDetail extends JobCard {
  specialities: string[]
  mandatorySkills: string[]
  languages: string[]
  onlyEuCandidates: boolean | null
  sponsorVisa: boolean | null
  relocationPack: boolean | null
  companyDescription: string | null
  description: string | null
  hiringProcess: string | null
  applyUrl: string
}

/** A corpus entry keeps the searchable card plus the heavy detail fields. */
export interface CorpusJob extends JobDetail {
  slug: string
}

export interface Corpus {
  fetchedAt: number
  jobs: CorpusJob[]
}

const LANGUAGE_LEVELS = [
  "don't know",
  "basic",
  "intermediate",
  "advanced",
  "fluent",
  "native",
]

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null
  // Some company names carry stray zero-width characters in Joppy's own data.
  const cleaned = value.replace(/[\u200b-\u200d\ufeff]/g, "").trim()
  return cleaned || null
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function asBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null
}

/** `place.cities` has been seen empty; tolerate both strings and {name} objects. */
function cityNames(place: Record<string, unknown> | null): string[] {
  const cities = place?.["cities"]
  if (!Array.isArray(cities)) return []
  return cities
    .map((c) => (typeof c === "string" ? c : asString(asRecord(c)?.["name"])))
    .filter((c): c is string => Boolean(c))
}

function modalityOf(place: Record<string, unknown> | null): string | null {
  if (!place) return null
  const parts: string[] = []
  if (place["isRemote"] === true) parts.push("Remote")
  if (place["isHybrid"] === true) parts.push("Hybrid")
  if (place["isOffice"] === true) parts.push("Office")
  return parts.length ? parts.join(" / ") : null
}

function skillList(raw: unknown, mandatoryOnly = false): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const s of raw) {
    if (typeof s === "string") {
      if (!mandatoryOnly) out.push(s.trim())
      continue
    }
    const rec = asRecord(s)
    const name = asString(rec?.["name"])
    if (!name) continue
    if (mandatoryOnly && rec?.["isMandatory"] !== true) continue
    out.push(name)
  }
  return out
}

function languageList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const l of raw) {
    const rec = asRecord(l)
    const name = asString(rec?.["name"])
    if (!name) continue
    const level = asNumber(rec?.["level"])
    const label = level !== null ? LANGUAGE_LEVELS[level] : null
    out.push(label ? `${name} (${label})` : name)
  }
  return out
}

/**
 * Normalize one raw job object (as embedded in a company page) into a
 * `CorpusJob`, joined with the company record and the sitemap `lastmod`.
 */
export function normalizeJob(
  rawJob: unknown,
  company: Record<string, unknown> | null,
  slug: string,
  lastmod: string | null,
): CorpusJob | null {
  const job = asRecord(rawJob)
  if (!job) return null
  const uid = asString(job["uid"])
  const title = asString(job["title"])
  if (!uid || !title) return null

  const place = asRecord(job["place"])
  const cities = cityNames(place)
  const location =
    asString(place?.["located"]) ??
    (cities.length ? cities.join(", ") : null) ??
    asString(company?.["location"])

  return {
    id: uid,
    title,
    company: asString(company?.["name"]),
    companyUrl: `${BASE}/companies/${slug}`,
    location,
    modality: modalityOf(place),
    date: lastmod,
    salaryMin: job["isSalaryPublic"] === false ? null : asNumber(job["salaryMin"]),
    salaryMax: job["isSalaryPublic"] === false ? null : asNumber(job["salaryMax"]),
    skills: skillList(job["skills"]),
    url: `${BASE}/companies/${slug}/${uid}`,
    specialities: skillList(job["specialities"]),
    mandatorySkills: skillList(job["skills"], true),
    languages: languageList(job["languages"]),
    onlyEuCandidates: asBool(job["onlyEuCandidates"]),
    sponsorVisa: asBool(job["sponsorVisa"]),
    relocationPack: asBool(job["relocationPack"]),
    companyDescription: htmlToText(asString(company?.["description"])),
    description: htmlToText(asString(job["description"])),
    hiringProcess: htmlToText(asString(job["hiringProcess"])),
    applyUrl: `${APP_BASE}/job/${uid}/web`,
    slug,
  }
}

/** Extract every job on a company page, keyed by uid via the sitemap lastmods. */
export function parseCompanyPage(
  html: string,
  slug: string,
  lastmods: Map<string, string | null>,
): CorpusJob[] {
  const data = extractNextData(html)
  const props = asRecord(asRecord(data?.["props"])?.["pageProps"])
  const company = asRecord(props?.["company"])
  const rawJobs = company?.["jobs"]
  if (!Array.isArray(rawJobs)) return []

  const out: CorpusJob[] = []
  for (const raw of rawJobs) {
    const uid = asString(asRecord(raw)?.["uid"])
    const job = normalizeJob(raw, company, slug, uid ? (lastmods.get(uid) ?? null) : null)
    if (job) out.push(job)
  }
  return out
}

/** Strip the heavy fields, leaving the search-result shape. */
export function toCard(job: CorpusJob): JobCard {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    companyUrl: job.companyUrl,
    location: job.location,
    modality: job.modality,
    date: job.date,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    skills: job.skills,
    url: job.url,
  }
}

// ---------------------------------------------------------------------------
// Corpus scan + cache
// ---------------------------------------------------------------------------

async function readCache(): Promise<Corpus | null> {
  try {
    const raw = await readFile(CACHE_PATH, "utf-8")
    const parsed = JSON.parse(raw) as Corpus
    if (!parsed || !Array.isArray(parsed.jobs) || typeof parsed.fetchedAt !== "number") {
      return null
    }
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

async function writeCache(corpus: Corpus): Promise<void> {
  try {
    await writeFile(CACHE_PATH, JSON.stringify(corpus), "utf-8")
  } catch {
    // A read-only or full tmpdir must not break a search.
  }
}

/**
 * Scan the whole public corpus: sitemap → company pages → normalized jobs.
 * Companies whose page fails to load are skipped rather than failing the run.
 */
export async function scanCorpus(): Promise<Corpus> {
  const sitemapXml = await htmlFetch(SITEMAP_URL)
  if (!sitemapXml) throw new Error("Could not load Joppy's directory sitemap")
  const entries = parseSitemap(sitemapXml)
  if (entries.length === 0) {
    throw new Error("Joppy's directory sitemap listed no job pages (markup may have changed)")
  }

  const lastmods = new Map<string, string | null>(entries.map((e) => [e.uid, e.lastmod]))
  const slugs = [...new Set(entries.map((e) => e.slug))]

  const perCompany = await mapPool(slugs, CONCURRENCY, async (slug) => {
    try {
      const html = await htmlFetch(`${BASE}/companies/${slug}`)
      return html ? parseCompanyPage(html, slug, lastmods) : []
    } catch {
      return []
    }
  })

  const jobs = perCompany.flat()
  if (jobs.length === 0) {
    throw new Error("Scanned Joppy's company pages but parsed no jobs (markup may have changed)")
  }
  return { fetchedAt: Date.now(), jobs }
}

/** Corpus from cache when fresh, otherwise a live scan. */
export async function loadCorpus(refresh: boolean): Promise<{ corpus: Corpus; cached: boolean }> {
  if (!refresh) {
    const cached = await readCache()
    if (cached) return { corpus: cached, cached: true }
  }
  const corpus = await scanCorpus()
  await writeCache(corpus)
  return { corpus, cached: false }
}

// ---------------------------------------------------------------------------
// Filtering + scoring
// ---------------------------------------------------------------------------

export interface FilterOpts {
  query?: string
  location?: string
  remote?: string
  jobage: number
  minSalary?: number
}

/**
 * Relevance score for one job against the query terms. Every term must match
 * somewhere, otherwise the job is dropped (score 0). Weighting favours title and
 * skill hits over an incidental mention in the body text.
 */
export function scoreJob(job: CorpusJob, terms: string[]): number {
  if (terms.length === 0) return 1
  const title = fold(job.title)
  const skills = fold(job.skills.join(" "))
  const specialities = fold(job.specialities.join(" "))
  const company = fold(job.company ?? "")
  const body = fold(`${job.description ?? ""} ${job.hiringProcess ?? ""}`)

  let total = 0
  for (const term of terms) {
    let best = 0
    if (title.includes(term)) best = 10
    else if (skills.includes(term)) best = 6
    else if (specialities.includes(term)) best = 4
    else if (company.includes(term)) best = 3
    else if (body.includes(term)) best = 1
    if (best === 0) return 0
    total += best
  }
  return total
}

function matchesRemote(job: CorpusJob, mode: string): boolean {
  const m = (job.modality ?? "").toLowerCase()
  switch (mode.toLowerCase()) {
    case "remote":
      return m.includes("remote")
    case "hybrid":
      return m.includes("hybrid")
    case "onsite":
    case "on-site":
    case "office":
      return m.includes("office")
    default:
      return true
  }
}

function withinAge(job: CorpusJob, days: number): boolean {
  if (!days || days <= 0 || days >= 9999) return true
  if (!job.date) return false
  const t = Date.parse(job.date)
  if (Number.isNaN(t)) return false
  return Date.now() - t <= days * 86400000
}

/** Apply every filter, then sort by relevance and recency. */
export function filterJobs(jobs: CorpusJob[], opts: FilterOpts): CorpusJob[] {
  const terms = opts.query ? fold(opts.query).split(/\s+/).filter(Boolean) : []
  const loc = opts.location ? fold(opts.location) : null

  const scored: { job: CorpusJob; score: number }[] = []
  for (const job of jobs) {
    if (!withinAge(job, opts.jobage)) continue
    if (opts.remote && !matchesRemote(job, opts.remote)) continue
    if (opts.minSalary !== undefined) {
      const top = job.salaryMax ?? job.salaryMin
      if (top === null || top < opts.minSalary) continue
    }
    if (loc) {
      const haystack = fold(`${job.location ?? ""} ${job.modality ?? ""}`)
      if (!haystack.includes(loc)) continue
    }
    const score = scoreJob(job, terms)
    if (score === 0) continue
    scored.push({ job, score })
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const at = a.job.date ? Date.parse(a.job.date) : 0
    const bt = b.job.date ? Date.parse(b.job.date) : 0
    return bt - at
  })
  return scored.map((s) => s.job)
}
