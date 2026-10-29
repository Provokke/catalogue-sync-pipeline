import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resetFetcherState } from "../fetcher.js";
import { runSync, type Report, type SyncConfig } from "../run.js";
import { MockShopifySink } from "../shopify-sink.js";

const HOST = "https://supplier.example";
const fixtureDir = fileURLToPath(new URL("../../fixtures/", import.meta.url));

const routes: Record<string, string> = {
  "/robots.txt": "robots.txt",
  "/feeds/supplier.csv": "supplier.csv",
  "/feeds/supplier.json": "supplier.json",
  "/feeds/supplier.html": "supplier.html",
  "/private/secret.csv": "supplier.csv",
};

/** Offline stand-in for the network: serves the fixtures, never opens a socket. */
const offlineFetch = (async (input: string | URL | Request) => {
  const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const file = routes[u.pathname];
  return file
    ? new Response(readFileSync(join(fixtureDir, file), "utf8"), { status: 200 })
    : new Response("not found", { status: 404 });
}) as typeof fetch;

function print(title: string, r: Report): void {
  console.log(`\n=== ${title} ===`);
  for (const s of r.sources) {
    console.log(`  source ${s.adapter.padEnd(4)} ${s.url.replace(HOST, "")}: ${s.rows} rows, ${s.accepted} accepted${s.error ? `, ERROR ${s.error}` : ""}`);
  }
  for (const s of r.skipped) console.log(`  skipped    ${s.source.replace(HOST, "")} row ${s.row}: ${s.reason}`);
  for (const d of r.duplicates) console.log(`  duplicate  ${d.sku} (${d.source.replace(HOST, "")} row ${d.row}), kept first from ${d.keptFrom.replace(HOST, "")}`);
  console.log(`  diff       create ${r.diff.create}, update ${r.diff.update}, archive ${r.diff.archive}`);
  console.log(`  batches    total ${r.batches.total}, resumed-skip ${r.batches.skippedFromCheckpoint}, sent ${r.batches.sent}`);
}

async function main(): Promise<void> {
  resetFetcherState();
  const dir = mkdtempSync(join(tmpdir(), "catalogue-sync-demo-"));
  const sink = new MockShopifySink();
  const base = (extra: Partial<SyncConfig> = {}): SyncConfig => ({
    sources: [
      { url: `${HOST}/feeds/supplier.csv`, adapter: "csv" },
      { url: `${HOST}/feeds/supplier.json`, adapter: "json" },
      { url: `${HOST}/feeds/supplier.html`, adapter: "html" },
      { url: `${HOST}/private/secret.csv`, adapter: "csv" },
    ],
    sink,
    checkpointPath: join(dir, "checkpoint.json"),
    batchSize: 3,
    minDelayMs: 20,
    fetch: offlineFetch,
    ...extra,
  });

  console.log("catalogue-sync-pipeline demo (offline: fixtures + mocked Shopify, no network)");
  try {
    sink.failOnCall(2);
    try {
      await runSync(base());
    } catch (e) {
      console.log(`\nRun 1 interrupted mid-sync: ${(e as Error).message} (1 batch already applied, checkpoint saved)`);
    }
    print("Run 2: resume from checkpoint", await runSync(base()));

    const previous = sink.snapshot().map((p) => (p.sku === "HTML-002" ? { ...p, priceCents: 1500 } : p));
    print("Run 3: next day, one supplier price differs", await runSync(base({ previous, checkpointPath: join(dir, "cp3.json") })));

    console.log(`\nMock store now holds ${sink.snapshot().length} live products after ${sink.calls.length} batch calls.`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
