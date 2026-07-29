import { describe, expect, test } from "bun:test"
import { runCLI } from "./helpers.js"

/** Every failure path must exit 1 and put a JSON error on stderr, never stdout. */
async function expectJsonError(args: string[], code: string): Promise<void> {
  const result = await runCLI(args)
  expect(result.exitCode).toBe(1)
  expect(result.stdout).toBe("")
  const parsed = JSON.parse(result.stderr) as { error: string; code: string }
  expect(parsed.code).toBe(code)
  expect(typeof parsed.error).toBe("string")
}

describe("flag and argument validation", () => {
  test("an unknown flag on search is rejected", async () => {
    await expectJsonError(["search", "--bogus", "x"], "BAD_FLAG")
  })

  test("an unknown flag on detail is rejected", async () => {
    await expectJsonError(
      ["detail", "11111111-2222-3333-4444-555555555555", "--bogus"],
      "BAD_FLAG",
    )
  })

  test("detail without an id is rejected", async () => {
    await expectJsonError(["detail"], "NO_ID")
  })

  test("detail with an unparseable id is rejected", async () => {
    await expectJsonError(["detail", "frontend engineer"], "BAD_ID")
  })

  test("a non-numeric --jobage is rejected", async () => {
    await expectJsonError(["search", "--jobage", "soon"], "BAD_ARG")
  })

  test("a non-numeric --limit is rejected", async () => {
    await expectJsonError(["search", "--limit", "many"], "BAD_ARG")
  })

  test("an invalid --remote mode is rejected", async () => {
    await expectJsonError(["search", "--remote", "moon"], "BAD_ARG")
  })

  test("an unknown command is rejected", async () => {
    await expectJsonError(["frobnicate"], "BAD_CMD")
  })

  test("--help prints usage to stdout and exits 0", async () => {
    const result = await runCLI(["search", "--help"])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("USAGE")
    expect(result.stderr).toBe("")
  })

  test("no arguments prints usage and exits 1", async () => {
    const result = await runCLI([])
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("USAGE")
  })
})
