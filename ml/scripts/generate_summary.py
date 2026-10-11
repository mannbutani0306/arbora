"""Write a compact summary from only evaluation files that actually exist."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def estimate(value: Any) -> str:
    if not isinstance(value, dict) or value.get("estimate") is None:
        return "not available"
    return (
        f"{value['estimate']:.3f} "
        f"(95% CI {value['lower']:.3f}–{value['upper']:.3f}, n={value['n']})"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results", default="ml/results")
    parser.add_argument("--out", default="ml/results/summary.md")
    args = parser.parse_args()
    results_dir = Path(args.results)
    lines = [
        "# Arbora ML evaluation summary",
        "",
        "Only completed evaluation artifacts are summarized. Parser validity is not correctness.",
        "",
    ]
    completed = False
    reports: list[dict[str, Any]] = []
    for filename in sorted(results_dir.glob("evaluation_*.json")):
        report = json.loads(filename.read_text(encoding="utf-8"))
        reports.append(report)
        task = str(report.get("task", filename.stem.removeprefix("evaluation_")))
        if "models" in report:
            program_count = report.get("n_test_programs")
            sample_label = (
                f"{report.get('n_test', 'unknown')} corruptions from "
                f"{program_count} programs"
                if program_count is not None
                else f"{report.get('n_test', 'unknown')} cases"
            )
            lines += [f"## TypeScript baselines ({sample_label})", ""]
            for name, model in sorted(report["models"].items()):
                metrics = model.get("metrics", {})
                lines.append(
                    f"- **{name}:** top-1 exact {estimate(metrics.get('top1_exact'))}; "
                    f"top-3 exact {estimate(metrics.get('top3_exact'))}; "
                    f"top-1 AST match {estimate(metrics.get('top1_ast_match'))}; "
                    f"verified candidates {model.get('candidate_counts', {}).get('verified', 0)} / "
                    f"{model.get('candidate_counts', {}).get('all', 0)}; "
                    f"mean CPU latency {model.get('latency_ms', {}).get('mean')} ms."
                )
            lines.append("")
            completed = True
            continue
        metrics = report.get("metrics", {})
        lines += [f"## {task.upper()} — {report.get('model', 'model')} ({report.get('n_test', metrics.get('n_test', 'unknown'))} cases)", ""]
        for key in ("top1_exact", "top3_exact", "top1_ast_match", "top3_ast_match", "verified", "validity", "exact_match", "node_f1", "ted"):
            if key in metrics:
                lines.append(f"- **{key}:** {estimate(metrics[key])}")
        lines.append("")
        completed = True
    if not completed:
        lines += [
            "No model or baseline evaluation JSON is present yet.",
            "",
            "Neural results are **not run**; no model metric, confidence interval, or latency is claimed.",
            "",
        ]
    for report in reports:
        if report.get("dataset") != "ood":
            continue
        task = report.get("task")
        same_domain = next(
            (
                candidate for candidate in reports
                if candidate.get("task") == task
                and candidate.get("model") == report.get("model")
                and candidate.get("dataset") != "ood"
            ),
            None,
        )
        if same_domain:
            metric_name = "top1_exact" if task == "repair" else "exact_match"
            in_score = same_domain.get("metrics", {}).get(metric_name, {}).get("estimate")
            ood_score = report.get("metrics", {}).get(metric_name, {}).get("estimate")
            if in_score is not None and ood_score is not None:
                drop = (in_score - ood_score) * 100
                lines += [
                    f"## OOD change — {task.upper()}",
                    "",
                    f"Top-1 exact-match change from generated held-out data to OOD: {drop:+.2f} percentage points (positive means a drop).",
                    "",
                ]
    lines += [
        "## Limitations",
        "",
        "Synthetic generator distribution, single-error corruption, MiniC-only grammar, parser validity distinct from exact correctness, and no semantic-preservation guarantee.",
        "",
    ]
    target = Path(args.out)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {target}")


if __name__ == "__main__":
    main()
