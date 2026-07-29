# Joppy URL Reference

Public, unauthenticated pages on `https://www.joppy.me` used by this skill.
Market: **Spain**. Languages: **Spanish and English** (postings are mixed).

This is the file to consult when Joppy changes its markup — it records the exact
anchors the parsers depend on.

## Domain note

The real product is at **`joppy.me`**, not `joppy.com`. `joppy.com` is a parked
domain listed for sale on GoDaddy (its `/llms.txt` says so outright) and serves a
114-byte redirect stub to `/lander`. Do not point the CLI at it.

## robots.txt findings

`https://www.joppy.me/robots.txt` (checked 2026-07):

```
User-agent: *
Allow: /
Sitemap: https://www.joppy.me/sitemap.xml
```

No path is disallowed, no AI-crawler-specific rules, and no login is required to
read the company directory or job pages. **No personal-use warning is required
for this skill** — unlike `tecnoempleo-search`, whose robots.txt explicitly
blocks Claude. Volume politeness is still warranted (see "Request budget").

## Architecture: why there is no search endpoint

Joppy is a swipe/match app. The candidate-facing job search lives behind the
login at `app.joppy.me` and is **not** publicly queryable. What is public is the
SEO-oriented company directory, which happens to embed complete job records.

So `search` is implemented as: **enumerate → scan → filter locally**.

## 1. Sitemap (the job index)

```
GET https://www.joppy.me/sitemap.xml            → sitemap index
GET https://www.joppy.me/sitemap.directory.xml  → companies + jobs
```

`sitemap.xml` indexes three children: `sitemap.static.xml` (marketing pages),
`sitemap.directory.xml` (**the one we use**), and `sitemap.newsletters.xml`.

`sitemap.directory.xml` contains two URL shapes:

| Shape | Meaning |
|-------|---------|
| `/companies/<slug>` | Company profile page (~194 entries) |
| `/companies/<slug>/<uid>` | **A single job posting** (~82 entries, ~37 distinct companies) |

Every job entry carries a `<lastmod>` ISO-8601 timestamp, and they are distinct
per job — this is the **only** public source of a date for a posting, and it is
what the CLI reports as `date`. It reflects last modification, not first
publication.

`parseSitemap` in `helpers.ts` splits on `<url>` and keeps only locs matching
`/companies/<slug>/<uid>`.

## 2. Company page (the job payload)

```
GET https://www.joppy.me/companies/<slug>
```

A Next.js page. **All of the company's open jobs are embedded in full** — not
truncated summaries — inside the `__NEXT_DATA__` script tag:

```
<script id="__NEXT_DATA__" type="application/json">{ … }</script>
```

Path to the data: `props.pageProps.company`, with `company.jobs[]` being the
array of complete job objects. `props.pageProps.messages` is the i18n bundle and
is ignored.

Because the payload is real JSON, parsing does **not** depend on CSS classes or
rendered markup — far more stable than typical HTML scraping. The regex only has
to find the script tag.

### `company` fields used

| Field | Notes |
|-------|-------|
| `name` | Company name (occasionally carries a stray zero-width character; stripped) |
| `slug` | URL segment |
| `location` | Fallback when the job has no `place` |
| `description` | HTML; rendered to text as `companyDescription` |
| `jobs[]` | The job objects below |

### `job` fields used

| Field | Type | Maps to |
|-------|------|---------|
| `uid` | UUID | `id` |
| `title` | string | `title` |
| `description` | HTML string | `description` (rendered to text) |
| `hiringProcess` | HTML string | `hiringProcess` (rendered to text) |
| `isSalaryPublic` | bool | gates `salaryMin`/`salaryMax` |
| `salaryMin` / `salaryMax` | number | EUR gross annual |
| `skills[]` | `{ name, isMandatory }` | `skills` + `mandatorySkills` |
| `specialities[]` | string[] | `specialities` (e.g. `"Frontend"`) |
| `place` | `{ isRemote, isHybrid, isOffice, located, officeDays, cities[] }` | `location` + `modality` |
| `languages[]` | `{ name, level }` | `languages`, level indexed into a label list |
| `onlyEuCandidates` / `sponsorVisa` / `relocationPack` | bool | passed through |
| `isLite` | bool | unused |

`place.located` is free text (e.g. `"Madrid, Barcelona o Zona norte de España"`),
so location filtering is a substring match, not a code lookup. `place.cities` has
been observed empty; the parser tolerates both strings and `{ name }` objects.

Language `level` is an index into:
`["don't know", "basic", "intermediate", "advanced", "fluent", "native"]`
(confirmed against the i18n bundle's `languages` block).

## 3. Job detail page

```
GET https://www.joppy.me/companies/<slug>/<uid>
```

Serves the same job object at `props.pageProps.job`, plus `pageProps.company`.
**The CLI does not normally fetch this page** — the company page already carries
every field, so `detail` reads from the cached corpus, or fetches the one company
page when the cache is cold.

## 4. Apply link

```
https://app.joppy.me/job/<uid>/web?utm_source=joppy&utm_medium=web&utm_campaign=ats
```

Deterministic from the uid, so the CLI constructs it rather than parsing it.
Applying requires a Joppy account.

## Dead ends (do not retry these)

- **`/_next/data/<buildId>/companies/<slug>.json`** returns a 404 HTML page. The
  directory pages are server-rendered, so the Next.js data route is not
  available. Use the `__NEXT_DATA__` blob in the HTML instead.
- **`/companies?page=N`** — the `/companies` page paginates its `companies` prop
  (`{ page, per_page: 12, total: 193, total_pages: 17, data[] }`), but the
  sitemap already lists every company that has jobs, so paging the directory is
  unnecessary and costs 17 requests instead of 1.
- **`joppy.com`** — parked domain for sale, not the product.

## Request budget

A cold search is **1 sitemap request + ~37 company pages ≈ 38 requests, ~6 MB,
~3 seconds** at concurrency 5. The parsed corpus is cached at
`<tmpdir>/joppy-search-corpus.json` for **30 minutes**, so repeat searches and
`detail` lookups cost zero requests. `--refresh` forces a re-scan; use sparingly.

Failures are handled per-company: a company page that errors is skipped, and the
scan only fails outright if the sitemap is unreachable or no jobs parse at all
(which would signal a markup change).
