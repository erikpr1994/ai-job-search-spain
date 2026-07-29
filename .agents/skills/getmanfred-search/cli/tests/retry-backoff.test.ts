import { afterEach, describe, test, expect } from "bun:test";
import { fetchText, jsonFetch } from "../src/helpers";

// The portal contract requires backoff on 429/5xx. These tests pin the retry
// loop offline: a stubbed fetch counts attempts, and a stubbed setTimeout
// fires immediately so the exhaustion case does not sleep through the real
// 500ms -> 8s backoff schedule.
//
// Two GetManfred-specific contracts also live here:
//   - the Asgard backend answers a missing offer id with a deterministic HTTP
//     500 whose body is a fixed sentinel. That is a "not found", so it must
//     return null on the FIRST attempt instead of burning six retries.
//   - 404 returns null rather than throwing, so callers can report "not found".

const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
});

function instantTimers() {
  globalThis.setTimeout = ((fn: () => void) =>
    originalSetTimeout(fn, 0)) as unknown as typeof setTimeout;
}

function stubFetch(responses: Array<() => Response>): { calls: number } {
  const state = { calls: 0 };
  globalThis.fetch = (async () => {
    const i = Math.min(state.calls, responses.length - 1);
    state.calls++;
    return responses[i]!();
  }) as unknown as typeof fetch;
  return state;
}

const ACCEPT = "application/json, text/plain, */*";

describe("fetchText retry/backoff", () => {
  test("retries a 429 and succeeds on the next attempt", async () => {
    instantTimers();
    const state = stubFetch([
      () => new Response("", { status: 429 }),
      () => new Response("ok", { status: 200 }),
    ]);

    expect(await fetchText("https://www.getmanfred.com/x", ACCEPT)).toBe("ok");
    expect(state.calls).toBe(2);
  });

  test("retries a 503 and succeeds on the next attempt", async () => {
    instantTimers();
    const state = stubFetch([
      () => new Response("", { status: 503 }),
      () => new Response("ok", { status: 200 }),
    ]);

    expect(await fetchText("https://www.getmanfred.com/x", ACCEPT)).toBe("ok");
    expect(state.calls).toBe(2);
  });

  test("returns null on a 404 without retrying", async () => {
    const state = stubFetch([() => new Response("", { status: 404 })]);

    expect(await fetchText("https://www.getmanfred.com/x", ACCEPT)).toBeNull();
    expect(state.calls).toBe(1);
  });

  test("does not retry a plain 4xx", async () => {
    const state = stubFetch([() => new Response("", { status: 400 })]);

    await expect(fetchText("https://www.getmanfred.com/x", ACCEPT)).rejects.toThrow(/400/);
    expect(state.calls).toBe(1);
  });

  test("gives up after the initial attempt plus six retries on persistent 5xx", async () => {
    instantTimers();
    const state = stubFetch([() => new Response("boom", { status: 500 })]);

    await expect(fetchText("https://www.getmanfred.com/x", ACCEPT)).rejects.toThrow(/500/);
    expect(state.calls).toBe(7);
  });

  test("treats the Asgard sentinel 500 as not-found on the first attempt", async () => {
    instantTimers();
    const state = stubFetch([
      () => new Response("Internal Server Error (Asgard API)", { status: 500 }),
    ]);

    expect(await fetchText("https://www.getmanfred.com/x", ACCEPT)).toBeNull();
    expect(state.calls).toBe(1);
  });

  test("still retries a non-sentinel 500 body", async () => {
    instantTimers();
    const state = stubFetch([
      () => new Response("upstream hiccup", { status: 500 }),
      () => new Response("ok", { status: 200 }),
    ]);

    expect(await fetchText("https://www.getmanfred.com/x", ACCEPT)).toBe("ok");
    expect(state.calls).toBe(2);
  });
});

describe("jsonFetch", () => {
  test("parses a JSON body", async () => {
    stubFetch([() => new Response('{"ok":true}', { status: 200 })]);

    expect(await jsonFetch<{ ok: boolean }>("https://www.getmanfred.com/x")).toEqual({
      ok: true,
    });
  });

  test("returns null on a 404 instead of throwing", async () => {
    stubFetch([() => new Response("", { status: 404 })]);

    expect(await jsonFetch("https://www.getmanfred.com/x")).toBeNull();
  });

  test("retries a 429 before parsing", async () => {
    instantTimers();
    const state = stubFetch([
      () => new Response("", { status: 429 }),
      () => new Response('{"ok":true}', { status: 200 }),
    ]);

    expect(await jsonFetch<{ ok: boolean }>("https://www.getmanfred.com/x")).toEqual({
      ok: true,
    });
    expect(state.calls).toBe(2);
  });
});
