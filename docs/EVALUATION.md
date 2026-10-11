# Evaluation protocol

This document defines the reproducible evaluation used by the baseline CLIs and the in-browser Benchmarks page. The deterministic MiniC parser is the oracle for syntax validity and the reference AST.

## Program corpus

`generateProgram(seed, options)` uses Mulberry32 and a probabilistic grammar. The seed and size class completely determine its output. Generated programs use tracked declarations and function parameters, call only functions defined earlier, bound nesting and token length, and are accepted only after parsing with zero errors.

The 20 source-controlled examples remain available as the `handwritten` set. The evaluation corpus is generated separately. `tools/generate-dataset.ts` emits one JSONL record per program with its numeric seed, size class, code, token sequence, bracketed reference AST, and SHA-256 hash of the serialized reference AST. Duplicate token streams are omitted.

For repeatable local baselines, `npm run bench:baselines` generates 1,000 programs starting at seed 42, then assigns whole program IDs to splits using SHA-256 of `42:<program-id>`: buckets 0–79 are training, 80–89 validation, and 90–99 test. IDs are assigned to exactly one split. The trigram language model is trained only from the training split. Validation is materialized for future model selection and is not used by the current baselines. `tools/split-dataset.ts` allows the same split rule to be applied to a larger corpus.

## Syntax errors and repairs

`tools/corrupt-dataset.ts` and the browser benchmark error injector retain the original source as ground truth. Structural mutations are seeded; natural mutations cover common punctuation and keyword mistakes. A mutation is included only when the deterministic parser reports an error, with at most 20 mutation attempts. The in-browser suite uses a fixed generator seed and evaluates the retained handwritten examples plus at least 100 generated programs.

Baselines expose `repair(corruptedCode) => Candidate[]`:

- **B0 — none:** returns no candidates. Its exact-repair rate is zero for parser-invalid inputs by construction.
- **B1 — classicalRepair:** bounded enumerative edits; only parser-verified repairs are returned.
- **B2 — ngramRepair:** reranks B1 candidates using a token trigram model with add-k smoothing. It cannot create candidates and therefore cannot promote an unverified repair.

`tools/run-baselines.ts` always trains B2 from `ml/data/train.jsonl`, then evaluates test programs after five seeded corruption types. It writes stable JSON and Markdown outputs without time-dependent fields.

## Metrics

- **Validity / verified:** a candidate is valid when the deterministic parser reports zero errors. Validity says nothing about whether it preserves the intended program.
- **Verified rate:** valid candidates divided by all candidates (repair scoring); in the browser summary it is the share of test cases with at least one parser-verified candidate. The denominator is stated by each report.
- **Exact match:** candidate and ground-truth token streams are identical, ignoring whitespace and comments. Identifiers, literals, keywords, and operators remain significant.
- **Top-k exact:** at least one of the first *k* candidates token-matches ground truth. Top-1 examines only the first candidate; top-3 examines at most three.
- **AST match:** parser-produced trees have identical structure and node data after ignoring node IDs and source spans. The AST metric tool also reports exact structural node-type/shape match separately from validity.
- **Top-k AST match:** at least one of the first *k* candidates has an AST match.
- **Node F1:** harmonic mean of precision and recall for the multiset of `(node type, depth, parent type)` tuples, using the deterministic parser's AST as reference.
- **TED:** Zhang–Shasha tree edit distance with unit insertion, deletion, and relabel costs, using the deterministic parser's AST as reference. Lower is better; zero indicates structural identity under node-type labels.
- **Ablation exact rate:** B0 exact rate, B1 top-1 exact rate, AI raw top-3 exact rate, and AI top-3 exact rate after filtering out candidates that fail deterministic parsing are shown separately.

The baseline JSON includes denominators and success counts for each rate so reported values can be independently recomputed. A verified rate is `N/A` when a baseline returns no candidates. `tools/score-repairs.ts` reports overall, by error type, and by source token-length bucket; `tools/score-ast.ts` reports schema validity, structural exact match, node F1, and TED.

## Reproducing results

Run:

```sh
npm ci
npm run bench:baselines
```

To create a larger raw corpus:

```sh
npx tsx tools/generate-dataset.ts --n 50000 --seed 42 --out ml/data/raw.jsonl
npx tsx tools/split-dataset.ts --in ml/data/raw.jsonl --seed 42 --out-dir ml/data
npx tsx tools/run-baselines.ts --test ml/data/test.jsonl --train ml/data/train.jsonl --out results/baselines.json
```

`tools/parse-batch.ts` can independently verify a JSONL source field in one TypeScript process:

```sh
npx tsx tools/parse-batch.ts --in ml/data/test.jsonl --field code --out ml/data/test-parse.jsonl
```

## Threats to validity

- The grammar generator has a synthetic distribution and may underrepresent idiomatic or adversarial programs written by people.
- The 20 handwritten examples are a small, selected set and are not an independent natural-language corpus.
- The corruption suite assumes one injected error per sample. Multiple interacting mistakes, semantic errors, and valid-but-wrong programs are not represented by the syntax error filter.
- Generator and mutation logic encode MiniC grammar knowledge that may align unusually well with the parser or classical repair search; results are not evidence of general C compiler performance.
- Add-k trigram rankings depend on tokenization, vocabulary, and the training split. The current B2 is a transparent baseline, not a tuned language model.
- AST comparison uses structural fields represented by the parser. It does not establish semantic equivalence, runtime behavior, or preservation of external requirements.
- A fixed seed enables repeatability but does not measure variance across seeds. Interview or research claims should include additional seeds, held-out manually authored programs, and confidence intervals before generalization.
