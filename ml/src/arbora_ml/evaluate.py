"""Beam evaluation, TypeScript-oracle verification, and uncertainty summaries."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import statistics
import subprocess
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from .data import load_records, token_count
from .models import parameter_count
from .oracle import verify_candidates
from .tokenization import decode_source, wrap_source
from .utils import bootstrap_interval, read_jsonl, seed_everything, write_jsonl


def exact_code(left: str, right: str) -> bool:
    """Exact source equality: whitespace and comments are deliberately significant."""
    return left == right


def headline_metrics(
    rows: list[dict[str, Any]], latency: list[float], params: int, device: str
) -> dict[str, Any]:
    """Create means and seeded percentile-bootstrap intervals for headline measures."""
    metrics: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        for key in (
            "top1_exact", "top3_exact", "top1_ast_match", "top3_ast_match",
            "verified", "constrained_exact", "verified_top1_exact",
            "verified_top3_exact", "verified_top1_ast_match",
            "verified_top3_ast_match",
        ):
            if key in row:
                metrics[key].append(float(bool(row[key])))
        if "node_f1" in row:
            metrics["node_f1"].append(float(row["node_f1"]))
        if "ted" in row and row["ted"] is not None:
            metrics["ted"].append(float(row["ted"]))
    summary = {
        key: bootstrap_interval(values, seed=42)
        for key, values in sorted(metrics.items())
    }
    summary["latency_ms"] = {
        "mean": float(statistics.mean(latency)) if latency else None,
        "median": float(statistics.median(latency)) if latency else None,
        "p95": float(sorted(latency)[math.ceil(0.95 * len(latency)) - 1]) if latency else None,
        "n": len(latency),
        "measured_device": device,
        "gpu_mean_ms": float(statistics.mean(latency)) if latency and device.startswith("cuda") else None,
        "cpu_mean_ms": float(statistics.mean(latency)) if latency and device == "cpu" else None,
    }
    summary["parameter_count"] = params
    summary["n_test"] = len(rows)
    summary["bootstrap"] = {"method": "percentile", "replicates": 5000, "seed": 42}
    return summary


def position_bucket(index: Any, count: int) -> str:
    """Map a token position to start, middle, or end."""
    if count <= 0 or not isinstance(index, (int, float)):
        return "unknown"
    ratio = float(index) / count
    return "start" if ratio < 1 / 3 else "middle" if ratio < 2 / 3 else "end"


def summarize_groups(rows: list[dict[str, Any]], metric: str) -> dict[str, Any]:
    """Return per-group estimates and bootstrap confidence intervals."""
    groups: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        for field in ("error_type", "size_bucket", "error_position"):
            key = str(row.get(field, "unknown"))
            groups[f"{field}:{key}"].append(float(bool(row.get(metric, False))))
    return {key: bootstrap_interval(value, seed=42) for key, value in sorted(groups.items())}


def group_summary(rows: list[dict[str, Any]], field: str, metric: str) -> dict[str, Any]:
    """Bootstrap one requested breakdown dimension."""
    groups: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        groups[str(row.get(field, "unknown"))].append(float(bool(row.get(metric, False))))
    return {key: bootstrap_interval(value, seed=42) for key, value in sorted(groups.items())}


def run_repair(args: argparse.Namespace) -> dict[str, Any]:
    """Generate top-eight repair beams, then verify and rank with the TS parser."""
    import torch
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    seed_everything(args.seed)
    root = Path(args.repo_root).resolve()
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForSeq2SeqLM.from_pretrained(args.model)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(device)
    model.eval()
    clean = load_records(args.test)
    clean_by_id = {str(row["id"]): row for row in clean}
    corruptions = list(read_jsonl(args.corrupted)) if args.corrupted else []
    if not corruptions:
        raise ValueError("Repair evaluation requires --corrupted from the same program split.")
    by_program = {str(row["id"]): row for row in clean}
    selected = (
        sorted(
            corruptions,
            key=lambda row: hashlib.sha256(
                f"{args.seed}:{row['id']}".encode("utf-8")
            ).hexdigest(),
        )[: args.limit]
        if args.limit
        else corruptions
    )
    source_groups: list[list[str]] = []
    intermediate: list[dict[str, Any]] = []
    latencies: list[float] = []
    for damaged in selected:
        program_id = str(damaged["id"]).split("_corrupt_", 1)[0]
        if program_id not in by_program:
            raise ValueError(f"Corruption {damaged['id']} is not in the provided test split.")
        encoded = tokenizer(
            wrap_source("repair", str(damaged["corrupted"])),
            return_tensors="pt",
            truncation=True,
            max_length=384,
        ).to(device)
        started = time.perf_counter()
        with torch.inference_mode():
            output = model.generate(
                **encoded,
                num_beams=8,
                num_return_sequences=8,
                max_new_tokens=384,
                early_stopping=True,
            )
        latencies.append((time.perf_counter() - started) * 1000)
        candidates = [decode_source(tokenizer, sequence, skip_special_tokens=False) for sequence in output]
        source_groups.append(candidates)
        clean_row = by_program[program_id]
        intermediate.append({
            "id": str(damaged["id"]),
            "program_id": program_id,
            "original": str(damaged["original"]),
            "corrupted": str(damaged["corrupted"]),
            "error_type": str(damaged.get("error_type", "unknown")),
            "token_index": damaged.get("token_index"),
            "size_bucket": str(clean_row.get("size_class", "unknown")),
            "source_token_count": token_count(clean_row),
        })
    oracle_groups = verify_candidates(source_groups, root)
    metrics_rows: list[dict[str, Any]] = []
    predictions: list[dict[str, Any]] = []
    for record, candidates, oracle in zip(intermediate, source_groups, oracle_groups, strict=True):
        checked = [
            {
                "code": candidate,
                "verified": bool(parsed.get("ok")),
                "ast": parsed.get("ast_bracketed") if parsed.get("ok") else None,
            }
            for candidate, parsed in zip(candidates, oracle, strict=True)
        ]
        ranked = sorted(enumerate(checked), key=lambda item: (not item[1]["verified"], item[0]))
        verified_candidates = [candidate for _, candidate in ranked]
        expected_ast = clean_by_id[record["program_id"]].get("ast_bracketed")
        exact_flags = [exact_code(candidate, record["original"]) for candidate in candidates]
        verified_exact = [exact_code(candidate["code"], record["original"]) for candidate in verified_candidates]
        ast_flags = [
            bool(expected_ast and candidate["verified"] and candidate["ast"] == expected_ast)
            for candidate in checked
        ]
        verified_ast = [
            bool(expected_ast and candidate["verified"] and candidate["ast"] == expected_ast)
            for candidate in verified_candidates
        ]
        row = {
            **record,
            "verified": any(item["verified"] for item in checked),
            "top1_exact": bool(exact_flags and exact_flags[0]),
            "top3_exact": any(exact_flags[:3]),
            "top1_ast_match": bool(ast_flags and ast_flags[0]),
            "top3_ast_match": any(ast_flags[:3]),
            "constrained_exact": bool(verified_exact and verified_exact[0]),
            "verified_top1_exact": bool(verified_exact and verified_exact[0]),
            "verified_top3_exact": any(verified_exact[:3]),
            "verified_top1_ast_match": bool(verified_ast and verified_ast[0]),
            "verified_top3_ast_match": any(verified_ast[:3]),
            "error_position": position_bucket(record["token_index"], record["source_token_count"]),
        }
        metrics_rows.append(row)
        predictions.append({
            **record,
            "candidates": candidates,
            "verified_candidates": verified_candidates,
            "oracle": checked,
            **{key: value for key, value in row.items() if key not in record},
        })
    params = parameter_count(model)
    failure_examples = failure_sample(predictions)
    report = {
        "task": "repair",
        "model": args.model,
        "dataset": args.dataset,
        "model_parameters": params,
        "n_test": len(metrics_rows),
        "config": args.config,
        "device": device,
        "decode": {"num_beams": 8, "num_return_sequences": 8, "max_new_tokens": 384},
        "metrics": headline_metrics(metrics_rows, latencies, params, device),
        "by_error_type": group_summary(metrics_rows, "error_type", "top1_exact"),
        "by_size_bucket": group_summary(metrics_rows, "size_bucket", "top1_exact"),
        "by_error_position": group_summary(metrics_rows, "error_position", "top1_exact"),
        "failures": failure_examples,
        "failure_category_counts": dict(Counter(
            item["suggested_category"] for item in failure_examples
        )),
        "failure_review_note": "Categories are heuristic suggestions for human confirmation, not manual labels.",
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    write_jsonl(out.with_suffix(".predictions.jsonl"), predictions)
    return report


def failure_sample(rows: list[dict[str, Any]], limit: int = 30) -> list[dict[str, Any]]:
    """Select reproducible failure examples with explicitly unconfirmed suggestions."""
    failures = [row for row in rows if not row.get("top1_exact")]
    failures.sort(key=lambda row: str(row["id"]))
    output = []
    for row in failures[:limit]:
        if not row.get("verified"):
            suggestion = "invalid output"
        elif any(candidate == row["original"] for candidate in row.get("candidates", [])):
            suggestion = "wrong location"
        elif len(str(row.get("candidates", [""])[0])) > 1.25 * max(1, len(row["original"])):
            suggestion = "over-editing"
        else:
            suggestion = "wrong token"
        output.append({
            "id": row["id"],
            "suggested_category": suggestion,
            "review_status": "requires_human_confirmation",
        })
    return output


def run_ast(args: argparse.Namespace) -> dict[str, Any]:
    """Evaluate AST generations with tools/score-ast.ts and report constrained metrics."""
    import torch
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
    from .tokenization import wrap_source

    seed_everything(args.seed)
    root = Path(args.repo_root).resolve()
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForSeq2SeqLM.from_pretrained(args.model)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(device)
    model.eval()
    clean = load_records(args.test)
    selected = (
        sorted(
            clean,
            key=lambda row: hashlib.sha256(
                f"{args.seed}:{row['id']}".encode("utf-8")
            ).hexdigest(),
        )[: args.limit]
        if args.limit
        else clean
    )
    prediction_rows: list[dict[str, Any]] = []
    latencies: list[float] = []
    for record in selected:
        encoded = tokenizer(
            wrap_source("ast", str(record["code"])),
            return_tensors="pt",
            truncation=True,
            max_length=384,
        ).to(device)
        started = time.perf_counter()
        with torch.inference_mode():
            output = model.generate(**encoded, num_beams=8, max_new_tokens=384)
        latencies.append((time.perf_counter() - started) * 1000)
        predicted = decode_source(tokenizer, output[0], skip_special_tokens=False)
        prediction_rows.append({
            "id": record["id"],
            "code": record["code"],
            "predicted_ast_bracketed": predicted,
        })
    output_path = Path(args.out)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    predictions_path = output_path.with_suffix(".predictions.jsonl")
    write_jsonl(predictions_path, prediction_rows)
    scored_path = output_path.with_suffix(".scored.jsonl")
    tool = root / "tools" / "score-ast.ts"
    result = subprocess.run(
        ["npx.cmd" if os.name == "nt" else "npx", "tsx", str(tool), "--in", str(predictions_path), "--out", str(scored_path)],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode:
        raise RuntimeError(f"AST scorer failed: {result.stderr.strip()}")
    scored = list(read_jsonl(scored_path))
    summary_path = scored_path.with_suffix(".summary.json")
    ts_summary = json.loads(summary_path.read_text(encoding="utf-8"))
    values = {
        "validity": [float(bool(row["validity"])) for row in scored],
        "exact_match": [float(bool(row["exact_match"])) for row in scored],
        "node_f1": [float(row["node_f1"]) for row in scored],
        "ted": [float(row["zhang_shasha_ted"]) for row in scored if row["zhang_shasha_ted"] is not None],
    }
    report = {
        "task": "ast",
        "model": args.model,
        "dataset": args.dataset,
        "config": args.config,
        "device": device,
        "model_parameters": parameter_count(model),
        "n_test": len(scored),
        "metrics": {
            key: bootstrap_interval(value, seed=42)
            for key, value in values.items()
        },
        "constrained": {
            "definition": "Invalid output receives zero exact match and zero node-F1; no repair is applied.",
            "validity_rate": bootstrap_interval(values["validity"], seed=42),
            "exact_match_rate": bootstrap_interval(values["exact_match"], seed=42),
            "node_f1": bootstrap_interval(values["node_f1"], seed=42),
            "mean_ted": bootstrap_interval(values["ted"], seed=42),
        },
        "latency_ms": {
            "mean": statistics.mean(latencies) if latencies else None,
            "median": statistics.median(latencies) if latencies else None,
            "p95": sorted(latencies)[math.ceil(0.95 * len(latencies)) - 1] if latencies else None,
            "device": device,
        },
        "typescript_oracle_summary": ts_summary,
        "failures": [
            {
                "id": row["id"],
                "suggested_category": "invalid output" if not row["validity"] else "wrong token",
                "review_status": "requires_human_confirmation",
            }
            for row in scored
            if not row["exact_match"]
        ][:30],
    }
    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task", choices=("repair", "ast"), required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--test", required=True)
    parser.add_argument("--corrupted")
    parser.add_argument("--out", required=True)
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--config", default=None)
    parser.add_argument("--dataset", default="generated-test")
    args = parser.parse_args()
    report = run_repair(args) if args.task == "repair" else run_ast(args)
    print(json.dumps(report["metrics"], indent=2))


if __name__ == "__main__":
    main()
