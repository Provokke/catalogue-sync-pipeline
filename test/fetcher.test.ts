import { beforeEach, describe, expect, it } from "vitest";
import { fetchPolite, parseRobots, resetFetcherState, RobotsDisallowed } from "../src/fetcher.js";
import { FEED_HOST, fixtureFetch } from "./helpers.js";

beforeEach(() => resetFetcherState());

describe("fetchPolite", () => {
  it("fetchPolite refuses robots-disallowed url", async () => {
    const log: string[] = [];
    await expect(
      fetchPolite(`${FEED_HOST}/private/secret.csv`, { minDelayMs: 0, fetch: fixtureFetch(log) }),
    ).rejects.toBeInstanceOf(RobotsDisallowed);
    expect(log).toEqual(["/robots.txt"]); // the disallowed page itself was never requested
  });

  it("allows a more specific Allow rule inside a disallowed prefix", async () => {
    const body = await fetchPolite(`${FEED_HOST}/private/public-feed.csv`, { minDelayMs: 0, fetch: fixtureFetch() });
    expect(body).toContain("CSV-001");
  });

  it("fetchPolite enforces min delay", async () => {
    let clock = 1_000;
    const stamps: number[] = [];
    const inner = fixtureFetch();
    const timed = ((u: string, i?: RequestInit) => {
      stamps.push(clock);
      return inner(u, i);
    }) as typeof fetch;
    const opts = {
      minDelayMs: 500,
      fetch: timed,
      now: () => clock,
      sleep: async (ms: number) => {
        clock += ms;
      },
    };
    await fetchPolite(`${FEED_HOST}/feeds/supplier.csv`, opts);
    await fetchPolite(`${FEED_HOST}/feeds/supplier.json`, opts);
    expect(stamps).toHaveLength(3); // robots once (cached) + two pages
    for (let i = 1; i < stamps.length; i++) expect(stamps[i]! - stamps[i - 1]!).toBeGreaterThanOrEqual(500);
  });

  it("treats an unreachable robots.txt (5xx) as deny, a missing one (404) as allow", async () => {
    const f5 = (async () => new Response("x", { status: 503 })) as typeof fetch;
    await expect(fetchPolite("https://down.example/a", { minDelayMs: 0, fetch: f5 })).rejects.toBeInstanceOf(
      RobotsDisallowed,
    );
    const f4 = (async (u: string) =>
      new URL(u).pathname === "/robots.txt" ? new Response("", { status: 404 }) : new Response("ok")) as typeof fetch;
    expect(await fetchPolite("https://open.example/a", { minDelayMs: 0, fetch: f4 })).toBe("ok");
  });

  it("parseRobots prefers an agent-specific group over *", () => {
    const txt = "User-agent: *\nDisallow: /a\n\nUser-agent: catalogue-sync-bot\nDisallow: /b\n";
    expect(parseRobots(txt, "catalogue-sync-bot")).toEqual([{ allow: false, path: "/b" }]);
    expect(parseRobots(txt, "other")).toEqual([{ allow: false, path: "/a" }]);
  });
});
