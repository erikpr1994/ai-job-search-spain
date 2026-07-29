import { describe, expect, test } from "bun:test"
import {
  extractNextData,
  filterJobs,
  fold,
  htmlToText,
  normalizeJob,
  parseCompanyPage,
  parseSitemap,
  scoreJob,
  toCard,
  type CorpusJob,
} from "../src/helpers.js"
import { normalizeId, resolvePrefix } from "../src/commands/detail.js"

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.joppy.me/companies/acme</loc><lastmod>2026-07-01T00:00:00.000Z</lastmod></url>
  <url><loc>https://www.joppy.me/companies/acme/11111111-2222-3333-4444-555555555555</loc><lastmod>2026-07-20T10:00:00.000Z</lastmod></url>
  <url><loc>https://www.joppy.me/companies/beta-co/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee</loc></url>
  <url><loc>not-a-url</loc></url>
</urlset>`

function companyHtml(payload: unknown): string {
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
    payload,
  )}</script></body></html>`
}

const JOB_RAW = {
  uid: "11111111-2222-3333-4444-555555555555",
  title: "Senior Frontend Engineer",
  description: "<p>Build things with <strong>React</strong>.</p><ul><li>TypeScript</li></ul>",
  hiringProcess: "<p>Two interviews.</p>",
  isSalaryPublic: true,
  onlyEuCandidates: true,
  sponsorVisa: false,
  relocationPack: false,
  specialities: ["Frontend"],
  skills: [
    { name: "React", isMandatory: true },
    { name: "Redux", isMandatory: false },
  ],
  place: { isRemote: false, isHybrid: true, isOffice: false, located: "Barcelona", cities: [] },
  languages: [{ name: "english", level: 4 }],
  salaryMin: 60000,
  salaryMax: 75000,
}

const COMPANY_RAW = {
  name: "Acme",
  slug: "acme",
  location: "Madrid, Spain",
  description: "<p>We are Acme.</p>",
  jobs: [JOB_RAW],
}

describe("parseSitemap", () => {
  test("keeps only job URLs and captures lastmod", () => {
    const jobs = parseSitemap(SITEMAP)
    expect(jobs).toHaveLength(2)
    expect(jobs[0]).toEqual({
      uid: "11111111-2222-3333-4444-555555555555",
      slug: "acme",
      url: "https://www.joppy.me/companies/acme/11111111-2222-3333-4444-555555555555",
      lastmod: "2026-07-20T10:00:00.000Z",
    })
  })

  test("a missing lastmod becomes null rather than being dropped", () => {
    expect(parseSitemap(SITEMAP)[1]!.lastmod).toBeNull()
  })

  test("returns an empty list on junk input instead of throwing", () => {
    expect(parseSitemap("<html>nope</html>")).toEqual([])
  })
})

describe("extractNextData", () => {
  test("parses the embedded JSON payload", () => {
    const data = extractNextData(companyHtml({ props: { pageProps: { ok: 1 } } }))
    expect(data).not.toBeNull()
  })

  test("returns null on malformed JSON rather than throwing", () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">{oops</script>`
    expect(extractNextData(html)).toBeNull()
  })

  test("returns null when the script tag is absent", () => {
    expect(extractNextData("<html></html>")).toBeNull()
  })
})

