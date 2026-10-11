# Arbora ML evaluation summary

Only completed evaluation artifacts are summarized. Parser validity is not correctness.

## TypeScript baselines (30 corruptions from 26 programs)

- **B0:** top-1 exact 0.000 (95% CI 0.000–0.000, n=30); top-3 exact 0.000 (95% CI 0.000–0.000, n=30); top-1 AST match 0.000 (95% CI 0.000–0.000, n=30); verified candidates 0 / 0; mean CPU latency 0.14424999999993512 ms.
- **B1:** top-1 exact 0.167 (95% CI 0.033–0.300, n=30); top-3 exact 0.267 (95% CI 0.100–0.433, n=30); top-1 AST match 0.167 (95% CI 0.033–0.300, n=30); verified candidates 69 / 69; mean CPU latency 45.90845666666658 ms.
- **B2:** top-1 exact 0.200 (95% CI 0.067–0.367, n=30); top-3 exact 0.267 (95% CI 0.100–0.433, n=30); top-1 AST match 0.200 (95% CI 0.067–0.367, n=30); verified candidates 69 / 69; mean CPU latency 43.82196666666652 ms.

## Limitations

Synthetic generator distribution, single-error corruption, MiniC-only grammar, parser validity distinct from exact correctness, and no semantic-preservation guarantee.
