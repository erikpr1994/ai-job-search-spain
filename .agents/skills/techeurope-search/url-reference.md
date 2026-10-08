# {Tech: Europe} Jobs Reference

Public pages used by this skill. robots.txt disallows `/api`, so the skill does not use it.

## Sitemap

```
GET https://jobs.techeurope.io/sitemap.xml
```

One `<url>` per job: `<loc>https://jobs.techeurope.io/jobs/<slug></loc>` and `<lastmod>`.
The slug is `<company>-<title>-<location>-<id>`, all lowercase and hyphenated.

## Job page

```
GET https://jobs.techeurope.io/jobs/<slug>
```

Holds one `<script type="application/ld+json">` schema.org `JobPosting`:

| Field | Meaning |
|-------|---------|
| `title` | Job title |
| `description` | Short summary written by the board |
| `datePosted` | ISO posting date |
| `hiringOrganization.name` / `.sameAs` | Company name and website |
| `jobLocation.address.addressLocality` | City or region |
| `url` | Employer apply link (Ashby, Greenhouse, etc.) |