describe("normalizeJob", () => {
  const job = normalizeJob(JOB_RAW, COMPANY_RAW, "acme", "2026-07-20T10:00:00.000Z")!

  test("maps the core contract fields", () => {
    expect(job.id).toBe("11111111-2222-3333-4444-555555555555")
    expect(job.title).toBe("Senior Frontend Engineer")
    expect(job.company).toBe("Acme")
    expect(job.date).toBe("2026-07-20T10:00:00.000Z")
    expect(job.url).toBe("https://www.joppy.me/companies/acme/11111111-2222-3333-4444-555555555555")
  })

  test("prefers the job's own place over the company address", () => {
    expect(job.location).toBe("Barcelona")
    expect(job.modality).toBe("Hybrid")
  })

  test("falls back to the company location when the job has no place", () => {
    const noPlace = normalizeJob({ ...JOB_RAW, place: null }, COMPANY_RAW, "acme", null)!
    expect(noPlace.location).toBe("Madrid, Spain")
    expect(noPlace.modality).toBeNull()
  })

  test("splits mandatory skills out and labels language levels", () => {
    expect(job.skills).toEqual(["React", "Redux"])
    expect(job.mandatorySkills).toEqual(["React"])
    expect(job.languages).toEqual(["english (fluent)"])
  })

  test("hides the salary when the posting marks it private", () => {
    const priv = normalizeJob({ ...JOB_RAW, isSalaryPublic: false }, COMPANY_RAW, "acme", null)!
    expect(priv.salaryMin).toBeNull()
    expect(priv.salaryMax).toBeNull()
  })

  test("derives the app apply URL from the uid", () => {
    expect(job.applyUrl).toBe(
      "https://app.joppy.me/job/11111111-2222-3333-4444-555555555555/web",
    )
  })

  test("rejects a job with no uid or title", () => {
    expect(normalizeJob({ title: "x" }, COMPANY_RAW, "acme", null)).toBeNull()
    expect(normalizeJob({ uid: "x" }, COMPANY_RAW, "acme", null)).toBeNull()
    expect(normalizeJob("not an object", COMPANY_RAW, "acme", null)).toBeNull()
  })
})

describe("parseCompanyPage", () => {
  const html = companyHtml({ props: { pageProps: { company: COMPANY_RAW } } })

  test("extracts jobs and joins the sitemap lastmod by uid", () => {
    const lastmods = new Map([[JOB_RAW.uid, "2026-07-20T10:00:00.000Z"]])
    const jobs = parseCompanyPage(html, "acme", lastmods)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.date).toBe("2026-07-20T10:00:00.000Z")
  })

  test("one malformed job does not discard its valid siblings", () => {
    const mixed = companyHtml({
      props: { pageProps: { company: { ...COMPANY_RAW, jobs: [{ nope: true }, JOB_RAW] } } },
    })
    expect(parseCompanyPage(mixed, "acme", new Map())).toHaveLength(1)
  })

  test("returns an empty list when the page has no company payload", () => {
    expect(parseCompanyPage(companyHtml({ props: { pageProps: {} } }), "acme", new Map())).toEqual([])
    expect(parseCompanyPage("<html></html>", "acme", new Map())).toEqual([])
  })
})

describe("htmlToText", () => {
  test("strips tags, decodes entities and keeps paragraph breaks", () => {
    const text = htmlToText("<p>Hola &amp; adi&oacute;s</p><p>Segundo p&#225;rrafo</p>")
    expect(text).toBe("Hola & adiós\n\nSegundo párrafo")
  })

  test("renders list items as bullets", () => {
    expect(htmlToText("<ul><li>Uno</li><li>Dos</li></ul>")).toContain("- Uno")
  })

  test("returns null for empty or missing input", () => {
    expect(htmlToText(null)).toBeNull()
    expect(htmlToText("<p></p>")).toBeNull()
  })
})

describe("fold", () => {
  test("is case- and accent-insensitive", () => {
    expect(fold("Málaga")).toBe("malaga")
    expect(fold("DISEÑO")).toBe("diseno")
  })
})

describe("scoreJob", () => {
  const job = normalizeJob(JOB_RAW, COMPANY_RAW, "acme", null)!

  test("ranks a title hit above a body-only hit", () => {
    expect(scoreJob(job, ["frontend"])).toBeGreaterThan(scoreJob(job, ["things"]))
  })

  test("ranks a skill hit above a body-only hit", () => {
    expect(scoreJob(job, ["redux"])).toBeGreaterThan(scoreJob(job, ["things"]))
  })

  test("requires every term to match", () => {
    expect(scoreJob(job, ["frontend", "cobol"])).toBe(0)
  })

  test("an empty query matches everything", () => {
    expect(scoreJob(job, [])).toBe(1)
  })
})

