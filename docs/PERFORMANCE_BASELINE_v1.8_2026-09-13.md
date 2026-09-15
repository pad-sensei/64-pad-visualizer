# 64 Pad Explorer Web performance baseline — v1.7 → v1.8

Date: 2026-09-13

## Compared revisions

- v1.7 Web integration: `2e0dc0b06bd44b6f0b846258b123cbd6d37369d0`
- v1.8 candidate: `8d4d0af31ea76ba3261b6dff561afa477082c21d`

## Method

GitHub Actions run `34734838828`, job `103664278358` (SUCCESS). Same Ubuntu 24.04 runner class and Playwright Chromium 145. Seven alternating runs; medians reported. External analytics/fonts and Service Worker were blocked to isolate local application cost.

| Metric | v1.7 | v1.8 | Delta |
|---|---:|---:|---:|
| Referenced JS/CSS, gzip-9 | 372.55 KiB | 395.29 KiB | +6.1% |
| Referenced JS/CSS, raw | 1344.17 KiB | 1434.19 KiB | +6.7% |
| Browser local encoded body | 1508.99 KiB | 1611.24 KiB | +6.8% |
| Wall load | 152.80 ms | 170.98 ms | +11.9% |
| DOMContentLoaded | 150.40 ms | 168.90 ms | +12.3% |
| Idle main-thread task over 5 s | 177.98 ms | 191.94 ms | +7.8% |
| Idle script over 5 s | 0.00 ms | 0.00 ms | +0.0% |
| JS heap after settle | 9.54 MiB | 9.54 MiB | +0.0% |

## Interpretation / future use

This is the baseline for later lightweighting work, not a claim about every user's machine. The measured v1.8 increase is modest relative to the added Push control/display surface. Hardware WebUSB transfer cost and real audio-device CPU were not measured in CI. Owner physical playing acceptance found no performance problem.

Use this same methodology again when a future large architecture/refactor changes the performance envelope (for example the planned v2.x code-progression-analysis work). Small v1.8 bug fixes should not trigger optimization work solely to improve these numbers.
