"""Fail if program IDs or normalized MiniC sources leak across dataset splits."""

from __future__ import annotations

import argparse
from pathlib import Path

from arbora_ml.data import assert_no_test_train_leakage, check_splits, load_records


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", default="ml/data")
    args = parser.parse_args()
    data_dir = Path(args.data_dir)
    splits = {
        name: load_records(data_dir / f"{name}.jsonl")
        for name in ("train", "val", "test")
    }
    check_splits(splits)
    assert_no_test_train_leakage(
        [str(row["code"]) for row in splits["train"]],
        [str(row.get("corrupted", row["code"])) for row in splits["test"]],
    )
    print("Leakage checks passed: program IDs and normalized code are split-isolated.")


if __name__ == "__main__":
    main()
