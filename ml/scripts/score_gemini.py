"""Score cached Gemini responses with the TypeScript parser oracle."""

from __future__ import annotations

import argparse
from collections import defaultdict
from pathlib import Path
from typing import Any

from arbora_ml.data import load_records, token_count
from arbora_ml.oracle import parse_codes
from arbora_ml.utils import bootstrap_interval, read_jsonl


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", default="ml/results/gemini_repair_cache.jsonl")
    parser.add_argument("--test", required=True)
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--out", default="ml/results/evaluation_gemini_repair.json")
    args = parser.parse_args()
    clean = {str(row["id"]): row for row in load_records(args.test)}
    cached = list(read_jsonl(args.cache))
    oracle = parse_codes([str(row["prediction"]) for row in cached], args.repo_root)
    exact: list[float] = []
    ast_match: list[float] = []
    verified: list[float] = []
    by_error: dict[str, list[float]] = defaultdict(list)
    by_size: dict[str, list[float]] = defaultdict(list)
    by_position: dict[str, list[float]] = defaultdict(list)
    for row, parsed in zip(cached, oracle, strict=True):
        program_id = str(row["id"]).split("_corrupt_", 1)[0]
        if program_id not in clean:
            raise ValueError(f"Cached Gemini response is not in the test split: {row['id']}")
        truth = str(row["original"])
        correct = float(str(row["prediction"]) == truth)
        valid = float(bool(parsed["ok"]))
        exact.append(correct)
        verified.append(valid)
        ast_match.append(float(
            valid and parsed.get("ast_bracketed") == clean[program_id].get("ast_bracketed")
        ))
        by_error[str(row.get("error_type", "unknown"))].append(correct)
        token_length = token_count(clean[program_id])
        size = "small" if token_length <= 80 else "medium" if token_length <= 200 else "large"
        by_size[size].append(correct)
        index = int(row.get("token_index", 0))
        by_position["start" if index < token_length / 3 else "middle" if index < 2 * token_length / 3 else "end"].append(correct)
    import json
    import statistics

    latencies = [float(row["latency_ms"]) for row in cached if "latency_ms" in row]
    report: dict[str, Any] = {
        "task": "repair",
        "model": cached[0]["model"] if cached else "unknown",
        "date_utc": cached[0].get("requested_at_utc") if cached else None,
        "temperature": 0,
        "candidates_per_example": 1,
        "parameter_count": None,
        "n_test": len(cached),
        "metrics": {
            "top1_exact": bootstrap_interval(exact, seed=42),
            "top3_exact": bootstrap_interval(exact, seed=42),
            "top1_ast_match": bootstrap_interval(ast_match, seed=42),
            "top3_ast_match": bootstrap_interval(ast_match, seed=42),
            "verified": bootstrap_interval(verified, seed=42),
        },
        "by_error_type": {
            key: bootstrap_interval(value, seed=42) for key, value in sorted(by_error.items())
        },
        "by_size_bucket": {
            key: bootstrap_interval(value, seed=42) for key, value in sorted(by_size.items())
        },
        "by_error_position": {
            key: bootstrap_interval(value, seed=42) for key, value in sorted(by_position.items())
        },
        "latency_ms": {
            "mean": statistics.mean(latencies) if latencies else None,
            "median": statistics.median(latencies) if latencies else None,
            "p95": sorted(latencies)[int(0.95 * (len(latencies) - 1))] if latencies else None,
            "measured_device": "local HTTP client",
        },
        "prompt_manifest": str(Path(args.cache).with_suffix(".manifest.json")),
        "cache": args.cache,
    }
    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Wrote cached Gemini scores to {output}")


if __name__ == "__main__":
    main()
