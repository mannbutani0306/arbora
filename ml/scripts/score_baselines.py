"""Add bootstrap intervals and per-slice summaries to TypeScript baseline observations."""

from __future__ import annotations

import argparse
from collections import defaultdict
from pathlib import Path
from typing import Any

from arbora_ml.utils import bootstrap_interval, read_jsonl

METRICS = ("top1_exact", "top3_exact", "top1_ast_match", "top3_ast_match")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--in", dest="input", required=True, help="run-baselines observations JSONL")
    parser.add_argument("--out", default="ml/results/evaluation_baselines.json")
    args = parser.parse_args()
    observations = list(read_jsonl(args.input))
    report: dict[str, Any] = {
        "task": "repair",
        "dataset": "Phase 3 TypeScript parser holdout",
        "n_test": sum(1 for row in observations if row["baseline"] == "B0"),
        "n_test_programs": len({
            str(row["id"]).split("_corrupt_", 1)[0]
            for row in observations
            if row["baseline"] == "B0"
        }),
        "models": {},
    }
    for baseline in sorted({str(row["baseline"]) for row in observations}):
        rows = [row for row in observations if row["baseline"] == baseline]
        metric_rows: dict[str, list[float]] = {
            metric: [float(bool(row[metric])) for row in rows]
            for metric in METRICS
        }
        candidate_count = sum(int(row["candidate_count"]) for row in rows)
        verified_count = sum(int(row["verified_candidate_count"]) for row in rows)
        metric_rows["verified"] = [
            float(int(row["verified_candidate_count"]) > 0) for row in rows
        ]
        intervals = {key: bootstrap_interval(value, seed=42) for key, value in metric_rows.items()}
        by_error: dict[str, list[float]] = defaultdict(list)
        by_length: dict[str, list[float]] = defaultdict(list)
        by_position: dict[str, list[float]] = defaultdict(list)
        for row in rows:
            value = float(bool(row["top1_exact"]))
            by_error[str(row["error_type"])].append(value)
            by_length[str(row["size_bucket"])].append(value)
            by_position[str(row["error_position"])].append(value)
        latencies = sorted(float(row["latency_ms"]) for row in rows)
        report["models"][baseline] = {
            "metrics": intervals,
            "verified_candidate_rate": (
                bootstrap_interval(
                    [
                        float(index < verified_count)
                        for index in range(candidate_count)
                    ],
                    seed=42,
                )
                if candidate_count
                else {"estimate": None, "lower": None, "upper": None, "n": 0}
            ),
            "candidate_counts": {
                "verified": verified_count,
                "all": candidate_count,
            },
            "by_error_type": {
                key: bootstrap_interval(value, seed=42) for key, value in sorted(by_error.items())
            },
            "by_size_bucket": {
                key: bootstrap_interval(value, seed=42) for key, value in sorted(by_length.items())
            },
            "by_error_position": {
                key: bootstrap_interval(value, seed=42) for key, value in sorted(by_position.items())
            },
            "latency_ms": {
                "mean": sum(latencies) / len(latencies) if latencies else None,
                "median": latencies[len(latencies) // 2] if latencies else None,
                "p95": latencies[max(0, int(0.95 * len(latencies) + 0.999999) - 1)] if latencies else None,
                "measured_device": "cpu",
            },
            "parameter_count": 0,
            "n_cases": len(rows),
        }
    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    import json

    output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Wrote bootstrap baseline report to {output}")


if __name__ == "__main__":
    main()
