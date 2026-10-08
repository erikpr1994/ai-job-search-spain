import { describe, test, expect } from "bun:test";
import { runCLI, parseJSON } from "./helpers";
import { slugMatches, normalizeSlug } from "../src/helpers";

interface SearchResult {
  meta: { count: number; matched: number };
  results: Array<{ id: string; title: string; company: string | null; url: string }>;
}

function parsedStderr(stderr: string): { error?: string; code?: string } {
  try {
    return JSON.parse(stderr);
  } catch {
    return {};
  }
}

describe.skipIf(!process.env.LIVE_TESTS)("techeurope CLI live smoke", () => {
  test("search returns results", async () => {
    const data = parseJSON<SearchResult>(await runCLI(["search", "-q", "engineer", "--limit", "3"]));
    expect(data.results.length).toBeGreaterThan(0);
    expect(data.results[0].title).toBeTruthy();
    expect(data.results[0].url).toContain("jobs.techeurope.io/jobs/");
  }, 30000);

  test("detail of the first search result is readable", async () => {
    const data = parseJSON<SearchResult>(await runCLI(["search", "--limit", "1"]));
    const job = parseJSON<{ title: string; applyUrl: string | null }>(await runCLI(["detail", data.results[0].url]));
    expect(job.title).toBeTruthy();
  }, 30000);
});

describe("techeurope helpers", () => {
  test("slugMatches needs every term", () => {
    const slug = "mistral-ai-research-engineer-machine-learning-paris-5zaj8c";
    expect(slugMatches(slug, "Research Engineer")).toBe(true);
    expect(slugMatches(slug, "research berlin")).toBe(false);
  });

  test("normalizeSlug accepts a URL or a slug", () => {
    expect(normalizeSlug("https://jobs.techeurope.io/jobs/abc-123?x=1")).toBe("abc-123");
    expect(normalizeSlug("abc-123")).toBe("abc-123");
  });
});

describe("techeurope CLI flag validation", () => {
  test("non-numeric --limit exits 1 with BAD_ARG", async () => {
    const result = await runCLI(["search", "--limit", "xyz"]);
    expect(result.exitCode).not.toBe(0);
    expect(parsedStderr(result.stderr).code).toBe("BAD_ARG");
  });

  test("detail with no id exits 1 with NO_ID", async () => {
    const result = await runCLI(["detail"]);
    expect(result.exitCode).not.toBe(0);
    expect(parsedStderr(result.stderr).code).toBe("NO_ID");
  });
});
