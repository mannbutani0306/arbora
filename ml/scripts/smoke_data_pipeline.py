"""CPU smoke test for dataset generation, corruption, task prep, and TS verification."""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

from arbora_ml.data import load_records
from arbora_ml.oracle import parse_codes


def run(command: list[str], root: Path, env: dict[str, str]) -> None:
    subprocess.run(command, cwd=root, env=env, check=True)


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    env = os.environ.copy()
    env["PYTHONPATH"] = str(root / "ml" / "src")
    npx = "npx.cmd" if os.name == "nt" else "npx"
    with tempfile.TemporaryDirectory(prefix="arbora-ml-smoke-") as temporary:
        data = Path(temporary) / "data"
        data.mkdir()
        raw = data / "raw.jsonl"
        run(
            [npx, "tsx", "tools/generate-dataset.ts", "--n", "120", "--seed", "42", "--out", str(raw)],
            root,
            env,
        )
        run(
            [npx, "tsx", "tools/split-dataset.ts", "--in", str(raw), "--seed", "42", "--out-dir", str(data)],
            root,
            env,
        )
        run(
            [
                sys.executable,
                "ml/scripts/prepare_data.py",
                "--repo-root",
                str(root),
                "--data-dir",
                str(data),
                "--per-program",
                "1",
            ],
            root,
            env,
        )
        clean = load_records(data / "test.jsonl")
        damaged = load_records(data / "test-corrupted-filtered.jsonl")
        repair_rows = load_records(data / "test-repair.jsonl")
        ast_rows = load_records(data / "test-ast.jsonl")
        if not clean or not damaged or not repair_rows or not ast_rows:
            raise AssertionError("Smoke corpus did not produce non-empty test/task examples.")
        parsed_clean = parse_codes((row["code"] for row in clean), root)
        parsed_damaged = parse_codes((row["corrupted"] for row in damaged), root)
        if any(result["error_count"] != 0 for result in parsed_clean):
            raise AssertionError("Generated clean test source failed the TypeScript parser.")
        if any(result["error_count"] == 0 for result in parsed_damaged):
            raise AssertionError("A retained smoke corruption unexpectedly parses.")
        print(
            "CPU data/oracle smoke passed: "
            f"{len(clean)} clean test programs, {len(damaged)} parser-rejected corruptions, "
            f"{len(repair_rows)} repair rows, {len(ast_rows)} AST rows."
        )
        print("Neural training is not part of this smoke test; it requires PyTorch and model weights.")


if __name__ == "__main__":
    main()
