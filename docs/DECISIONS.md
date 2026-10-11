# Architecture Decision Records

Decisions are concise records of the current design. Revisit them when evidence or requirements change.

## ADR 001 — Hybrid design: deterministic parser is the source of truth

- **Status:** Accepted
- **Decision:** Use the deterministic MiniC parser as the syntax and AST oracle. Models may propose candidate source or ASTs, but proposals are untrusted until checked locally.
- **Reason:** A proposal mechanism and a verifier have different roles; model confidence is not a correctness proof.
- **Consequence:** “Verified” means parser-valid, not semantically correct or faithful to user intent.

## ADR 002 — Verifier-in-the-loop for repair

- **Status:** Accepted
- **Decision:** Parse each proposed repair and rank parser-valid candidates ahead of invalid proposals. Keep exact/AST correctness as separate metrics when ground truth exists.
- **Reason:** Syntax validity is mechanically checkable, whereas candidate plausibility alone cannot establish correctness.
- **Consequence:** Parser-valid but wrong candidates remain possible and are reported as such in ground-truth evaluations.

## ADR 003 — Hand-written recursive-descent parser with Pratt expressions

- **Status:** Accepted
- **Decision:** Keep the deterministic frontend hand-written: recursive descent for statements/declarations, Pratt parsing for expressions.
- **Reason:** This gives direct control over source spans, diagnostics, recovery, AST shape, and expression precedence for the deliberately small MiniC grammar.
- **Consequence:** The grammar analyzer documents LL(1) conflicts rather than claiming the complete grammar is LL(1). Notable ambiguities include declaration-vs-function prefixes and dangling `else`; recursive descent resolves them with lookahead and nearest-unmatched-`if` matching.

## ADR 004 — Supabase Edge Function as AI gateway

- **Status:** Accepted
- **Decision:** Route remote AI tasks through the Supabase Edge Function instead of calling model APIs directly from the browser.
- **Reason:** This centralizes authentication, request validation, rate limits, provider timeouts, and secret custody.
- **Consequence:** Remote AI features depend on a deployed gateway. The local deterministic/compiler path remains useful without it.

## ADR 005 — CodeT5-small as an experimental model

- **Status:** Accepted for the experiment; model results pending
- **Decision:** Use `Salesforce/codet5-small` as the configured encoder-decoder starting point for independent repair and AST-linearization tasks.
- **Reason:** It is a code-oriented seq2seq checkpoint small enough to target constrained GPU experiments while supporting text-to-text generation.
- **Consequence:** This is a research choice, not evidence that it is best for MiniC. No accuracy or speed claim is made until a checkpoint has been trained and evaluated.

## ADR 006 — Synthetic data with explicit distribution caveats

- **Status:** Accepted
- **Decision:** Generate deterministic seedable MiniC examples and parser-confirmed corruptions for reproducible experiments; retain handwritten examples separately.
- **Reason:** The generator makes large, controlled error-type and split experiments possible.
- **Consequence:** Results may reflect the generator and parser's shared grammar assumptions. OOD and independently authored data are needed before generalization claims.

## ADR 007 — Validity and correctness are distinct

- **Status:** Accepted
- **Decision:** Report parser validity, exact repair, AST match, and other task-specific metrics separately.
- **Reason:** A syntactically valid candidate can still differ from the original program or intent.
- **Consequence:** Never describe a verified rate as an accuracy rate. Every reported rate needs its denominator and dataset.

## ADR 008 — Public shares use a constrained Supabase RPC

- **Status:** Accepted
- **Decision:** Fetch public analyses through `get_public_analysis(slug)` rather than granting broad anonymous table reads.
- **Reason:** The RPC can return only the requested row when `is_public = true`, while user-owned rows remain protected by RLS.
- **Consequence:** Keep the function's `search_path` fixed, review its returned columns, and test the behavior against the deployed migrations.

## ADR 009 — Grammar conflict set is documented

- **Status:** Accepted
- **Decision:** Do not represent the full MiniC grammar as LL(1) while the computed predictive table has conflicts.
- **Reason:** Top-level type prefixes, array declaration tails, statement alternatives, and optional `else` are overlapping in the broad CFG representation. The parser uses lookahead and greedy nearest-`if` association for the dangling-else case.
- **Consequence:** Grammar Lab reports conflicts and the hand-written parser remains the executable parser; see [EVALUATION.md](EVALUATION.md) and [grammarAnalyzer tests](../src/core/grammarAnalyzer.test.ts).
