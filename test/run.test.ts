import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetFetcherState } from "../src/fetcher.js";
import { runSync, type SyncConfig } from "../src/run.js";
import { MockShopifySink } from "../src/shopify-sink.js";
import { FEED_HOST, fixtureFetch } from "./helpers.js";

let dir: string;
beforeEach(async () => {
  resetFetcherState();
  dir = await mkdtemp(join(tmpdir(), "catsync-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const cfg = (sink: MockShopifySink, over: Partial<SyncConfig> = {}): SyncConfig => ({
  sources: [
    { url: `${FEED_HOST}/feeds/supplier.csv`, adapter: "csv" },
    { url: `${FEED_HOST}/feeds/supplier.json`, adapter: "json" },
    { url: `${FEED_HOST}/feeds/supplier.html`, adapter: "html" },
  ],
  sink,
  checkpointPath: join(dir, "checkpoint.json"),
  batchSize: 3,
  minDelayMs: 0,
  fetch: fixtureFetch(),
  ...over,
});

describe("runSync", () => {
  it("skips malformed rows and lists them in report", async () => {
    const report = await runSync(cfg(new MockShopifySink()));
    const reasons = report.skipped.map((s) => s.reason);
    expect(reasons).toEqual(
      expect.arrayContaining(["CSV-003: invalid price", "missing sku", "JSON-003: missing title", "HTML-003: invalid price"]),
    );
    expect(report.skipped).toHaveLength(4);
  });

  it("duplicate SKU keeps first and reports second", async () => {
    const sink = new MockShopifySink();
    const report = await runSync(cfg(sink));
    expect(report.duplicates.map((d) => d.sku).sort()).toEqual(["CSV-001", "CSV-004"]);
    expect(sink.catalogue.get("CSV-001")?.priceCents).toBe(1250); // first row wins
    expect(sink.catalogue.get("CSV-004")?.priceCents).toBe(875); // csv beats json
    expect(report.completed).toBe(true);
  });

  it("resume skips already-synced batches", async () => {
    const sink = new MockShopifySink();
    sink.failOnCall(2); // 7 creates in batches of 3 -> 3 batches; die on the 2nd
    await expect(runSync(cfg(sink))).rejects.toThrow(/simulated outage/);
    expect(sink.calls).toHaveLength(1);

    const report = await runSync(cfg(sink));
    expect(report.batches).toEqual({ total: 3, skippedFromCheckpoint: 1, sent: 2 });
    expect(sink.calls).toHaveLength(3); // the first batch was not re-sent
    expect(sink.catalogue.size).toBe(7);
  });

  it("a robots-disallowed source is reported and never archives existing products", async () => {
    const sink = new MockShopifySink();
    await runSync(cfg(sink));
    const previous = sink.snapshot();
    const report = await runSync(
      cfg(sink, {
        previous,
        checkpointPath: join(dir, "cp2.json"),
        sources: [{ url: `${FEED_HOST}/private/secret.csv`, adapter: "csv" }],
      }),
    );
    expect(report.sources[0]?.error).toMatch(/RobotsDisallowed/);
    expect(report.diff.archive).toBe(0);
  });

  it("a second run with one price change sends one update batch", async () => {
    const sink = new MockShopifySink();
    await runSync(cfg(sink));
    const previous = sink.snapshot().map((p) => (p.sku === "JSON-001" ? { ...p, priceCents: 1 } : p));
    const report = await runSync(cfg(sink, { previous, checkpointPath: join(dir, "cp3.json") }));
    expect(report.diff).toEqual({ create: 0, update: 1, archive: 0 });
    expect(sink.catalogue.get("JSON-001")?.priceCents).toBe(3250);
  });
});
