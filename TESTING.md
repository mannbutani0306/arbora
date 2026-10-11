# Testing strategy

## Local checks

```bash
npm ci
npm run typecheck
npm run lint
npm run test:coverage
npm run test:deno
npm run build
npm run test:bundle-security
npx playwright install chromium
npm run test:e2e
```

Vitest covers deterministic compiler properties (round-tripping and idempotent unparsing,
arbitrary and shuffled input termination, depth-limit behavior, and verified repair output),
AST goldens, exact grammar FIRST/FOLLOW/conflict expectations, result-schema loading/export,
and React UI behavior. `src/core/goldenAst.test.ts` snapshots the 20 checked-in handwritten
programs and the 3 offline samples that are present in `src/lib/dataService.ts`; the remaining
9 Supabase examples are not checked into this repository and are not fabricated as goldens.

`tools/check-data-leak.ts --train ... --validation ... --test ...` checks program IDs,
normalized source duplication, and corrupted examples copied from training code.
`npm run test:bundle-security` scans every file in `dist/` for `AIza`, `GEMINI_API_KEY`,
and `service_role` markers. It runs after the production build in CI.

The Playwright suite starts Vite with fake local Supabase configuration and intercepts
database, AI gateway, and authentication requests. Chromium traces, screenshots, and the
HTML report are uploaded when a CI run fails.

## Supabase RLS

Apply migrations to a disposable local Supabase database, then run the pgTAP assertions:

```bash
npx supabase start
npx supabase db reset
npx supabase test db
```

`supabase/tests/rls.sql` seeds two isolated test users and test rows inside a transaction,
assumes the `user_data_rls` migration has been applied, and rolls all fixtures back. It
checks cross-user access to analyses, benchmark runs, and repair events; anonymous public
sharing; sample read-only access; and denial of anonymous access to `ai_usage`.

## CI

`.github/workflows/ci.yml` runs typecheck, ESLint, Vitest with V8 coverage, Deno tests,
the Vite build, the bundle-secret scan, and Playwright on Chromium.
