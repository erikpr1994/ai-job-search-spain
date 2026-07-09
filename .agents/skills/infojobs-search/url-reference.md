# InfoJobs URL Reference

Public, unauthenticated, **server-rendered** pages used by this skill. Market:
Spain. The job cards and offer detail are present in the initial HTML response —
no XHR/JSON API call, no login, no captcha as of the last check (2026-07).

> Personal use only — automated access is restricted by InfoJobs' Terms of Service; keep volume low.

## robots.txt (relevant lines, `User-agent: *`)

- `/jobsearch/search-results/list.xhtml` — **allowed** for `*` (only disallowed for `LinkedInBot`). This is the search endpoint the skill uses.
- `/ver-oferta.xhtml` — disallowed. Internal offer path; the skill does **not** use it.
- Offer detail pretty path `/<seg>/<seg>/of-i<hex>` — not disallowed and used by the skill.
- `Disallow: /*applicationOrigin=*` — the search result links carry `?applicationOrigin=...`; the skill strips all query strings from stored/fetched URLs, so it stays compliant.

## Search

```
GET https://www.infojobs.net/jobsearch/search-results/list.xhtml
```

Query params:

| Param | Meaning | Example |
|-------|---------|---------|
| `keyword` | Free-text query (title, skill, role) | `React` |
| `sinceDate` | Posted-within window (bucketed) | `_24_HOURS` · `_7_DAYS` · `_15_DAYS` |
| `page` | 1-indexed page (~5 offers/page) | `1`, `2`, `3`, … |

`sinceDate` valid tokens are exactly `_24_HOURS`, `_7_DAYS`, `_15_DAYS` (there is
no 30-day bucket; omit the param for "all"). **Only these tokens are valid** —
an unknown token breaks the page (no cards rendered), so the CLI sends only these.

Returns an HTML list of offer cards. Each real offer card owns a unique
`id="job-title-<hex>"` anchor; the CLI splits on that marker and parses each card
independently. Ad banners lack the marker and are skipped.

Per-card fields:

| Field | Source in HTML |
|-------|----------------|
| `id` | `id="job-title-<hex>"` (lowercase hex) |
| `title` | `<span class="ij-OfferCardContent-description-title-link">…</span>` (fallback: the `aria-label` on `ij-OfferCardContent-description-link`) |
| `url` | `href` on `a.ij-OfferCardContent-description-link` → `//www.infojobs.net/<loc>/<slug>/of-i<hex>` (query stripped, `https:` prepended) |
| `company` / `companyUrl` | `h3.ij-OfferCardContent-description-subtitle` inner `<a>` text / href |
| `location` | first `span.ij-OfferCardContent-description-list-item-truncate` |
| `modality` | plain `li.ij-OfferCardContent-description-list-item` (e.g. `Solo teletrabajo`, `Presencial`) |
| `date` | `span.ij-FormatterSincedate…` (relative Spanish, e.g. `Hace 4d`) |

### Location filtering (not implemented)

InfoJobs filters by `provinceIds=<n>` where `<n>` is an internal numeric province
id. That id list is not surfaced on the public search page and does **not** follow
the official INE province codes (observed: `provinceIds=41` did not map to Sevilla),
so it cannot be mapped from a place name without InfoJobs' own lookup table. To
avoid shipping a wrong/misleading filter, the CLI omits `--location`. Narrow by
adding a place term to `keyword` instead.

## Detail

```
GET https://www.infojobs.net/<seg1>/<seg2>/of-i<hex>
```

The offer detail requires **two path segments** before `of-i<hex>`; the segments
themselves are ignored by the server, so the CLI uses `/empleo/empleo/of-i<hex>`
for a bare id (or the original URL when the caller passes one). A one-segment or
missing-segment path does **not** serve the offer, and an unknown/expired id
returns a 302 to a landing page with no offer title.

Per-offer fields:

| Field | Source in HTML |
|-------|----------------|
| `title` | `h1.ij-Heading-title1` |
| `company` / `companyUrl` | `div.ij-OfferDetailHeader-companyLogo-companyName` inner `<a>` |
| `location` | first `div.ij-OfferDetailHeader-detailsList-item` `<p>` |
| `details[]` | all `ij-OfferDetailHeader-detailsList-item` `<p>` chips (location, modality, contract, hours, salary…) |
| `description` | text between the `Descripción` `<h3>` and its closing `</article>` (paragraph/list breaks kept as newlines) |

## Notes

- No authentication required; content is fully server-rendered.
- Respect rate limits — the CLI backs off on 429/5xx with jitter and returns `null`/`NOT_FOUND` on a 404 or unresolved (302) offer.
- All values are Spanish (Spain market).
