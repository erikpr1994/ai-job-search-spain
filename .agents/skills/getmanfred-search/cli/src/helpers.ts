// Data source: GetManfred's public JSON API (no authentication required).
//
//   List:   GET https://www.getmanfred.com/api/v2/public/offers?lang=EN
//   Detail: GET https://www.getmanfred.com/api/v2/public/offers/<id>?lang=EN
//
// The list endpoint returns *every* active offer in one JSON array (no
// server-side query/pagination), so filtering by query/location/jobage and
// paginating are all done client-side here. Content fields come back as
// Markdown in the offer's original language (usually Spanish); we strip the
// Markdown for the `plain`/`table` renderers.

export const OFFERS_URL = "https://www.getmanfred.com/api/v2/public/offers"
export const SITE_URL = "https://www.getmanfred.com"
// The offers page whose embedded __NEXT_DATA__ carries the tech-name → id map
// (no public JSON endpoint exposes it), used to turn a query like "React" into
// the server-side `techs=<id>` filter.
export const OFFERS_PAGE_URL = "https://www.getmanfred.com/ofertas-empleo"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/**
 * Fetch raw text with exponential backoff + jitter on 429/5xx. Returns `null`
 * on a 404 so callers can report "not found" instead of crashing.
 */
export async function fetchText(url: string, accept: string): Promise<string | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: accept,
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    })
    if (response.status === 429 || response.status >= 500) {
      // The Asgard backend answers a missing/invalid offer id with a
      // deterministic HTTP 500 whose body is exactly this sentinel — that is a
      // "not found", not a transient error, so don't burn retries on it.
      if (response.status === 500) {
        const body = await response.text()
        if (body.includes("Internal Server Error (Asgard API)")) return null
        // Non-sentinel 500: fall through to the retry/throw logic below.
        if (attempt === maxRetries) {
          throw new Error(`Request failed: ${response.status} ${response.statusText}`)
        }
      } else if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

/** Fetch JSON with backoff. Returns `null` on a 404 (missing offer). */
export async function jsonFetch<T = unknown>(url: string): Promise<T | null> {
  const body = await fetchText(url, "application/json, text/plain, */*")
  if (body === null) return null
  return JSON.parse(body) as T
}

// ── Raw API shapes (only the fields we read) ────────────────────────────────

interface RawCompany {
  name?: string
  web?: string | null
}

interface RawTech {
  name?: string
  level?: string | null
  section?: string | null
}

interface RawLanguage {
  code?: string
  name?: string
  level?: string | null
}

export interface RawOffer {
  id: number
  position?: string
  slug?: string
  status?: string
  salaryFrom?: number
  salaryTo?: number
  currency?: string
  remotePercentage?: number
  isFreelance?: boolean
  feeRateFrom?: number
  feeRateTo?: number
  highlights?: string[]
  locations?: string[]
  offerLanguages?: string[]
  updatedAt?: string
  company?: RawCompany
  // detail-only fields
  introduction?: string
  responsibilities?: string[]
  whatWillYouDo?: string
  howWillYouDoIt?: string
  whatTheyAskFor?: string
  whatOffering?: string
  whoWillDoItWith?: string
  whereWillDoIt?: string
  whenWillDoIt?: string
  techs?: RawTech[]
  languages?: RawLanguage[]
}

// ── Normalised output shapes ────────────────────────────────────────────────

export interface JobResult {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  salary: string | null
  remote: number | null
}

export interface JobDetail extends JobResult {
  description: string | null
  skills: string[]
  languages: string[]
  companyUrl: string | null
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

/** Decode the HTML entities Manfred sometimes leaves in Markdown (e.g. &#x20;). */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

/** Lightly strip Markdown to readable plain text. */
export function stripMarkdown(md: string): string {
  return decodeHtmlEntities(md)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links -> text
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1") // inline code
    .replace(/(\*\*|__)(.*?)\1/g, "$2") // bold
    .replace(/(\*|_)(.*?)\1/g, "$2") // italic
    .replace(/^\s{0,3}#{1,6}\s*/gm, "") // headings
    .replace(/^\s{0,3}>\s?/gm, "") // blockquotes
    .replace(/<\/?u>/gi, "") // stray <u> tags
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Fold accents so "Malaga" matches "Málaga" in the client-side filters. */
function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
}

/** Format a salary/fee range, or null when unknown (Manfred uses 0 for unset). */
export function formatSalary(o: RawOffer): string | null {
  const cur = o.currency || "€"
  if (o.isFreelance && (o.feeRateFrom || o.feeRateTo)) {
    const from = o.feeRateFrom || 0
    const to = o.feeRateTo || 0
    const range = to && to !== from ? `${from} - ${to}` : `${from || to}`
    return `${range} ${cur}/day`
  }
  const from = o.salaryFrom || 0
  const to = o.salaryTo || 0
  if (!from && !to) return null
  const range = from && to && to !== from ? `${from} - ${to}` : `${from || to}`
  return `${range} ${cur}`
}

/** Human location string: joined locations, else "Remote" for fully-remote, else null. */
function offerLocation(o: RawOffer): string | null {
  if (o.locations && o.locations.length) return o.locations.join(" / ")
  if (o.remotePercentage === 100) return "Remote"
  return null
}

export function offerUrl(o: RawOffer): string {
  return `${SITE_URL}/ofertas-empleo/${o.id}/${o.slug ?? ""}`.replace(/\/$/, "")
}

/** Map a raw offer to the shared result shape. */
export function toResult(o: RawOffer): JobResult {
  return {
    id: String(o.id),
    title: o.position ? decodeHtmlEntities(o.position) : "(untitled)",
    company: o.company?.name ? decodeHtmlEntities(o.company.name) : null,
    location: offerLocation(o),
    date: o.updatedAt ?? null,
    url: offerUrl(o),
    salary: formatSalary(o),
    remote: typeof o.remotePercentage === "number" ? o.remotePercentage : null,
  }
}

/** Assemble the Markdown detail sections into one readable block. */
export function buildDescription(o: RawOffer): string | null {
  const parts: string[] = []
  const push = (label: string, value?: string) => {
    if (value && value.trim()) parts.push(`## ${label}\n${stripMarkdown(value)}`)
  }
  push("About", o.introduction)
  push("What you'll do", o.whatWillYouDo)
  if (o.responsibilities && o.responsibilities.length) {
    parts.push(
      "## Responsibilities\n" +
        o.responsibilities.map((r) => "- " + stripMarkdown(r)).join("\n"),
    )
  }
  push("How you'll do it", o.howWillYouDoIt)
  push("What they ask for", o.whatTheyAskFor)
  push("Who you'll work with", o.whoWillDoItWith)
  push("What they offer", o.whatOffering)
  const out = parts.join("\n\n").trim()
  return out || null
}

export function toDetail(o: RawOffer): JobDetail {
  const skills = (o.techs || [])
    .map((t) => {
      const tag = t.section ? ` (${t.section.toLowerCase()})` : ""
      return t.name ? `${t.name}${tag}` : null
    })
    .filter((s): s is string => s !== null)
  const languages = (o.languages || [])
    .map((l) => (l.name ? `${l.name}${l.level ? ` (${l.level})` : ""}` : null))
    .filter((s): s is string => s !== null)
  return {
    ...toResult(o),
    description: buildDescription(o),
    skills,
    languages,
    companyUrl: o.company?.web ?? null,
  }
}

// ── Client-side filters ─────────────────────────────────────────────────────

/**
 * Free-text filter over position + company + highlights. The list payload does
 * NOT include the tech stack, so a tech name like "React" only matches when it
 * appears in one of those fields (documented in SKILL.md / url-reference.md).
 */
export function matchesQuery(o: RawOffer, query: string): boolean {
  const q = fold(query.trim())
  if (!q) return true
  const hay = fold(
    [o.position, o.company?.name, ...(o.highlights || [])].filter(Boolean).join(" "),
  )
  return hay.includes(q)
}

/** Location filter: substring over location strings, plus a "remote" shortcut. */
export function matchesLocation(o: RawOffer, loc: string): boolean {
  const l = fold(loc.trim())
  if (!l) return true
  if (/^(remote|remoto)$/.test(l)) return o.remotePercentage === 100
  const hay = fold((o.locations || []).join(" "))
  if (hay.includes(l)) return true
  // "remote" mentioned inside a longer query still matches fully-remote offers.
  if (l.includes("remote") && o.remotePercentage === 100) return true
  return false
}

/** Keep offers whose updatedAt is within `days` of now. */
export function withinJobAge(o: RawOffer, days: number): boolean {
  if (!days || days <= 0 || days >= 9999) return true
  if (!o.updatedAt) return false
  const t = Date.parse(o.updatedAt)
  if (isNaN(t)) return false
  return Date.now() - t <= days * 86400 * 1000
}

/** Only surface active offers. */
export function isActive(o: RawOffer): boolean {
  return (o.status ?? "ACTIVE").toUpperCase() === "ACTIVE"
}

// ── Tech-name → id resolution ───────────────────────────────────────────────

/**
 * Resolve a query to GetManfred's numeric tech id so we can use the server-side
 * `techs=<id>` filter (the only way to match on tech stack — the offers list
 * payload omits the stack). The tech catalogue is not exposed as JSON, so we
 * read it from the `"techs":[{"value":N,"label":"..."}]` array embedded in the
 * offers page's __NEXT_DATA__. Returns the id, or `null` when the query is not a
 * known tech (callers then fall back to a client-side text filter).
 */
export async function resolveTechId(query: string): Promise<number | null> {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const html = await fetchText(
    OFFERS_PAGE_URL,
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  )
  if (!html) return null
  const block = html.match(/"techs":\[([^\]]*)\]/)
  if (!block) return null
  const entries: Array<{ id: number; label: string }> = []
  const re = /\{"value":(\d+),"label":"([^"]*)"\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(block[1])) !== null) {
    entries.push({ id: parseInt(m[1], 10), label: decodeHtmlEntities(m[2]).toLowerCase() })
  }
  const exact = entries.find((e) => e.label === q)
  return exact ? exact.id : null
}

/** Build the offers list URL, optionally filtered by a tech id. */
export function offersListUrl(techId?: number | null): string {
  const base = `${OFFERS_URL}?lang=EN`
  return techId ? `${base}&techs=${techId}` : base
}

/** Extract a numeric offer id from a bare id, an offer URL, or a slug path. */
export function normalizeId(input: string): string | null {
  const bare = input.match(/^\d+$/)
  if (bare) return input
  const m = input.match(/ofertas-empleo\/(\d+)/) || input.match(/\/(\d{2,})(?:\/|$)/)
  return m ? m[1] : null
}
