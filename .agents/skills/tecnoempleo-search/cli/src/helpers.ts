// Data source: Tecnoempleo.com public job pages (Spanish tech job board).
// No authentication required. The search page returns a flat list of job
// cards; the detail page embeds a schema.org JobPosting JSON-LD block plus a
// human-readable info panel. We parse both with regex — the markup is shallow
// and stable, and a full DOM parser (node-html-parser) has known nesting bugs
// on cards that contain unclosed tags inside onclick wrappers.
//
// Personal use only. See SKILL.md — tecnoempleo.com's robots.txt explicitly
// disallows Anthropic/Claude crawlers, so keep volume low, do not run this at
// scale, and use it only for your own manual job search.

export const BASE_URL = "https://www.tecnoempleo.com"
export const SEARCH_PATH = "/ofertas-trabajo/"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/** Abort a stalled board request instead of hanging the CLI indefinitely. */
export const REQUEST_TIMEOUT_MS = 15000

/**
 * Fetch HTML with exponential backoff + jitter on 429/5xx. Returns "" on 404
 * (so callers can distinguish "not found" from a hard error).
 */
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
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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

// ---------------------------------------------------------------------------
// HTML entity decoding + tag stripping
// ---------------------------------------------------------------------------

/**
 * Convert a Unicode code point to a string. Uses `fromCodePoint` (not
 * `fromCharCode`) so supplementary-plane code points (e.g. emoji, U+1F600)
 * decode correctly, and drops out-of-range values instead of throwing.
 */
function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export interface JobDetail {
  id: string
  title: string
  company: string | null
  companyUrl: string | null
  location: string | null
  modality: string | null
  date: string | null
  deadline: string | null
  employmentType: string | null
  workingHours: string | null
  experience: string | null
  contractType: string | null
  functions: string | null
  technologies: string[]
  salary: string | null
  description: string | null
  applyUrl: string | null
  url: string
}

// ---------------------------------------------------------------------------
// ID / URL helpers
// ---------------------------------------------------------------------------

/** Extract the hex reference id (rf-<hex>) from a detail URL or raw id. */
export function idFromUrl(input: string): string | null {
  const rf = input.match(/rf-([0-9a-fA-F]+)/)
  if (rf) return rf[1]
  const bare = input.match(/^([0-9a-fA-F]{12,})$/)
  return bare ? bare[1] : null
}

/**
 * A detail URL that resolves for any offer given only its id. Tecnoempleo
 * serves the offer at `/<slug1>/<slug2>/rf-<id>`, where the two slug segments
 * are decorative — any placeholders resolve to the same page. A single-segment
 * path (e.g. /ofertas-trabajo/rf-<id>) is instead treated as a keyword search,
 * so we always emit two placeholder segments.
 */
export function detailUrl(id: string): string {
  return `${BASE_URL}/oferta/detalle/rf-${id}`
}

// ---------------------------------------------------------------------------
// Search-page parsing
// ---------------------------------------------------------------------------

/** Total number of matching offers, from the results heading. */
export function parseHitCount(html: string): number {
  const m = html.match(/<h1[^>]*>\s*([\d.]+)\s+Ofertas/i)
  if (!m) return 0
  return parseInt(m[1].replace(/\./g, ""), 10) || 0
}

/**
 * Parse the search results page into job cards. We split on the per-result
 * anchor `<a name="rf-<id>">` and parse each chunk independently, so one
 * malformed card cannot break the rest.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/<a name="rf-/).slice(1)

  for (const chunk of chunks) {
    const idMatch = chunk.match(/^([0-9a-fA-F]+)"/)
    if (!idMatch) continue
    const id = idMatch[1]

    // Detail URL: the card's onclick wrapper, falling back to the title anchor.
    let url =
      chunk.match(/onclick="location\.href='([^']+)'"/)?.[1] ??
      chunk.match(/<h3[^>]*>\s*<a[^>]+href="([^"]+)"/i)?.[1] ??
      detailUrl(id)
    url = decodeHtmlEntities(url)

    // Title: prefer the anchor's title attribute, fall back to its text.
    const titleAttr = chunk.match(/<h3[^>]*>\s*<a[^>]+title="([^"]+)"/i)
    let title = titleAttr ? decodeHtmlEntities(titleAttr[1]) : ""
    if (!title) {
      const inner = chunk.match(/<h3[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i)
      title = inner ? clean(inner[1]) : ""
    }
    if (!title) continue

    // Company: the "Ofertas de Empleo <name>" link.
    const comp = chunk.match(/<a title="Ofertas de Empleo ([^"]*)" href="([^"]+)"/i)
    const company = comp ? decodeHtmlEntities(comp[1]).trim() || null : null
    const companyUrl = comp ? decodeHtmlEntities(comp[2]) : null

    // Location + modality + date live in the mobile summary span.
    let location: string | null = null
    let modality: string | null = null
    let date: string | null = null
    const span = chunk.match(/<span class="d-block d-lg-none[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
    if (span) {
      const s = span[1]
      const b = s.match(/<b>([^<]+)<\/b>/)
      const rawLoc = b ? decodeHtmlEntities(b[1]).trim() : null
      const paren = s.match(/\(([^)]+)\)/)
      modality = paren ? decodeHtmlEntities(paren[1]).trim() : null
      // "100% remoto" / "En remoto" is a modality, not a place.
      if (rawLoc && /remoto/i.test(rawLoc) && !modality) {
        modality = rawLoc
        location = null
      } else {
        location = rawLoc
      }
      const d = s.match(/(\d{2}\/\d{2}\/\d{4})/)
      date = d ? d[1] : null
    }

    results.push({ id, title, company, companyUrl, location, modality, date, url })
  }

  return results
}

// ---------------------------------------------------------------------------
// Detail-page parsing
// ---------------------------------------------------------------------------

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: "Jornada completa",
  PART_TIME: "Jornada parcial",
  CONTRACTOR: "Contratista",
  TEMPORARY: "Temporal",
  INTERN: "Prácticas",
  OTHER: "Otro",
}

/** Pull the schema.org JobPosting JSON-LD block, if present. */
function parseJsonLd(html: string): any | null {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)]
  for (const b of blocks) {
    try {
      const data = JSON.parse(b[1])
      const type = data["@type"]
      if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) {
        return data
      }
    } catch {
      // Ignore malformed JSON-LD and fall back to HTML parsing.
    }
  }
  return null
}

