# catalogue-sync-pipeline

Supplier feed (CSV, JSON or an HTML table) to Shopify catalogue sync: parse with pluggable adapters, normalise, diff against the live catalogue, push in batches with checkpoint/resume, fetched through a robots.txt-aware, rate-limited fetcher. Runs fully offline against fixtures and a mocked Shopify sink.

## What it does

Suppliers send catalogues in whatever format they like, with bad rows and duplicate SKUs. This pipeline turns three such feeds into one clean product list, works out the minimum set of creates, updates and archives, and applies them in batches that can be resumed after a crash without re-sending finished work.

- **Adapters** (`src/adapters`): `csv`, `json`, `html` behind one `Adapter { name, parse(raw) }` interface. Add a supplier by adding an adapter.
- **Normalise** (`src/normalise.ts`): prices become integer cents; rows with no SKU, no title, a bad price or a bad stock count return `{ error }` and are skipped and reported, never crashing the run.
- **Duplicates**: the first SKU seen wins; later ones are listed in the report.
- **Diff** (`src/diff.ts`): `create` / `update` (any field changed) / `archive` (SKU gone from the feed).
- **Sink** (`src/shopify-sink.ts`): batched calls to a `ShopifySink`. Only an in-memory mock is provided.
- **Checkpoint** (`src/checkpoint.ts`): after each applied batch the completed batch indexes are written atomically. A re-run with the same plan skips them; a different plan starts fresh.
- **Fetcher** (`src/fetcher.ts`): `fetchPolite` reads `/robots.txt` first (longest-match Allow/Disallow, agent-specific group over `*`), throws `RobotsDisallowed` without requesting the page, and waits at least `minDelayMs` between requests to the same host.

## 2-minute demo

No accounts, no network.

```bash
npm install
npm run demo
```

The demo serves the fixtures through an in-process fake `fetch`, fails the mock Shopify on the second batch, then resumes from the checkpoint (run 2), then runs again with one changed supplier price (run 3). One of the four sources is a robots-disallowed URL, so the report shows the refusal. Expected shape of the output:

```
Run 1 interrupted mid-sync: mock shopify: simulated outage (1 batch already applied, checkpoint saved)
=== Run 2: resume from checkpoint ===
  ...
  skipped    /feeds/supplier.csv row 3: CSV-003: invalid price
  duplicate  CSV-001 (/feeds/supplier.csv row 4), kept first from /feeds/supplier.csv
  diff       create 7, update 0, archive 0
  batches    total 3, resumed-skip 1, sent 2
=== Run 3: next day, one supplier price differs ===
  diff       create 0, update 1, archive 0
```

Other scripts: `npm test`, `npm run lint`, `npm run typecheck`, `npm run check` (all three).

## Architecture

```
 fetchPolite (robots + delay) -> Adapter.parse -> normalise -> dedupe by SKU
        -> diffCatalogue(previous, next) -> batches -> ShopifySink.applyBatch
                                                  \-> checkpoint file (per batch)
```

`runSync(cfg)` in `src/run.ts` wires this together and returns a `Report` (per-source rows, skipped rows, duplicates, diff counts, batch counts). See `docs/design.md` for decisions and trade-offs.

## Verified vs NOT verified

**Verified (offline, locally and in CI):**

- 19 vitest tests: each adapter on its fixture, normalisation and error cases, diff (including price-change-only), robots refusal, Allow-inside-Disallow, 404/5xx robots handling, minimum delay (with an injected clock), skipped-row and duplicate reporting, resume after a mid-run failure, no archiving when a source failed.
- `npm run typecheck`, `npm run lint` and `npm run demo` pass.

**NOT verified:**

- **Mock only, not a real store.** The sink is an in-memory stand-in. Nothing has been sent to a real Shopify store, and the real Admin API (rate limits, bulk operations, variants, inventory locations, error shapes) is not modelled.
- **No live scraping.** The fetcher has never made a real network request; tests and the demo use a fake `fetch` and generic fixtures. Real sites differ (redirects, compression, `Crawl-delay`, wildcard robots patterns, JavaScript-rendered pages) and none of that is exercised.
- Robots parsing covers `User-agent`, `Allow`, `Disallow` with prefix matching. It does not implement `*`/`$` wildcards or honour `Crawl-delay`; the caller sets `minDelayMs`.
- The HTML adapter reads one simple table with a header row, using regexes; it is not a general HTML parser.
- Per-host timing and the robots cache are process-local.
- No concurrency, large-feed or memory testing.

Only fetch sites you have permission to fetch; this repo ships no real targets and no personal data.

## Licence

MIT