describe("filterJobs", () => {
  const base = normalizeJob(JOB_RAW, COMPANY_RAW, "acme", new Date().toISOString())!
  const remote: CorpusJob = {
    ...base,
    id: "99999999-2222-3333-4444-555555555555",
    title: "Backend Engineer",
    modality: "Remote",
    location: "Madrid",
    salaryMin: 40000,
    salaryMax: 45000,
    skills: ["Python"],
    date: new Date(Date.now() - 90 * 86400000).toISOString(),
  }
  const jobs = [base, remote]

  test("filters by modality", () => {
    expect(filterJobs(jobs, { jobage: 9999, remote: "remote" }).map((j) => j.id)).toEqual([remote.id])
  })

  test("filters by location, accent-insensitively", () => {
    expect(filterJobs(jobs, { jobage: 9999, location: "barcelona" })).toHaveLength(1)
  })

  test("filters by posting age", () => {
    expect(filterJobs(jobs, { jobage: 30 }).map((j) => j.id)).toEqual([base.id])
  })

  test("filters by minimum salary", () => {
    expect(filterJobs(jobs, { jobage: 9999, minSalary: 50000 }).map((j) => j.id)).toEqual([base.id])
  })

  test("drops non-matching queries entirely", () => {
    expect(filterJobs(jobs, { jobage: 9999, query: "cobol" })).toEqual([])
  })
})

describe("toCard", () => {
  test("omits the heavy detail fields from search results", () => {
    const card = toCard(normalizeJob(JOB_RAW, COMPANY_RAW, "acme", null)!) as Record<string, unknown>
    expect(card.description).toBeUndefined()
    expect(card.hiringProcess).toBeUndefined()
    expect(card.slug).toBeUndefined()
    expect(card.title).toBe("Senior Frontend Engineer")
  })
})

describe("normalizeId", () => {
  test("accepts a full uid", () => {
    expect(normalizeId("11111111-2222-3333-4444-555555555555")).toEqual({
      token: "11111111-2222-3333-4444-555555555555",
      isFull: true,
      slug: null,
    })
  })

  test("accepts a public job URL and keeps the company slug", () => {
    expect(
      normalizeId("https://www.joppy.me/companies/acme/11111111-2222-3333-4444-555555555555"),
    ).toEqual({
      token: "11111111-2222-3333-4444-555555555555",
      isFull: true,
      slug: "acme",
    })
  })

  test("accepts an app apply URL", () => {
    const parsed = normalizeId("https://app.joppy.me/job/11111111-2222-3333-4444-555555555555/web")
    expect(parsed?.token).toBe("11111111-2222-3333-4444-555555555555")
  })

  test("accepts the short id prefix printed by the table format", () => {
    expect(normalizeId("fc32d0d8")).toEqual({ token: "fc32d0d8", isFull: false, slug: null })
  })

  test("rejects unparseable input", () => {
    expect(normalizeId("frontend engineer")).toBeNull()
    expect(normalizeId("")).toBeNull()
  })
})

describe("resolvePrefix", () => {
  const entries = [
    { uid: "aaaa1111-0000-0000-0000-000000000000", slug: "acme" },
    { uid: "aaaa2222-0000-0000-0000-000000000000", slug: "beta" },
  ]

  test("resolves a unique prefix to its uid and slug", () => {
    expect(resolvePrefix(entries, "aaaa1111")).toEqual({
      uid: "aaaa1111-0000-0000-0000-000000000000",
      slug: "acme",
    })
  })

  test("reports ambiguity rather than guessing", () => {
    const out = resolvePrefix(entries, "aaaa")
    expect(out).toHaveProperty("ambiguous")
  })

  test("returns null when nothing matches", () => {
    expect(resolvePrefix(entries, "ffff")).toBeNull()
  })
})
