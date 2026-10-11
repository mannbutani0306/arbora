"""Generate labeled, colorblind-safe plots from observed evaluation artifacts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def plot_results(results_dir: str | Path = "ml/results", runs_dir: str | Path = "ml/runs") -> list[str]:
    """Render available metrics and training history; missing trained artifacts are skipped."""
    import matplotlib.pyplot as plt
    import numpy as np
    import seaborn as sns

    destination = Path(results_dir)
    destination.mkdir(parents=True, exist_ok=True)
    sns.set_theme(style="whitegrid", palette="colorblind")
    outputs: list[str] = []
    baseline_path = destination / "evaluation_baselines.json"
    if baseline_path.exists():
        report = json.loads(baseline_path.read_text(encoding="utf-8"))
        models = report.get("models", {})
        labels = sorted(models)
        estimates = [
            models[label].get("metrics", {}).get("top1_exact", {}).get("estimate")
            for label in labels
        ]
        usable = [(label, value) for label, value in zip(labels, estimates, strict=True) if value is not None]
        if usable:
            figure, axis = plt.subplots(figsize=(7, 4))
            means = np.asarray([item[1] for item in usable], dtype=float)
            errors = [
                models[label]["metrics"]["top1_exact"]
                for label, _ in usable
            ]
            lower = np.asarray([max(0, means[i] - errors[i]["lower"]) for i in range(len(usable))])
            upper = np.asarray([max(0, errors[i]["upper"] - means[i]) for i in range(len(usable))])
            axis.bar([item[0] for item in usable], means, yerr=np.vstack([lower, upper]), capsize=4)
            axis.set_ylim(0, 1)
            axis.set_ylabel("Top-1 exact repair rate")
            axis.set_xlabel("Baseline")
            axis.set_title(f"TypeScript baselines (95% bootstrap CI; n={report.get('n_test', 0)} cases)")
            figure.tight_layout()
            file = destination / "repair_baselines_ci.png"
            figure.savefig(file, dpi=160)
            plt.close(figure)
            outputs.append(str(file))

            figure, axis = plt.subplots(figsize=(8, 5))
            for label in labels:
                model = models[label]
                groups = model.get("by_error_type", {})
                x_values = list(groups)
                y_values = [groups[key]["estimate"] for key in x_values]
                lower = [y_values[i] - groups[x_values[i]]["lower"] for i in range(len(x_values))]
                upper = [groups[x_values[i]]["upper"] - y_values[i] for i in range(len(x_values))]
                axis.errorbar(x_values, y_values, yerr=np.vstack([lower, upper]), marker="o", capsize=3, label=label)
            axis.set_ylim(0, 1)
            axis.set_xlabel("Injected syntax error type")
            axis.set_ylabel("Top-1 exact repair rate")
            axis.set_title("Baseline exact match by error type")
            axis.legend()
            figure.tight_layout()
            file = destination / "repair_by_error_type.png"
            figure.savefig(file, dpi=160)
            plt.close(figure)
            outputs.append(str(file))

            figure, axis = plt.subplots(figsize=(7, 4))
            for label in labels:
                groups = models[label].get("by_size_bucket", {})
                x_values = list(groups)
                y_values = [groups[key]["estimate"] for key in x_values]
                lower = [y_values[i] - groups[x_values[i]]["lower"] for i in range(len(x_values))]
                upper = [groups[x_values[i]]["upper"] - y_values[i] for i in range(len(x_values))]
                axis.errorbar(x_values, y_values, yerr=np.vstack([lower, upper]), marker="o", capsize=3, label=label)
            axis.set_ylim(0, 1)
            axis.set_xlabel("Program size bucket")
            axis.set_ylabel("Top-1 exact repair rate")
            axis.set_title("Baseline exact match by size")
            axis.legend()
            figure.tight_layout()
            file = destination / "repair_by_size_bucket.png"
            figure.savefig(file, dpi=160)
            plt.close(figure)
            outputs.append(str(file))

            figure, axis = plt.subplots(figsize=(7, 4))
            for label in labels:
                model = models[label]
                accuracy = model.get("metrics", {}).get("top1_exact", {}).get("estimate")
                latency = model.get("latency_ms", {}).get("mean")
                if accuracy is not None and latency is not None:
                    axis.scatter(latency, accuracy, label=label, s=70)
                    axis.annotate(label, (latency, accuracy), xytext=(5, 5), textcoords="offset points")
            axis.set_xlabel("Mean CPU latency (ms / case)")
            axis.set_ylabel("Top-1 exact repair rate")
            axis.set_title("Latency versus exact correctness (baselines)")
            axis.set_ylim(0, 1)
            figure.tight_layout()
            file = destination / "repair_latency_vs_accuracy.png"
            figure.savefig(file, dpi=160)
            plt.close(figure)
            outputs.append(str(file))
    for task in ("repair", "ast"):
        path = destination / f"evaluation_{task}.json"
        if not path.exists():
            continue
        report: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
        metrics = report.get("metrics", {})
        keys = [key for key in ("top1_exact", "top3_exact", "top1_ast_match", "top3_ast_match", "verified", "exact_match", "validity", "node_f1") if key in metrics]
        values = [metrics[key].get("estimate") for key in keys]
        intervals = [metrics[key] for key in keys]
        if keys and all(value is not None for value in values):
            figure, axis = plt.subplots(figsize=(9, 5))
            means = np.asarray(values, dtype=float)
            lower = np.asarray([max(0, means[i] - float(intervals[i]["lower"])) for i in range(len(keys))])
            upper = np.asarray([max(0, float(intervals[i]["upper"]) - means[i]) for i in range(len(keys))])
            axis.bar(keys, means, yerr=np.vstack([lower, upper]), capsize=4)
            axis.set_ylabel("Rate / score")
            axis.set_ylim(0, 1)
            axis.set_title(f"{task.upper()} evaluation (95% bootstrap CI; n={report.get('n_test', metrics.get('n_test', 'see report'))})")
            axis.tick_params(axis="x", rotation=20)
            figure.tight_layout()
            file = destination / f"{task}_metrics.png"
            figure.savefig(file, dpi=160)
            plt.close(figure)
            outputs.append(str(file))

        for name, group_key in (("error_type", "by_error_type"), ("size_bucket", "by_size_bucket")):
            groups = report.get(group_key, {})
            if not groups:
                continue
            labels = list(groups)
            estimates = [groups[key].get("estimate") for key in labels]
            usable = [(label, value) for label, value in zip(labels, estimates, strict=True) if value is not None]
            if usable:
                figure, axis = plt.subplots(figsize=(8, 4))
                axis.bar([item[0] for item in usable], [item[1] for item in usable])
                axis.set_ylabel("Top-1 exact match")
                axis.set_xlabel(name.replace("_", " ").title())
                axis.set_ylim(0, 1)
                axis.set_title(f"{task.upper()} exact match by {name.replace('_', ' ')}")
                figure.tight_layout()
                file = destination / f"{task}_by_{name}.png"
                figure.savefig(file, dpi=160)
                plt.close(figure)
                outputs.append(str(file))

    for task in ("repair", "ast"):
        state = Path(runs_dir) / f"{task}-t5" / "trainer_state.json"
        if not state.exists():
            continue
        history = json.loads(state.read_text(encoding="utf-8")).get("log_history", [])
        train = [(row["step"], row["loss"]) for row in history if "loss" in row]
        valid = [(row.get("epoch", row["step"]), row["eval_loss"]) for row in history if "eval_loss" in row]
        if train or valid:
            figure, axis = plt.subplots(figsize=(8, 4))
            if train:
                axis.plot([item[0] for item in train], [item[1] for item in train], label="Train loss")
            if valid:
                axis.plot([item[0] for item in valid], [item[1] for item in valid], marker="o", label="Validation loss")
            axis.set_xlabel("Step / epoch")
            axis.set_ylabel("Loss")
            axis.set_title(f"{task.upper()} training and validation curves")
            axis.legend()
            figure.tight_layout()
            file = destination / f"{task}_training_curves.png"
            figure.savefig(file, dpi=160)
            plt.close(figure)
            outputs.append(str(file))
    return outputs


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results", default="ml/results")
    parser.add_argument("--runs", default="ml/runs")
    options = parser.parse_args()
    print("\n".join(plot_results(options.results, options.runs)))
