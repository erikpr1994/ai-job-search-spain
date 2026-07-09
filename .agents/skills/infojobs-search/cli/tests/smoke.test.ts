import { describe, test, expect } from "bun:test";
import { runCLI, parseJSON } from "./helpers";

// Live smoke test against InfoJobs' public search. Network-dependent; kept to a
// single low-volume request to respect the "personal use only" note. If InfoJobs
// is unreachable, the test fails loudly rather than passing silently.
interface SearchResponse {
  meta: { count: number; page: number };
  results: Array<{
    id: string;
    title: string;
    company: string | null;
    location: string | null;
    date: string | null;
    url: string;
  }>;
}

describe("live smoke test (network)", () => {
  test("search -q React returns real offer cards", async () => {
    const result = await runCLI(["search", "-q", "React", "--limit", "3"]);
    const data = parseJSON<SearchResponse>(result);
    expect(Array.isArray(data.results)).toBe(true);
    expect(data.results.length).toBeGreaterThan(0);
    const first = data.results[0];
    expect(first.id).toMatch(/^[0-9a-f]+$/);
    expect(typeof first.title).toBe("string");
    expect(first.title.length).toBeGreaterThan(0);
    expect(first.url).toContain("of-i");
  }, 30000);

  test("detail resolves a live offer from a search id", async () => {
    const searchRes = await runCLI(["search", "-q", "React", "--limit", "1"]);
    const data = parseJSON<SearchResponse>(searchRes);
    const id = data.results[0].id;
    const detailRes = await runCLI(["detail", `of-i${id}`]);
    const job = parseJSON<{ title: string; description: string | null }>(detailRes);
    expect(typeof job.title).toBe("string");
    expect(job.title.length).toBeGreaterThan(0);
  }, 30000);
});
