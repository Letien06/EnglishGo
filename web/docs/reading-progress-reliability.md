# Reading progress: reliability and read costs

These are document-operation counts from mocked regression fixtures, not measurements of production latency or invoices. Firestore can additionally bill index-entry reads, transaction retries, and empty-query minimums. Next's tagged cache can avoid the underlying reads while fresh.

Production cache misses emit structured `learning_progress_read` and `learning_progress_catalog_read` events through the existing logger. Vercel function logs expose the successful read's actual elapsed `durationMs`, strategy, result count, and estimated document operations, including empty-query minimums. Catalog operation counts accumulate reads across transaction callback retries. These events contain no learner UID, question IDs, or answers and make no extra Firestore calls. Cache hits, Firestore index-entry billing, and total invoice costs are excluded. Compare production event distributions after deployment; no real before/after latency has been measured here.

## Scoped resume and catalog reads

| Scenario | Previous source scan | Current uncached read path |
| --- | ---: | ---: |
| Current test has 3 saved answers among 1,080 Part records | 1,080 | 3 matching documents |
| Warm empty catalog history | Empty query minimum: 1 | 1 metadata document |
| Warm 3-answer catalog history | 3 | 1 metadata document with bounded inline rows |
| Warm 1,080-answer catalog history | 1,080 | 17: metadata plus 16 populated hash buckets |

Resume queries use batches of at most 30 question or item IDs; only current content membership is returned. Balanced-group reassignment preserves earlier answers by item membership instead of saved difficulty level. A query with no matching records still incurs its minimum read. Independent chunks have concurrency capped at four.

Catalog projections keep at most eight compact answer rows inline. Larger histories use up to 16 populated shards per Part; empty shards are deleted. A shard exceeding the 650 KB safety bound invalidates the projection and falls back to source history rather than risking a Firestore document-size failure.

The first catalog visit migrates legacy history in a transaction. The 1,080-record fixture uses 1,082 reads (metadata, source records, one empty projection-query minimum) and 17 writes (16 populated shards and metadata). A new empty history uses three read minimums and one metadata write. A three-row history uses five reads and one metadata write. Rebuilding an older projection also reads and deletes stale shards. Source history is preserved.

## Save, retry, and reset tradeoffs

For an initialized inline projection, a new answer adds one metadata read and one metadata write to the save transaction. For sharded history, it normally adds two reads (metadata and the touched shard) and one shard write. Creating a previously absent shard adds a metadata write. Crossing the inline threshold distributes the nine rows atomically and writes their populated buckets plus metadata. Before catalog initialization, the save only checks metadata and leaves migration to the catalog.

The complete new-answer save also performs request-receipt, progress, activity, profile, and leaderboard work. Approximate uncached costs for the complete transaction are around nine reads/nine writes for a new correct answer and six reads/six writes for an incorrect answer, plus the timestamp guard's extra read. Projection shape, first-answer transitions, existing awards, and transaction retries can change these totals; they are not a guarantee of lower overall write cost. Repeated correct answers with an existing award avoid reading both board documents.

An acknowledged request replay reads its receipt once and writes nothing. Receipts are retained to support offline retries without an expiry window; this trades growing small-document storage for durable deduplication. Review storage growth before adding retention rules: deleting a receipt can let a very late retry apply again unless another durable deduplication mechanism replaces it.

Reset selects only matching current question/item IDs, then transactionally deletes source progress and removes projection rows. It deletes newly empty shards and updates the shard directory and empty marker. Answer saves and resets read the same projection snapshots, so Firestore retries concurrent conflicts instead of overwriting an unrelated answer. Source scanning and projection initialization are likewise in one transaction.

Tests: `learning-progress-reads.test.ts`, `learning-progress-projection.test.ts`, `learning-tool-service.test.ts`, and the save helper's accounting/replay regressions.
