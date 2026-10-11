# Arbora MiniC ML

Reproducible Hugging Face experiments for **syntax repair** and **AST linearization**. The deterministic TypeScript parser is the only syntax-validity oracle; this project does not claim semantic equivalence.

## Reproduction

Use Python 3.11 (Colab's standard runtime) and Node.js 22. From the repository root:

```bash
npm ci
python -m venv .venv
# Activate the environment, then:
python -m pip install -r ml/requirements.txt
make -f ml/Makefile data
make -f ml/Makefile train-repair
make -f ml/Makefile train-ast
make -f ml/Makefile eval
make -f ml/Makefile plots
```

`data` generates 50,000 seed-42 programs using Phase 3, creates program-ID-isolated 80/10/10 splits, injects three parser-confirmed errors per program, prepares both tasks, drops inputs over 384 source tokens and then over 384 CodeT5-tokenized input/target tokens, reports those counts, and checks leakage. Generated data and checkpoints are ignored by git. For the same-split classical comparison, run:

```bash
make -f ml/Makefile baselines
```

This selects the same deterministic 300 corrupted test IDs as Gemini and the repair model. This exhaustive TypeScript repair baseline can be much slower than neural inference. It writes per-case observations for bootstrap intervals and CPU latency; model size is zero parameters. It is intentionally separate from training so a long oracle benchmark is not mistaken for model runtime.

### Tasks and models

- **Repair:** `repair: ` plus formatting-escaped corrupted MiniC -> formatting-escaped original code. Newline, spaces, tabs and `<` are reversible explicit tokens. Before preprocessing, the real CodeT5 tokenizer must pass a lossless round-trip check on 1,000 source programs; preprocessing stops if it fails.
- **AST:** `ast: ` plus source -> Phase 3's `(Program ...)` bracketed AST, which has no source spans or IDs.
- Both configs use independent `Salesforce/codet5-small` models. Separate checkpoints avoid task interference and fit the Colab T4 memory budget more predictably than multitask training.
- Default: 4 epochs (within the requested 3–5), AdamW, lr `3e-4`, linear warmup/decay, epoch validation, exact-match checkpoint selection, early stopping, seed 42, batch 8 × gradient accumulation 2, FP16 when enabled. Trainer CSV logs are written under each run directory. W&B is enabled only when `WANDB_API_KEY` is set.
- Training resumes with `--resume` (auto-detect) or `--resume ml/runs/repair-t5/checkpoint-N`.

The configs target a Colab T4 (16 GB VRAM). No GPU or pretrained model was available for this local implementation session, so there is **no measured full-training runtime** yet. A 50k corpus and four epochs is a multi-hour GPU experiment in planning terms, not a timing claim. Use the notebook's 5k / 1-epoch quick mode to smoke-test; its under-10-minute target depends on model download, Colab load and storage and is not guaranteed.

## Evaluation and honesty

Repair generation returns 8 beams. The original beam order supplies raw top-1/top-3 exact and AST-match rates. A single batch call to `tools/parse-batch.ts` then moves parser-valid candidates ahead of invalid candidates; the evaluation reports verified-filtered top-1/top-3 separately. Parser validity is not correctness. Exact repair compares complete output bytes (formatting is part of the target); AST match requires the oracle's bracketed AST to match the clean source AST.

AST evaluation delegates to `tools/score-ast.ts`: schema validity, exact match, node F1 and Zhang–Shasha TED. The constrained score treats malformed output as a failure; output is never silently repaired. All reported rates receive a seeded 5,000-resample percentile bootstrap 95% interval. Reports include test size, error type, size class, error position, parameter count, measured device latency mean/median/p95, and up to 30 failure examples with machine-suggested categories explicitly marked for human confirmation.

`make -f ml/Makefile gemini` uses a fixed prompt, temperature 0, deterministic ID hash subset of 300, `GEMINI_MODEL` and `GEMINI_API_KEY` from the process environment, and caches raw responses. Its date/model/prompt manifest is saved alongside the cache and the scoring script checks responses through the TypeScript oracle. Never pass secrets as command-line arguments or commit them.

OOD evaluation uses 12 valid Supabase sample programs and the 20 retained handwritten templates, each subjected to five parser-confirmed error modes. Run `make -f ml/Makefile ood` with Supabase configured. The exporter stops rather than substituting fewer records if it cannot retrieve exactly 12 valid database samples.

`results/summary.md` distinguishes measured TypeScript baseline observations from neural model results. The checked-in baseline artifacts are a quick 30-corruption subset for smoke evaluation, not the planned 300-case comparison. Until a model has actually trained and evaluated, neural metrics are explicitly “not run”; no placeholder rates are presented as results.

## Hardware / expected resource use

CodeT5-small is approximately 60M parameters per task; the exact count is read from the loaded checkpoint and saved in its report. Batch size, accumulation and FP16 are configurable in YAML. T4 GPU is the intended full-training device. CPU is supported for data preparation, tests, metrics and small inference smoke tests, but full seq2seq training on CPU is not a practical target. Model downloads require network access and several hundred MB of cache per checkpoint.

## Publishing

Copy `ml/.env.example` to `ml/.env` for local Supabase publication only; it is gitignored. Hub upload needs `HF_TOKEN`, `HF_REPAIR_REPO_ID` and `HF_AST_REPO_ID` in the environment. Use `ml/scripts/push_to_hub.py` and `ml/scripts/publish_results.py`. Results publishing checks tracked files for the active service-role key, prints a loud warning and refuses to publish if found.

Install the optional publishing/OOD clients only when needed: `python -m pip install peft==0.14.0 supabase==2.13.0`.

## Tests

```bash
make -f ml/Makefile smoke
PYTHONPATH=ml/src python -m pytest ml/tests
```

The CPU smoke test generates a small corpus, creates deterministic splits and parser-confirmed corruptions, prepares repair/AST examples, and verifies clean/corrupted source through the TypeScript oracle. It deliberately does not pretend to train a neural model. Unit tests cover 1,000 reversible source encodings, task row construction, split identity and normalized-source leakage, and oracle error reporting.
