# GetManfred API Reference

GetManfred (https://www.getmanfred.com) is a curated Spanish/remote tech job board
with transparent salary ranges. The website is a Next.js SPA, but the offer data is
served by a **public JSON API** (no authentication) — this skill uses that API
directly rather than scraping the client-rendered HTML.

`robots.txt` allows all user agents (`Allow: /`).

## List / search

```
GET https://www.getmanfred.com/api/v2/public/offers?lang=EN
```

- `lang` is **required** — must be `EN` or `ES` (a missing/invalid value returns HTTP 400).
- Returns a **flat JSON array of offers** (~1600 items, ~2 MB — active + recently
  closed). There is **no server-side free-text, location, or pagination parameter**;
  the SPA fetches the whole list and filters client-side, so this skill does the same
  (`--location`, `--jobage`, `--page`, `--limit` are applied locally, and non-tech
  `--query` text is matched client-side).
- The **one** server-side filter is `&techs=<id>` — a numeric GetManfred tech id
  (e.g. `17` = React). It narrows the response to offers whose stack includes that
  tech (this is how the skill answers a tech-name query, since the stack is absent
  from the list payload). It accepts a single id; note it includes recently-closed
  offers, so the CLI still filters to `status === "ACTIVE"`.

### Tech name → id map

No public JSON endpoint exposes the tech catalogue. The name→id map lives in the
`"techs":[{"value":<id>,"label":"<name>"}]` array embedded in the offers page's
`__NEXT_DATA__` script:

```
GET https://www.getmanfred.com/ofertas-empleo   (parse __NEXT_DATA__ → props.pageProps.techs)
```

The CLI fetches this once per search, regex-extracts the array, and resolves an
exact (case-insensitive) label match to its id. Unmatched queries fall back to the
client-side text filter.

Per-offer fields used (list payload):

| Field | Maps to | Notes |
|-------|---------|-------|
| `id` | `id` | numeric offer id |
| `position` | `title` | job title |
| `slug` | (url) | used to build the public offer URL |
| `company.name` | `company` | |
| `company.web` | `companyUrl` (detail) | employer site |
| `locations` | `location` | array of `"City, Country"` strings; empty ⇒ `"Remote"` when `remotePercentage === 100`, else `null` |
| `remotePercentage` | `remote` | 0–100 |
| `salaryFrom` / `salaryTo` / `currency` | `salary` | `0` means "unset" ⇒ `salary` is `null` |
| `isFreelance` / `feeRateFrom` / `feeRateTo` | `salary` | freelance offers report a daily fee instead |
| `updatedAt` | `date` | ISO timestamp; used for `--jobage` |
| `highlights` | (query match) | short perk/culture tags |
| `status` | filter | only `ACTIVE` offers are surfaced |

**Important:** the list payload does **not** contain the tech stack. A tech name like
`"React"` only matches when it appears in `position`/`company`/`highlights`. Use the
detail endpoint to read the full stack.

## Detail

```
GET https://www.getmanfred.com/api/v2/public/offers/<id>?lang=EN
```

- `<id>` must be numeric (a slug returns HTTP 400). A missing/invalid offer id
  returns **HTTP 500 with the body `"Internal Server Error (Asgard API)"`** (not a
  404); the CLI treats that specific sentinel as "not found" (no retries) and any
  other 500 as a transient error worth retrying.
- Returns the full offer object. Content sections are **Markdown in the offer's
  original language** (usually Spanish); the CLI strips the Markdown for `plain` output.

Extra detail-only fields used:

| Field | Maps to | Notes |
|-------|---------|-------|
| `introduction`, `whatWillYouDo`, `responsibilities[]`, `howWillYouDoIt`, `whatTheyAskFor`, `whoWillDoItWith`, `whatOffering` | `description` | assembled into one readable block |
| `techs[]` (`name`, `level`, `section` MUST/NICE) | `skills` | the tech stack, absent from the list payload |
| `languages[]` (`name`, `level`) | `languages` | required spoken languages |

## Public offer URL

```
https://www.getmanfred.com/ofertas-empleo/<id>/<slug>
```

## Notes

- No authentication required; the API is what the public site calls.
- The CLI sends a browser User-Agent and backs off with jitter on 429/5xx.
- Because the list endpoint returns everything in one ~2 MB response, keep request
  volume low — one search fetches the whole catalogue.
