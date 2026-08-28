import { describe, test, expect } from "bun:test"
import { runCLI, parseJSON } from "./helpers"

// Live smoke tests. These hit tecnoempleo.com over the network — keep them few
// and low-volume (robots.txt disallows Anthropic/Claude crawlers; personal use
// only). If the network or site is unavailable they will fail, not hang.

interface SearchResult {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
}
interface SearchOutput {
  meta: { count: number; total: number; page: number }
  results: SearchResult[]
}

function parsedStderr(stderr: string): { error?: string; code?: string } {
  try {
    return JSON.parse(stderr)
  } catch {
    return {}
  }
}

describe("tecnoempleo CLI — flag validation (offline)", () => {
  test("missing --query exits 1 with NO_QUERY on stderr", async () => {
    const r = await runCLI(["search"])
    expect(r.exitCode).not.toBe(0)
    expect(parsedStderr(r.stderr).code).toBe("NO_QUERY")
    expect(r.stdout).toBe("")
  })

  test("bogus --jobage exits 1 with BAD_ARG", async () => {
    const r = await runCLI(["search", "-q", "React", "--jobage", "soon"])
    expect(r.exitCode).not.toBe(0)
    expect(parsedStderr(r.stderr).code).toBe("BAD_ARG")
  })

  test("unknown command exits 1 with BAD_CMD", async () => {
    const r = await runCLI(["frobnicate"])
    expect(r.exitCode).not.toBe(0)
    expect(parsedStderr(r.stderr).code).toBe("BAD_CMD")
  })

  test("unknown --location exits 1 with BAD_LOCATION", async () => {
    const r = await runCLI(["search", "-q", "React", "-l", "Lisboa"])
    expect(r.exitCode).not.toBe(0)
    expect(parsedStderr(r.stderr).code).toBe("BAD_LOCATION")
  })

  test("an unknown flag on search is rejected", async () => {
    const r = await runCLI(["search", "-q", "React", "--bogus"])
    expect(r.exitCode).not.toBe(0)
    expect(parsedStderr(r.stderr).code).toBe("BAD_FLAG")
  })

  test("an unknown flag on detail is rejected", async () => {
    const r = await runCLI(["detail", "rf-d97516df323a73b22543", "--bogus"])
    expect(r.exitCode).not.toBe(0)
    expect(parsedStderr(r.stderr).code).toBe("BAD_FLAG")
  })
})

describe("tecnoempleo CLI — live search + detail", () => {
  test('search -q "React" returns >=1 result with non-null id/title/url', async () => {
    const r = await runCLI(["search", "-q", "React", "--limit", "5"])
    const out = parseJSON<SearchOutput>(r)
    expect(out.results.length).toBeGreaterThanOrEqual(1)
    for (const job of out.results) {
      expect(job.id).toBeTruthy()
      expect(job.title).toBeTruthy()
      expect(job.url).toContain("tecnoempleo.com")
      // Titles/companies must be decoded text, not raw HTML fragments.
      expect(job.title).not.toContain("<")
    }
  }, 30000)

  test("detail <id> from search returns a readable title + description", async () => {
    const s = await runCLI(["search", "-q", "React", "--limit", "1"])
    const out = parseJSON<SearchOutput>(s)
    const id = out.results[0].id
    const d = await runCLI(["detail", id, "--format", "plain"])
    expect(d.exitCode).toBe(0)
    expect(d.stdout.length).toBeGreaterThan(40)
    expect(d.stdout).not.toContain("<div")
  }, 30000)
})
