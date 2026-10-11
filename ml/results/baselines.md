# Baseline evaluation

Training programs: 811; test programs: 26; evaluated corruptions: 30.

| Baseline / group | Cases | Verified | Top-1 exact | Top-3 exact | Top-1 AST | Top-3 AST |
|---|---:|---:|---:|---:|---:|---:|
| B0:overall | 30 | N/A | 0.00% | 0.00% | 0.00% | 0.00% |
| B0:error_type:delete | 9 | N/A | 0.00% | 0.00% | 0.00% | 0.00% |
| B0:length_bucket:large | 11 | N/A | 0.00% | 0.00% | 0.00% | 0.00% |
| B1:overall | 30 | 100.00% | 16.67% | 26.67% | 16.67% | 26.67% |
| B1:error_type:delete | 9 | 100.00% | 11.11% | 44.44% | 11.11% | 44.44% |
| B1:length_bucket:large | 11 | 100.00% | 18.18% | 27.27% | 18.18% | 27.27% |
| B2:overall | 30 | 100.00% | 20.00% | 26.67% | 20.00% | 26.67% |
| B2:error_type:delete | 9 | 100.00% | 22.22% | 44.44% | 22.22% | 44.44% |
| B2:length_bucket:large | 11 | 100.00% | 18.18% | 27.27% | 18.18% | 27.27% |
| B0:error_type:natural | 5 | N/A | 0.00% | 0.00% | 0.00% | 0.00% |
| B0:length_bucket:small | 10 | N/A | 0.00% | 0.00% | 0.00% | 0.00% |
| B1:error_type:natural | 5 | 100.00% | 20.00% | 20.00% | 20.00% | 20.00% |
| B1:length_bucket:small | 10 | 100.00% | 20.00% | 40.00% | 20.00% | 40.00% |
| B2:error_type:natural | 5 | 100.00% | 20.00% | 20.00% | 20.00% | 20.00% |
| B2:length_bucket:small | 10 | 100.00% | 30.00% | 40.00% | 30.00% | 40.00% |
| B0:length_bucket:medium | 9 | N/A | 0.00% | 0.00% | 0.00% | 0.00% |
| B1:length_bucket:medium | 9 | 100.00% | 11.11% | 11.11% | 11.11% | 11.11% |
| B2:length_bucket:medium | 9 | 100.00% | 11.11% | 11.11% | 11.11% | 11.11% |
| B0:error_type:replace | 7 | N/A | 0.00% | 0.00% | 0.00% | 0.00% |
| B1:error_type:replace | 7 | 100.00% | 14.29% | 14.29% | 14.29% | 14.29% |
| B2:error_type:replace | 7 | 100.00% | 14.29% | 14.29% | 14.29% | 14.29% |
| B0:error_type:swap | 3 | N/A | 0.00% | 0.00% | 0.00% | 0.00% |
| B1:error_type:swap | 3 | 100.00% | 0.00% | 0.00% | 0.00% | 0.00% |
| B2:error_type:swap | 3 | 100.00% | 0.00% | 0.00% | 0.00% | 0.00% |
| B0:error_type:insert | 6 | N/A | 0.00% | 0.00% | 0.00% | 0.00% |
| B1:error_type:insert | 6 | 100.00% | 33.33% | 33.33% | 33.33% | 33.33% |
| B2:error_type:insert | 6 | 100.00% | 33.33% | 33.33% | 33.33% | 33.33% |
