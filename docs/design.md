# Design note

## Goals
Sync a supplier catalogue to a store safely: bad input is reported, not fatal; a crash mid-push is resumable; the fetcher is a good citizen.

## Decisions

**Prices as integer cents.** Parsing `"$12.50"` or `12.5` to cents at the boundary avoids float drift in diffs (`0.1 + 0.2` becomes 30).

**Skip and report, never throw, on bad rows.** `normalise` returns `{ product } | { error }`. The run report lists every skipped row with its source and row number so a human can chase the supplier.

**First SKU wins.** Sources are processed in configured order, so config order is the precedence order. Later duplicates (within or across sources) are reported with where the kept row came from.

**Diff is per field.** `update` fires if title, price, stock or vendor differ. Missing from the feed means `archive`, not delete, so it is reversible.

**Never archive on a partial feed.** If any source failed (robots refusal, HTTP error, parse error), archives are dropped from the plan. Otherwise one flaky supplier page would look like "the supplier removed everything".

**Checkpoint by plan fingerprint.** Batches are planned deterministically (creates, then updates, then archives, chunked). The checkpoint stores a hash of the plan plus completed batch indexes, written via temp file and rename after every batch. A resumed run with the same feed skips done batches; if the feed changed in between, the hash differs and the run starts fresh from the diff against `previous`. Trade-off: a batch that was applied but crashed before the checkpoint write is re-sent, so sink operations should be idempotent (create/update by SKU is).

**Fetcher.** robots.txt is fetched once per origin and cached; 4xx means allow, 5xx or network trouble means deny (conservative). Rules use longest-prefix match with Allow winning ties; an agent-specific group beats `*`. The delay is enforced per host, including the robots request. Clock and sleep are injectable so the delay test is deterministic.

## Out of scope
Real Shopify calls (Admin GraphQL, bulk operations, inventory locations, variants and options), wildcard robots patterns, `Crawl-delay`, retries and backoff on fetch, multi-process locking of the checkpoint file.
