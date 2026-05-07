# Sprint Load Test Report

Generated: 2026-05-07T07:05:57.461Z
Total entries: 109

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-07T05:35:34.193Z | legacy | 6 |
| 2026-05-07T06:17:37.961Z | legacy | 6 |
| 2026-05-07T06:52:28.443Z | legacy | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 3 | 2.00 | 2.00 | 2.00 | 1.00 | 2.00 |
| wave.start | 3 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 91 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 3 | 2.00 | 2.90 | 2.98 | 1.00 | 3.00 |
| result.collected | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1268290.73 | 1835556.43 | 1885980.05 | 637995.50 | 1898585.95 |

## File Lock Histogram

| Bucket (ms) | Count |
|-------------|-------|
| <=0 | 0 |
| 0-10 | 0 |
| 10-50 | 0 |
| 50-100 | 0 |
| 100-500 | 0 |
| 500-1000 | 0 |
| 1000-5000 | 0 |
| >5000 | 0 |

## Critical Path Analysis

Top 5 slowest operations by p99:

1. **trace:wait_results** — p99: 1885980.05ms (2 samples)
2. **collect.batch** — p99: 2.98ms (3 samples)
3. **collision.detected** — p99: 2.00ms (3 samples)
4. **hb.stale** — p99: 1.00ms (91 samples)
5. **result.collected** — p99: 1.00ms (5 samples)
