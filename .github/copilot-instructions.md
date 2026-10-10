# Arbora Copilot Instructions

## Stack and folder map

- React, TypeScript, Vite, Tailwind CSS, Vitest, and Zod.
- `src/core`: deterministic compiler; no network access or DOM dependencies.
- `src/ai`: model clients; call them only through the AI gateway.
- `src/components`: reusable UI components.
- `src/pages`: route-level screens.
- `src/lib`: shared application services and utilities.
- `supabase/functions`: server-side Supabase Edge Functions.
- `ml`: Python machine-learning code and data workflows.
- `tools`: Node.js command-line tools.
- `docs`: architecture and decision records.

## Core rules

- `src/core` must remain pure and deterministic and must never import from `src/ai`, `src/lib`, or React.
- AI output is never trusted as code. Verify every AI proposal with the deterministic parser before showing it as "Verified".
- Never put secrets in client code.
- Never use `any` in new code. Use Zod at every AI and network boundary.
- Every new module must have Vitest tests.

## UI rules

- Use a light, minimal theme: `#FAFAF9` background, white surfaces, `#E7E5E4` borders, `#1C1917` text, `#78716C` muted text, emerald `#059669` primary, and indigo `#6366F1` for AI-only elements.
- Use Inter and JetBrains Mono.
- Keep labels to 1-3 words and helper text to one line; use tooltips for detail.

## Honesty rules

- Never hard-code, estimate, or invent metrics.
- Every number shown in the UI or README must come from a computed result file or a live computation.

## Workflow

- Make small commits.
- Run `npm run typecheck && npm test` before declaring work done.
- Summarize what changed and what to verify manually.