/** Convert an HTML fragment into readable multi-line plain text. */
function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  return decodeHtmlEntities(stripTags(withBreaks))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function parseJobDetail(html: string, id: string): JobDetail {
  const ld = parseJsonLd(html)

  // Title.
  const titleHtml = html.match(/<h1[^>]*itemprop="title"[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  let title = titleHtml ? clean(titleHtml) : ""
  if (!title && ld?.title) title = String(ld.title)

  // Company: the JSON-LD hiringOrganization is authoritative (the employer's
  // /re-<n> profile link on the page is a logo with no text). companyUrl comes
  // from that /re-<n> link when present.
  let company: string | null = ld?.hiringOrganization?.name
    ? String(ld.hiringOrganization.name).trim() || null
    : null
  const compLink = html.match(/href="([^"]*\/re-\d+)"/i)
  const companyUrl = compLink ? decodeHtmlEntities(compLink[1]) : null
  if (!company) {
    const compText = html.match(/<a[^>]+href="[^"]*\/re-\d+"[^>]*>([\s\S]*?)<\/a>/i)
    if (compText) company = clean(compText[1]) || null
  }
  if (!company) {
    const nameM = html.match(/itemprop="name"[^>]*>([\s\S]*?)<\/[a-z0-9]+>/i)
    if (nameM) company = clean(nameM[1]) || null
  }

  // Structured info panel: <li><span class="float-end">VALUE</span> LABEL</li>.
  const info: Record<string, string> = {}
  for (const li of html.matchAll(/<li class="list-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)) {
    const value = li[1].match(/float-end"?[^>]*>([\s\S]*?)<\/span>/i)?.[1]
    const spans = [...li[1].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)].map((m) => clean(m[1]))
    const label = spans.reverse().find((s) => s && s.length < 30)
    if (value && label) info[label.toLowerCase()] = clean(value)
  }

  const pick = (...keys: string[]): string | null => {
    for (const k of keys) if (info[k]) return info[k]
    return null
  }

  // Ubicación may read "Madrid (Híbrido)"; split place vs modality.
  let location: string | null = null
  let modality: string | null = null
  const ubi = pick("ubicación", "ubicacion", "localización", "localizacion")
  if (ubi) {
    const m = ubi.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
    if (m) {
      location = m[1].trim() || null
      modality = m[2].trim() || null
    } else {
      location = ubi
    }
  }
  if (!location && ld?.jobLocation?.address?.addressLocality) {
    location = String(ld.jobLocation.address.addressLocality)
  }

  // Dates.
  let date: string | null = ld?.datePosted ? String(ld.datePosted) : null
  if (!date) date = html.match(/(\d{2}\/\d{2}\/\d{4})/)?.[1] ?? null
  const deadline: string | null = ld?.validThrough ? String(ld.validThrough) : null

  // Employment type: JSON-LD code -> Spanish label, else info panel.
  let employmentType: string | null = null
  if (ld?.employmentType) {
    const code = String(ld.employmentType).toUpperCase()
    employmentType = EMPLOYMENT_TYPE_LABELS[code] ?? code
  }
  const workingHours = pick("jornada")
  if (!employmentType) employmentType = workingHours

  const contractType = pick("tipo contrato", "contrato")
  const experience = pick("experiencia")
  const functions = pick("funciones")
  const salary = pick("salario", "salario bruto anual", "sueldo")

  // Technologies: the job's own tag links, which sit in the info panel BEFORE
  // the site-wide "Tecnologías más demandadas" cloud — scan only that region so
  // we don't pick up the global cloud.
  const technologies: string[] = []
  const seen = new Set<string>()
  const cloudAt = html.search(/m[áa]s\s+demandadas/i)
  const techRegion = cloudAt > 0 ? html.slice(0, cloudAt) : html
  for (const t of techRegion.matchAll(
    /\/ofertas-trabajo\/[a-z0-9+\-.]+"[^>]*title="Ofertas de Empleo de ([^"]+)"/gi,
  )) {
    const name = decodeHtmlEntities(t[1]).trim()
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase())
      technologies.push(name)
    }
  }

  // Description: prefer the itemprop div (keeps formatting), else JSON-LD text.
  let description: string | null = null
  const descHtml = html.match(/itemprop="description"[^>]*>([\s\S]*?)<\/div>/i)?.[1]
  if (descHtml) description = htmlToText(descHtml) || null
  if (!description && ld?.description) description = htmlToText(String(ld.description)) || null

  // Apply link (the "Inscribirme" form action / redirect), if exposed.
  let applyUrl: string | null = null
  const applyForm = html.match(/<form[^>]+action="([^"]+)"[^>]*>[\s\S]{0,600}?Inscribirme/i)
  if (applyForm) {
    const href = decodeHtmlEntities(applyForm[1])
    applyUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`
  }

  // Canonical URL.
  const canonical =
    html.match(/property="og:url"[^>]+content="([^"]+)"/i)?.[1] ??
    html.match(/content="([^"]+)"[^>]+property="og:url"/i)?.[1] ??
    detailUrl(id)

  return {
    id,
    title,
    company,
    companyUrl,
    location,
    modality,
    date,
    deadline,
    employmentType,
    workingHours,
    experience,
    contractType,
    functions,
    technologies,
    salary,
    description,
    applyUrl,
    url: decodeHtmlEntities(canonical),
  }
}

// ---------------------------------------------------------------------------
// Province name -> Tecnoempleo `pr` code (for --location filtering)
// ---------------------------------------------------------------------------

export const PROVINCES: Record<string, string> = {
  "a coruña": "231",
  "alava": "232",
  "álava": "232",
  albacete: "233",
  alicante: "234",
  almeria: "235",
  almería: "235",
  asturias: "236",
  avila: "237",
  "ávila": "237",
  badajoz: "238",
  baleares: "239",
  barcelona: "240",
  bizkaia: "241",
  vizcaya: "241",
  burgos: "242",
  caceres: "243",
  "cáceres": "243",
  cadiz: "244",
  "cádiz": "244",
  cantabria: "245",
  castellon: "246",
  "castellón": "246",
  ceuta: "247",
  "ciudad real": "248",
  cordoba: "249",
  "córdoba": "249",
  cuenca: "250",
  gipuzkoa: "251",
  guipuzcoa: "251",
  "guipúzcoa": "251",
  girona: "252",
  gerona: "252",
  granada: "253",
  guadalajara: "254",
  huelva: "255",
  huesca: "256",
  jaen: "257",
  "jaén": "257",
  "la rioja": "258",
  rioja: "258",
  "las palmas": "259",
  leon: "260",
  "león": "260",
  lugo: "261",
  lleida: "262",
  lerida: "262",
  "lérida": "262",
  madrid: "263",
  malaga: "264",
  "málaga": "264",
  melilla: "265",
  murcia: "266",
  navarra: "267",
  ourense: "268",
  orense: "268",
  palencia: "269",
  pontevedra: "270",
  salamanca: "271",
  "santa cruz de tenerife": "272",
  tenerife: "272",
  "sta. cruz de tenerife": "272",
  segovia: "273",
  sevilla: "274",
  soria: "275",
  tarragona: "276",
  teruel: "277",
  toledo: "278",
  valencia: "279",
  valladolid: "280",
  zamora: "281",
  zaragoza: "282",
}

/**
 * Resolve a --location value to a `pr` province code. Accepts a province name
 * (accent-insensitive) or a raw numeric code. Returns null if unknown.
 */
export function provinceCode(input: string): string | null {
  const raw = input.trim()
  if (/^\d+$/.test(raw)) return raw
  const key = raw.toLowerCase()
  if (PROVINCES[key]) return PROVINCES[key]
  // Accent-insensitive fallback.
  const norm = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  for (const [name, code] of Object.entries(PROVINCES)) {
    if (name.normalize("NFD").replace(/[\u0300-\u036f]/g, "") === norm) return code
  }
  return null
}

/** Parse a DD/MM/YYYY or YYYY-MM-DD card date into ms epoch, or null. */
export function parseDate(date: string | null): number | null {
  if (!date) return null
  const dmy = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (dmy) return Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1])
  const ymd = date.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (ymd) return Date.UTC(+ymd[1], +ymd[2] - 1, +ymd[3])
  return null
}
