# Baseline evaluation

Training programs: 811; test programs: 101; corruptions per program: 5.

| Baseline / group | Cases | Verified | Top-1 exact | Top-3 exact | Top-1 AST | Top-3 AST |
|---|---:|---:|---:|---:|---:|---:|
| B0:overall | 505 | N/A | 0.00% | 0.00% | 0.00% | 0.00% |
| B0:error_type:delete | 101 | N/A | 0.00% | 0.00% | 0.00% | 0.00% |
| B0:length_bucket:medium | 130 | N/A | 0.00% | 0.00% | 0.00% | 0.00% |
| B1:overall | 505 | 100.00% | 30.50% | 42.38% | 30.69% | 42.38% |
| B1:error_type:delete | 101 | 100.00% | 24.75% | 42.57% | 24.75% | 42.57% |
| B1:length_bucket:medium | 130 | 100.00% | 36.92% | 45.38% | 37.69% | 45.38% |
| B2:overall | 505 | 100.00% | 37.03% | 42.38% | 37.03% | 42.38% |
| B2:error_type:delete | 101 | 100.00% | 28.71% | 42.57% | 28.71% | 42.57% |
| B2:length_bucket:medium | 130 | 100.00% | 38.46% | 45.38% | 38.46% | 45.38% |
| B0:error_type:insert | 101 | N/A | 0.00% | 0.00% | 0.00% | 0.00% |
| B1:error_type:insert | 101 | 100.00% | 27.72% | 46.53% | 28.71% | 46.53% |
| B2:error_type:insert | 101 | 100.00% | 46.53% | 46.53% | 46.53% | 46.53% |
| B0:error_type:swap | 101 | N/A | 0.00% | 0.00% | 0.00% | 0.00% |
| B1:error_type:swap | 101 | 100.00% | 11.88% | 13.86% | 11.88% | 13.86% |
| B2:error_type:swap | 101 | 100.00% | 13.86% | 13.86% | 13.86% | 13.86% |
| B0:error_type:replace | 101 | N/A | 0.00% | 0.00% | 0.00% | 0.00% |
| B1:error_type:replace | 101 | 100.00% | 34.65% | 41.58% | 34.65% | 41.58% |
| B2:error_type:replace | 101 | 100.00% | 38.61% | 41.58% | 38.61% | 41.58% |
| B0:error_type:natural | 101 | N/A | 0.00% | 0.00% | 0.00% | 0.00% |
| B1:error_type:natural | 101 | 100.00% | 53.47% | 67.33% | 53.47% | 67.33% |
| B2:error_type:natural | 101 | 100.00% | 57.43% | 67.33% | 57.43% | 67.33% |
| B0:length_bucket:small | 210 | N/A | 0.00% | 0.00% | 0.00% | 0.00% |
| B1:length_bucket:small | 210 | 100.00% | 30.48% | 43.33% | 30.48% | 43.33% |
| B2:length_bucket:small | 210 | 100.00% | 38.10% | 43.33% | 38.10% | 43.33% |
| B0:length_bucket:large | 165 | N/A | 0.00% | 0.00% | 0.00% | 0.00% |
| B1:length_bucket:large | 165 | 100.00% | 25.45% | 38.79% | 25.45% | 38.79% |
| B2:length_bucket:large | 165 | 100.00% | 34.55% | 38.79% | 34.55% | 38.79% |
