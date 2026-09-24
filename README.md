# catalogue-sync-pipeline

Syncs a supplier feed (CSV, JSON or an HTML table) to a Shopify catalogue. It parses with pluggable adapters, normalises, diffs against the live catalogue and pushes in batches with checkpoint and resume. Feeds come through a robots.txt-aware, rate-limited fetcher. It runs offline against fixtures and a mocked Shopify sink.

Suppliers send catalogues in whatever format they like, with bad rows and duplicate SKUs. This turns three such feeds into one clean product list, works out the smallest set of creates, updates and archives, and applies them in batches that can resume after a crash without re-sending finished work.

## Run the demo

No accounts or network needed.

```sh
npm install
npm run demo
```

The demo serves the fixtures through a fake `fetch` and fails the mock Shopify on the second batch. It then resumes from the checkpoint, and runs again with one changed supplier price. One of the four sources is a robots-disallowed URL, so the report shows the refusal. The output looks like this:

```
Run 1 interrupted mid-sync: mock shopify: simulated outage (1 batch already applied, checkpoint saved)
=== Run 2: resume from checkpoint ===
  skipped    /feeds/supplier.csv row 3: CSV-003: invalid price
  duplicate  CSV-001 (/feeds/supplier.csv row 4), kept first from /feeds/supplier.csv
  diff       create 7, update 0, archive 0
  batches    total 3, resumed-skip 1, sent 2
=== Run 3: next day, one supplier price differs ===
  diff       create 0, update 1, archive 0
```

Other scripts: `npm test`, `npm run lint`, `npm run typecheck` and `npm run check` (all three).

## How it fits together

```
fetchPolite -> Adapter.parse -> normalise -> dedupe by SKU -> diffCatalogue
   -> batches -> ShopifySink.applyBatch -> checkpoint file (per batch)
```

`runSync(cfg)` in `src/run.ts` wires this up and returns a `Report` with per-source rows, skipped rows, duplicates, diff counts and batch counts.

- Adapters (`src/adapters`) are `csv`, `json` and `html` behind one `Adapter { name, parse(raw) }` interface. Add a supplier by adding an adapter.
- Normalising turns prices into integer cents. Rows with no SKU, no title, a bad price or a bad stock count are skipped and reported. The first SKU seen wins on duplicates.
- The diff gives `create`, `update` (any field changed) or `archive` (SKU gone from the feed).
- The checkpoint records finished batch indexes after each batch. A re-run with the same plan skips them, and a different plan starts fresh.
- `fetchPolite` reads `/robots.txt` first and throws `RobotsDisallowed` without requesting the page. It waits at least `minDelayMs` between requests to one host.

## Caveats

- The sink is an in-memory mock. Nothing has been sent to a real Shopify store, and the real Admin API (rate limits, bulk operations, variants, inventory locations) isn't modelled.
- The fetcher has never made a real network request. Redirects, compression, `Crawl-delay`, wildcard robots patterns and JavaScript-rendered pages aren't covered.
- Robots parsing handles `User-agent`, `Allow` and `Disallow` with prefix matching, but not `*` or `$` wildcards.
- The HTML adapter reads one simple table with a header row using regexes. It isn't a general HTML parser.
- Per-host timing and the robots cache live in the process. There's been no concurrency or large-feed testing.

Only fetch sites you have permission to fetch. This repo ships no real targets and no personal data.

## Licence

MIT. See LICENSE.
