# Tecnoempleo URL Reference

Public, unauthenticated pages on `https://www.tecnoempleo.com` used by this
skill. Market: **Spain**. Language: **Spanish**.

> **Personal use only.** `robots.txt` explicitly disallows Anthropic/Claude
> crawlers (see below). Keep volume low; use only for your own manual search.

## robots.txt findings

`https://www.tecnoempleo.com/robots.txt` (checked 2026-07):

- `User-agent: *` — **does not** disallow the search or detail paths this skill
  uses. It disallows internal/utility paths (`/profesionales/`, `/politicas/`,
  `/accesoempresa.php`, `/_ajax/…`, `/matomo/`, `/alertas-empleo-rss.php`,
  `/demanda-trabajo-informatica.php?`, etc.).
- **Anthropic / Claude are explicitly blocked**: `AnthropicBot`, `Claude`,
  `ClaudeBot`, `anthropic-ai`, `Claude-Web`, `Claude-SearchBot` each get
  `Disallow: /`. `GPTBot` is also fully disallowed. `Bingbot` has `Crawl-delay: 5`.
- No login is required to view search results or job details.

Conclusion: listings are public (no auth wall), so the tool works, but the site
does not want AI crawlers. This is treated as a **policy restriction**, hence the
prominent "Personal use only" section in SKILL.md — not a hard block.

## Search

```
GET https://www.tecnoempleo.com/ofertas-trabajo/?te=<keywords>[&pr=<code>][&ult_24h=1][&pagina=<n>]
```

Query params:

| Param | Meaning | Example |
|-------|---------|---------|
| `te` | Free-text keyword (title / skill / tech) | `React`, `Java`, `DevOps` |
| `pr` | Province code (location filter) | `263` = Madrid, `240` = Barcelona |
| `ult_24h` | Only postings from the last 24h | `1` |
| `pagina` | Page number (1-indexed, 30 results/page) | `2`, `3`, … |

Notes:
- There is also a clean SEO form of the query path, e.g.
  `https://www.tecnoempleo.com/ofertas-trabajo/react` (equivalent to `?te=react`).
- Province codes are **not** memorable; the CLI ships a name→code table
  (`PROVINCES` in `helpers.ts`) so users pass `--location "Madrid"`. Codes range
  231–282 across Spain's 52 provinces.
- The site has **no arbitrary N-day age filter** — only `ult_24h`. The CLI
  applies `--jobage 7/14/30` client-side by parsing each card's `DD/MM/YYYY`
  posting date.

### Result-card anchors (search HTML)

Each result opens with `<a name="rf-<id>"></a>` followed by a clickable
`<div class="p-3 border rounded …" onclick="location.href='<detail-url>'">`.
Per card:

| Field | Source |
|-------|--------|
| `id` | `<a name="rf-<hexid>">` — a 20-char hex reference |
| `url` | the `onclick="location.href='…'"` target (full detail URL) |
| `title` | `<h3 …><a … title="<Title>">` (title attribute; text is a fallback) |
| `company` / `companyUrl` | `<a title="Ofertas de Empleo <Name>" href="<url>">` |
| `location` / `modality` | mobile summary span: `<b>Location</b> (Modality)` (`"100% remoto"` ⇒ modality, no location) |
| `date` | `DD/MM/YYYY` in the same summary span |

Total count is read from the results heading: `<h1>121 Ofertas Trabajo de React</h1>`.

## Detail

The canonical detail URL is `/(<slug1>)/(<slug2>)/rf-<id>`, e.g.
`https://www.tecnoempleo.com/senior-fullstack-engineer-react-nodejs-zooplus-se/typescript/rf-d97516df323a73b22543`.

Resolving by id alone: the two slug segments are **decorative** — any two
placeholder segments resolve to the same page (the site canonicalizes via
`og:url`). The CLI reconstructs `https://www.tecnoempleo.com/oferta/detalle/rf-<id>`
for a bare id. A **single**-segment path (`/ofertas-trabajo/rf-<id>`) does NOT
work — it is treated as a keyword search — so two segments are required.

### Detail-page fields

The detail page embeds a `schema.org/JobPosting` **JSON-LD** block, which is the
authoritative source for structured metadata, plus a human-readable info panel:

| Field | Source |
|-------|--------|
| `title` | `<h1 itemprop="title">` (JSON-LD `title` fallback) |
| `company` | JSON-LD `hiringOrganization.name` (`/re-<n>` link is a logo with no text) |
| `companyUrl` | the `/re-<n>` employer-profile link |
| `location` / `modality` | info panel `Ubicación: <Place> (<Modality>)`; JSON-LD `jobLocation.address.addressLocality` fallback |
| `date` | JSON-LD `datePosted` (ISO), or a `DD/MM/YYYY` on the page |
| `deadline` | JSON-LD `validThrough` (often absent → `null`) |
| `employmentType` | JSON-LD `employmentType` code → Spanish label; else info `Jornada` |
| `contractType` | info panel `Tipo contrato` (e.g. `Indefinido`) |
| `experience` | info panel `Experiencia` (e.g. `3-5 años`) |
| `functions` | info panel `Funciones` (e.g. `Programador`) |
| `technologies` | the job's own tag links (before the site-wide "Tecnologías más demandadas" cloud) |
| `salary` | info panel `Salario` when present (often absent → `null`) |
| `description` | `<div itemprop="description">` rendered to plain text; JSON-LD `description` fallback |
| `applyUrl` | the "Inscribirme" form action (login-gated apply endpoint) |

## Notes

- No authentication required to read search or detail pages.
- Respect rate limits — the CLI backs off on 429/5xx and returns `""` on 404.
- Spain-specific: province filtering via `pr`; keyword via `te`.
