# Contributing to Arbora

Thanks for helping improve Arbora. Keep changes focused and preserve the deterministic compiler as the source of truth.

## Before you start

- Search existing issues and code before proposing a new abstraction.
- For significant behavior or grammar changes, open an issue describing the use case and expected behavior first.
- Never include credentials, private user source, generated checkpoints, or unreviewed datasets in a pull request.

## Development

```sh
npm ci
npm run dev
```

For local Supabase-backed features, copy `.env.example` to an ignored local env file and use only the public Supabase URL and anon key in `VITE_` variables. Provider keys and service-role credentials must stay server-side.

## Code principles

- Keep `src/core` deterministic and free of network, DOM, React, and AI dependencies.
- Treat every AI response as untrusted; validate network boundaries with Zod.
- Never mark a proposal Verified without parsing it locally and receiving zero errors.
- Do not use `any` in new TypeScript code.
- Add Vitest coverage for every new module and update directly related documentation.
- Keep parser validity, exact correctness, AST match, and semantic claims distinct.
- Only report computed measurements from checked-in result files or a reproducible live computation.

## Validation

Run the smallest relevant tests while iterating, then before opening a PR:

```sh
npm run typecheck
npm run lint
npm test
```

For changes touching deployment, the gateway, evaluation, or UI flows, also run applicable CI commands from [docs/TESTING.md](docs/TESTING.md). Explain any checks not run.

## Pull requests

- Use a descriptive title and explain the problem, approach, and behavior impact.
- Include test results and screenshots/media for visible UI changes.
- State the source, denominator, and dataset for every new metric.
- Call out migrations, new secrets, environment changes, and deployment steps.
- Keep unrelated formatting and behavior changes in separate commits.
