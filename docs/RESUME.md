# Resume, LinkedIn, and portfolio wording

Use only results present in checked-in evaluation JSON. Replace `[X%]` only after confirming the artifact, test-set size, denominator, and evaluation date. Do not imply the baseline metric is an ML metric.

## Resume bullet options

1. Built Arbora, a React/TypeScript MiniC compiler playground with deterministic lexing, recursive-descent/Pratt parsing, AST inspection, and source-linked diagnostics.
2. Implemented a hybrid repair flow in which classical and remote engines propose candidates and a local deterministic parser verifies syntax before any candidate is labeled Verified.
3. Created seeded MiniC repair baselines with program-level split isolation, parser-confirmed corruptions, and separate top-k exact, AST-match, and validity metrics; in the committed synthetic 505-corruption test set, B2 top-1 exact was **187/505 (37.0%)**.
4. Added property, golden, component, browser, bundle-secret, and RLS test workflows; latest observed local Vitest run: **31 files / 267 tests passed**. Replace with a dated CI run URL if citing in a formal application.

> B1 top-1 exact was 154/505 (30.5%). B1 and B2 both record 214/505 (42.4%) top-3 exact. Always state that these are synthetic test-set results, not neural model results.

## LinkedIn post template

I built Arbora, an inspectable MiniC compiler playground that combines deterministic parsing with repair proposals.

The key distinction: **“Verified” means the candidate parses; it does not mean the candidate is correct.** When ground truth is known, Arbora reports exact and AST matches separately.

On the committed **[synthetic dataset name]** test set (**[N cases]** cases; see [`results/baselines.json`](../results/baselines.json)), **[B1/B2]** reached **[X% top-1 exact]** and **[Y% top-3 exact]**. These are baseline results—not a trained neural-model claim. I am still working on independent held-out data and completed model evaluation.

Project: https://github.com/mannbutani0306/arbora
Demo: TODO — verify the public URL is live before posting.

## Metric provenance

| Placeholder/key    | Artifact key                                                                                                   | Required qualification                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `[X% top-1 exact]` | `metrics["B1:overall"].top1_exact_rate` or `metrics["B2:overall"].top1_exact_rate` in `results/baselines.json` | State B1/B2, 505 corruption cases, seed 42, synthetic corpus |
| `[Y% top-3 exact]` | `metrics["B1:overall"].top3_exact_rate` or `metrics["B2:overall"].top3_exact_rate`                             | State top-3 and test-case denominator                        |
| `[X%]` with CI     | `models.B1/B2.metrics.top1_exact` in `ml/results/evaluation_baselines.json`                                    | State the separate quick run: 30 cases, 26 source programs   |
| `[N cases]`        | `test_programs * corruptions_per_program` in `results/baselines.json`                                          | This equals 505 for the committed artifact                   |
| `[test-set name]`  | `dataset` in the report or evaluation protocol                                                                 | Do not call it real-world or production data                 |
| `[CI run]`         | GitHub Actions workflow run                                                                                    | Include run URL/date and coverage artifact when used         |

## Portfolio description

Arbora is a browser-based compiler-design project for a deliberately small C-like language. It implements a deterministic lexer and hand-written parser, exposes tokens and AST structure through an interactive UI, and compares classical and optional model-backed repair proposals. All repair proposals cross a local parser-verification boundary; syntax validity, exact ground-truth match, and AST match remain separate outcomes. The repository includes seeded baseline artifacts, leakage checks, and CI validation. Current public claims are limited to the measured synthetic baseline results; trained-model performance and broad language generalization remain unreported.
