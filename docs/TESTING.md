# Testing strategy

The test suite is layered so deterministic compiler behavior, UI integration, and deployment boundaries are independently checked.

## Commands

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run test:deno
npm run test:bundle-security
npm run test:e2e
npm run lighthouse
```

Python ML utilities have a separate test environment:

```sh
python -m pip install -r ml/requirements.txt
PYTHONPATH=ml/src python -m pytest ml/tests
```

## Test layers

| Layer                   | What it checks                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| Core unit tests         | Lexer, parser, grammar analysis, AST utilities, repair algorithms and metrics                            |
| Property and fuzz tests | Parse/unparse properties, arbitrary malformed input termination/shape, and verified classical candidates |
| Golden tests            | Normalized AST snapshots for retained sample programs and handwritten templates                          |
| React component tests   | UI states and interactions using Testing Library                                                         |
| Accessibility checks    | Axe-based UI audits in component tests                                                                   |
| Deno tests              | Shared Edge Function validation/auth/rate-limit behavior                                                 |
| Playwright              | Browser-level flows with mocked external services                                                        |
| Security checks         | Built output scanned for forbidden secret markers; SQL RLS tests document database policy expectations   |
| Lighthouse              | Local built app checked against score and Landing script-transfer budgets                                |

## Coverage policy

`vitest.config.ts` enforces line coverage of at least 90% for `src/core`, 80% for `src/ai`, and 75% overall. CI uploads the generated `coverage/` report as an artifact. Coverage is not a substitute for correctness or test quality.

## Latest known counts

The latest observed local Vitest run reported **33 test files passed, 271 tests passed, and zero failures**. The latest coverage run before the two media/result script tests passed those then-existing tests but **failed its configured thresholds**: overall lines 57.46% (threshold 75%), `src/core` lines 83.24% (threshold 90%), and `src/ai` lines 58.23% (threshold 80%). Do not describe the coverage/CI gate as green. This is not tied to a published GitHub Actions run. TODO: raise coverage, then record the workflow-run URL, date, browser/OS, and passing coverage percentages for an official release report.

## Running database policy tests

Use a disposable local Supabase project; never run destructive policy tests against production data:

```sh
supabase start
supabase test db
```

The SQL policy test is `supabase/tests/rls.sql`. Confirm local migrations are applied before testing. The assertions cover ownership isolation for user rows, public-share access, rate-limit table restrictions, and read-only samples.

## Interpreting failures

- A parser-valid repair can still be wrong. Check exact/AST correctness separately when ground truth exists.
- Playwright uses mocked gateway/model endpoints unless a test explicitly describes an integration dependency.
- Lighthouse results are environment-dependent; preserve generated reports and distinguish local from deployed measurements.
- A bundle scan only detects configured patterns; review build variables and secret handling independently.
