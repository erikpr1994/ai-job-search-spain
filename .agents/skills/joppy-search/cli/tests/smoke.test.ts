import { describe, expect, test } from "bun:test"
import { parseJSON, runCLI } from "./helpers.js"

// Live tests against joppy.me. They are deliberately few and share the on-disk
// corpus cache, so the whole file costs roughly one portal scan.

interface SearchResponse {
  meta: { count: number; total: number; page: number; pages: number; corpusSize: number }
  results: {
    id: string
    title: string
    company: string | null
    location: string | null
    date: string | null
    url: string
    skills: string[]
  }[]
}

describe("live search", () => {
  test("returns real results for a common query", async () => {
    const response = parseJSON<SearchResponse>(await runCLI(["search", "-q", "React"]))

    expect(response.meta.corpusSize).toBeGreaterThan(0)
    expect(response.results.length).toBeGreaterThan(0)

    for (const job of response.results) {
      expect(job.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(job.title.length).toBeGreaterThan(0)
      expect(job.title).not.toContain("<")
      expect(job.url).toStartWith("https://www.joppy.me/companies/")
      expect(job.url).toContain(job.id)
    }
  })

  test("every contract field is present, null rather than omitted when unknown", async () => {
    const response = parseJSON<SearchResponse>(await runCLI(["search", "--limit", "3"]))
    for (const job of response.results) {
      for (const key of ["id", "title", "company", "location", "date", "url"]) {
        expect(job).toHaveProperty(key)
      }
    }
  })

  test("dates parse as real timestamps", async () => {
    const response = parseJSON<SearchResponse>(await runCLI(["search", "--limit", "5"]))
    const dated = response.results.filter((j) => j.date !== null)
    expect(dated.length).toBeGreaterThan(0)
    for (const job of dated) {
      expect(Number.isNaN(Date.parse(job.date!))).toBe(false)
    }
  })

  test("--limit caps the emitted results", async () => {
    const response = parseJSON<SearchResponse>(await runCLI(["search", "--limit", "2"]))
    expect(response.results.length).toBeLessThanOrEqual(2)
  })

  test("an impossible query returns zero results, not an error", async () => {
    const response = parseJSON<SearchResponse>(
      await runCLI(["search", "-q", "zzzzqqqnotarealskill"]),
    )
    expect(response.results).toEqual([])
    expect(response.meta.total).toBe(0)
  })

  test("table format renders a header", async () => {
    const result = await runCLI(["search", "-q", "React", "--limit", "3", "--format", "table"])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("TITLE")
    expect(result.stdout).toContain("COMPANY")
  })
})

describe("live detail", () => {
  test("fetches a full posting for an id taken from search", async () => {
    const search = parseJSON<SearchResponse>(await runCLI(["search", "-q", "React", "--limit", "1"]))
    expect(search.results.length).toBeGreaterThan(0)
    const id = search.results[0]!.id

    const detail = parseJSON<{
      id: string
      title: string
      description: string | null
      applyUrl: string
      url: string
    }>(await runCLI(["detail", id]))

    expect(detail.id).toBe(id)
    expect(detail.title).toBe(search.results[0]!.title)
    expect(detail.description).toBeTruthy()
    expect(detail.description).not.toContain("<p>")
    expect(detail.description).not.toContain("&amp;")
    expect(detail.applyUrl).toBe(`https://app.joppy.me/job/${id}/web`)
  })

  test("resolves the short id prefix printed by the table format", async () => {
    const search = parseJSON<SearchResponse>(await runCLI(["search", "--limit", "1"]))
    const id = search.results[0]!.id
    const detail = parseJSON<{ id: string }>(await runCLI(["detail", id.slice(0, 8)]))
    expect(detail.id).toBe(id)
  })

  test("a well-formed but unknown id exits 1 with NOT_FOUND", async () => {
    const result = await runCLI(["detail", "00000000-0000-0000-0000-000000000000"])
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe("")
    expect(JSON.parse(result.stderr).code).toBe("NOT_FOUND")
  })
})
