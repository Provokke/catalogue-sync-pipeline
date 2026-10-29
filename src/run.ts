import { createHash } from "node:crypto";
import { adapters } from "./adapters/index.js";
import { loadCheckpoint, saveCheckpoint } from "./checkpoint.js";
import { diffCatalogue } from "./diff.js";
import { fetchPolite } from "./fetcher.js";
import { normalise } from "./normalise.js";
import type { Batch, ShopifySink } from "./shopify-sink.js";
import type { Product } from "./types.js";

export interface SourceConfig {
  url: string;
  /** Key into the adapter registry: csv | json | html. */
  adapter: string;
}

export interface SyncConfig {
  sources: SourceConfig[];
  sink: ShopifySink;
  checkpointPath: string;
  batchSize: number;
  minDelayMs: number;
  /** Catalogue currently live on the store; defaults to empty. */
  previous?: Product[];
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface Report {
  sources: { url: string; adapter: string; rows: number; accepted: number; error?: string }[];
  skipped: { source: string; row: number; reason: string }[];
  duplicates: { sku: string; source: string; row: number; keptFrom: string }[];
  diff: { create: number; update: number; archive: number };
  batches: { total: number; skippedFromCheckpoint: number; sent: number };
  completed: boolean;
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export async function runSync(cfg: SyncConfig): Promise<Report> {
  const report: Report = {
    sources: [],
    skipped: [],
    duplicates: [],
    diff: { create: 0, update: 0, archive: 0 },
    batches: { total: 0, skippedFromCheckpoint: 0, sent: 0 },
    completed: false,
  };
  const seen = new Map<string, string>();
  const next: Product[] = [];
  let anySourceFailed = false;

  for (const src of cfg.sources) {
    const entry: Report["sources"][number] = { url: src.url, adapter: src.adapter, rows: 0, accepted: 0 };
    report.sources.push(entry);
    try {
      const adapter = adapters[src.adapter];
      if (!adapter) throw new Error(`unknown adapter "${src.adapter}"`);
      const body = await fetchPolite(src.url, {
        minDelayMs: cfg.minDelayMs,
        ...(cfg.fetch ? { fetch: cfg.fetch } : {}),
        ...(cfg.sleep ? { sleep: cfg.sleep } : {}),
      });
      const rows = await adapter.parse(body);
      entry.rows = rows.length;
      rows.forEach((r, i) => {
        const res = normalise(r);
        if ("error" in res) {
          report.skipped.push({ source: src.url, row: i + 1, reason: res.error });
          return;
        }
        const first = seen.get(res.product.sku);
        if (first) {
          report.duplicates.push({ sku: res.product.sku, source: src.url, row: i + 1, keptFrom: first });
          return;
        }
        seen.set(res.product.sku, src.url);
        next.push(res.product);
        entry.accepted++;
      });
    } catch (e) {
      anySourceFailed = true;
      const err = e as Error;
      entry.error = err.name === "Error" ? err.message : `${err.name}: ${err.message}`;
    }
  }

  // A failed source must not look like "the supplier dropped everything": never archive on a partial feed.
  const d = diffCatalogue(cfg.previous ?? [], next);
  if (anySourceFailed) d.archive = [];
  report.diff = { create: d.create.length, update: d.update.length, archive: d.archive.length };

  const batches: Batch[] = [
    ...chunk(d.create, cfg.batchSize).map((products): Batch => ({ kind: "create", products })),
    ...chunk(d.update, cfg.batchSize).map((products): Batch => ({ kind: "update", products })),
    ...chunk(d.archive, cfg.batchSize).map((skus): Batch => ({ kind: "archive", skus })),
  ];
  report.batches.total = batches.length;

  const planId = createHash("sha256").update(JSON.stringify(batches)).digest("hex").slice(0, 16);
  const cp = await loadCheckpoint(cfg.checkpointPath, planId);
  const done = new Set(cp.done);

  for (let i = 0; i < batches.length; i++) {
    if (done.has(i)) {
      report.batches.skippedFromCheckpoint++;
      continue;
    }
    await cfg.sink.applyBatch(batches[i] as Batch);
    done.add(i);
    report.batches.sent++;
    await saveCheckpoint(cfg.checkpointPath, { planId, done: [...done] });
  }
  report.completed = true;
  return report;
}
