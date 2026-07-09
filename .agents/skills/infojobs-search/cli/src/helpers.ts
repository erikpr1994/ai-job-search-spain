// Data source: InfoJobs public server-rendered search + offer pages
// (https://www.infojobs.net). No authentication required — the job cards are
// present in the initial HTML response. We parse with regex: the markup is
// verbose but the class hooks (ij-OfferCardContent*, ij-OfferDetailHeader*) are
// stable, and a full DOM parser would be overkill for a zero-dependency CLI.
//
// Personal use only — automated access is restricted by InfoJobs' Terms of
// Service. Keep volume low; do not use commercially or for bulk collection.

export const SEARCH_URL =
  "https://www.infojobs.net/jobsearch/search-results/list.xhtml"
// Offer detail requires two path segments before the of-i<hex> id; the segments
// themselves are ignored by the server, so placeholders resolve to the real offer.
export const DETAIL_BASE = "https://www.infojobs.net/empleo/empleo"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/** Fetch HTML with exponential backoff + jitter on 429/5xx. Returns "" on a 404. */
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

export interface JobCard {
  id: string
  title: string
  company: string | null
  companyUrl: string | null
  location: string | null
  modality: string | null
  date: string | null
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
  details: string[]
  applyUrl: string | null
}

/**
 * Convert a Unicode code point to a string. Uses `fromCodePoint` (not
 * `fromCharCode`) so supplementary-plane code points (e.g. emoji, U+1F600)
 * decode correctly, and drops out-of-range values instead of throwing.
 */
function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    // Numeric character references: decimal (&#233;) and hexadecimal (&#xE9;).
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

/** Normalize an InfoJobs href to an absolute https URL with the query stripped. */
function normalizeUrl(href: string): string {
  let u = decodeHtmlEntities(href).split("?")[0].trim()
  if (u.startsWith("//")) u = "https:" + u
  else if (u.startsWith("/")) u = "https://www.infojobs.net" + u
  return u
}

/** Extract the hex offer id (of-i<hex>) from a URL, an of-i token, or bare hex. */
export function extractOfferId(input: string): string | null {
  const m = input.match(/of-i([0-9a-f]+)/i)
  if (m) return m[1].toLowerCase()
  const bare = input.match(/^[0-9a-f]{20,}$/i)
  return bare ? input.toLowerCase() : null
}

/**
 * Parse the search response: a list of offer cards. Each real offer card owns a
 * unique `id="job-title-<hex>"` anchor, so we split on that marker and parse
 * each chunk independently — one malformed card cannot break the rest, and ad
 * banners (which lack the marker) are skipped for free.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/id="job-title-/).slice(1)

  for (const chunk of chunks) {
    const idMatch = chunk.match(/^([0-9a-f]+)"/i)
    if (!idMatch) continue
    const id = idMatch[1].toLowerCase()

    // Title link (carries the offer URL) + visible title span.
    const linkMatch = chunk.match(
      /class="ij-OfferCardContent-description-link[^"]*"[^>]*href="([^"]+)"/i,
    )
    const url = linkMatch
      ? normalizeUrl(linkMatch[1])
      : `${DETAIL_BASE}/of-i${id}`

    let title: string | null = null
    const titleSpan = chunk.match(
      /class="ij-OfferCardContent-description-title-link"[^>]*>([\s\S]*?)<\/span>/i,
    )
    if (titleSpan) title = clean(titleSpan[1]) || null
    if (!title) {
      const aria = chunk.match(
        /class="ij-OfferCardContent-description-link[^"]*"[^>]*aria-label="([^"]*)"/i,
      )
      if (aria) title = decodeHtmlEntities(aria[1]) || null
    }
    if (!title) continue

    // Company subtitle (may be absent when the employer is hidden).
    let company: string | null = null
    let companyUrl: string | null = null
    const sub = chunk.match(
      /class="ij-OfferCardContent-description-subtitle"[^>]*>([\s\S]*?)<\/h3>/i,
    )
    if (sub) {
      const a = sub[1].match(/href="([^"]+)"/i)
      if (a) companyUrl = normalizeUrl(a[1])
      company = clean(sub[1]) || null
    }

    // First list item = location; the "since date" tag holds the relative date.
    const loc = chunk.match(
      /class="ij-OfferCardContent-description-list-item-truncate"[^>]*>([\s\S]*?)<\/span>/i,
    )
    const location = loc ? clean(loc[1]) || null : null

    // Modality (e.g. "Solo teletrabajo", "Presencial") is the plain list item
    // that follows the truncated location, before the since-date tag.
    let modality: string | null = null
    const listItems = [
      ...chunk.matchAll(
        /class="ij-OfferCardContent-description-list-item"[^>]*>([\s\S]*?)<\/li>/gi,
      ),
    ]
    for (const li of listItems) {
      const text = clean(li[1])
      if (text && !/truncate|FormatterSincedate/i.test(li[1]) && text !== location) {
        modality = text
        break
      }
    }

    const dt = chunk.match(
      /class="ij-FormatterSincedate[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
    )
    const date = dt ? clean(dt[1]) || null : null

    results.push({ id, title, company, companyUrl, location, modality, date, url })
  }

  return results
}

/** Parse the single-offer detail page. */
export function parseJobDetail(html: string, id: string, url: string): JobDetail | null {
  const titleMatch = html.match(/class="[^"]*ij-Heading-title1[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)
  const title = titleMatch ? clean(titleMatch[1]) : null
  // No title => the offer id did not resolve (expired / not found / redirect).
  if (!title) return null

  const orgMatch = html.match(
    /class="[^"]*ij-OfferDetailHeader-companyLogo-companyName[^"]*"[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
  )
  const company = orgMatch ? clean(orgMatch[2]) || null : null
  const companyUrl = orgMatch ? normalizeUrl(orgMatch[1]) : null

  // Header detail chips: location, modality, contract, hours, salary, ...
  const details: string[] = []
  const itemRe =
    /class="[^"]*ij-OfferDetailHeader-detailsList-item[^"]*"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi
  let im: RegExpExecArray | null
  while ((im = itemRe.exec(html)) !== null) {
    const text = clean(im[1])
    if (text) details.push(text)
  }
  const location = details.length ? details[0] : null

  // Description block: everything between the "Descripción" heading and the end
  // of its <article>. Preserve paragraph/list breaks as newlines.
  let description: string | null = null
  const descMatch = html.match(/Descripci[oó]n<\/h3>([\s\S]*?)<\/article>/i)
  if (descMatch) {
    const withBreaks = descMatch[1]
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
    description =
      decodeHtmlEntities(stripTags(withBreaks)).replace(/\n{3,}/g, "\n\n").trim() || null
  }

  const applyMatch = html.match(/href="([^"]*(?:apply|inscri)[^"]*)"/i)
  const applyUrl = applyMatch ? normalizeUrl(applyMatch[1]) : null

  return {
    id,
    title,
    company,
    companyUrl,
    location,
    modality: details.length > 1 ? details[1] : null,
    date: null,
    url,
    description,
    details,
    applyUrl,
  }
}

/**
 * Map a job-age in days to InfoJobs' `sinceDate` bucket. The site exposes only
 * three windows (24h / 7d / 15d); anything larger means "no filter".
 */
export function jobageToSinceDate(days: number): string | null {
  if (!days || days <= 0 || days >= 9999) return null
  if (days <= 1) return "_24_HOURS"
  if (days <= 7) return "_7_DAYS"
  if (days <= 15) return "_15_DAYS"
  return null
}
