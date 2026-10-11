"""Prepare repair/AST JSONL splits using Phase 3's TypeScript corruption CLI."""

from __future__ import annotations

import argparse
import os
import subprocess
from pathlib import Path

from arbora_ml.data import check_splits, load_records, make_task_rows
from arbora_ml.utils import read_jsonl, write_jsonl


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--data-dir", default="ml/data")
    parser.add_argument("--per-program", type=int, default=3)
    args = parser.parse_args()
    root = Path(args.repo_root).resolve()
    data = Path(args.data_dir)
    split_rows = {name: load_records(data / f"{name}.jsonl") for name in ("train", "val", "test")}
    check_splits(split_rows)
    all_code = [str(row["code"]) for rows in split_rows.values() for row in rows]
    if len({code for code in all_code}) != len(all_code):
        raise ValueError("Duplicate exact code records found across splits.")
    for split, clean in split_rows.items():
        corruption_file = data / f"{split}-corrupted.jsonl"
        command = [
            "npx.cmd" if os.name == "nt" else "npx",
            "tsx", str(root / "tools" / "corrupt-dataset.ts"),
            "--in", str((data / f"{split}.jsonl").resolve()),
            "--per-program", str(args.per_program),
            "--out", str(corruption_file.resolve()),
        ]
        subprocess.run(command, cwd=root, check=True)
        corrupted = list(read_jsonl(corruption_file))
        repair, repair_counts = make_task_rows(
            "repair", clean, corrupted, max_tokens=384
        )
        ast, ast_counts = make_task_rows("ast", clean, max_tokens=384)
        write_jsonl(data / f"{split}-repair.jsonl", repair)
        write_jsonl(data / f"{split}-ast.jsonl", ast)
        if split == "test":
            kept_ids = {str(row["id"]) for row in repair}
            filtered = [row for row in corrupted if str(row["id"]) in kept_ids]
            write_jsonl(data / "test-corrupted-filtered.jsonl", filtered)
            print(
                f"test corrupted examples: {len(corrupted)} total, {len(filtered)} retained "
                f"by the <=384 source-token filter."
            )
        print(f"{split} repair: {repair_counts}")
        print(f"{split} ast: {ast_counts}")
        if split == "test":
            train_codes = [str(row["code"]) for row in split_rows["train"]]
            test_corrupted = [str(row["corrupted"]) for row in corrupted]
            from arbora_ml.data import assert_no_test_train_leakage

            assert_no_test_train_leakage(train_codes, test_corrupted)


if __name__ == "__main__":
    main()
