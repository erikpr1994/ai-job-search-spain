import { afterEach, describe, test, expect } from "bun:test"
import { htmlFetch, REQUEST_TIMEOUT_MS } from "../src/helpers"

// A stalled upstream connection (accepted socket, no response) would otherwise
// hang the CLI forever - fetch has no default timeout. Assert the request
// wrapper carries an AbortSignal timeout.
const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("request timeout", () => {
  test("htmlFetch passes an AbortSignal timeout to fetch", async () => {
    let init: RequestInit | undefined
    globalThis.fetch = (async (_url: string | URL | Request, i?: RequestInit) => {
      init = i
      return new Response("<html></html>", { status: 200 })
    }) as unknown as typeof fetch

    await htmlFetch("https://www.tecnoempleo.com/x")
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  test("a timeout surfaces immediately and is not swallowed by the retry loop", async () => {
    // The retry loop only inspects response status codes, so a thrown abort
    // must propagate on the first attempt rather than burning six slow retries.
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      throw new Error("The operation timed out.")
    }) as unknown as typeof fetch

    await expect(htmlFetch("https://www.tecnoempleo.com/x")).rejects.toThrow(/timed out/)
    expect(calls).toBe(1)
  })

  test("the timeout budget is a sane bounded value", () => {
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThan(0)
    expect(REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(30000)
  })
})
