"""Convert exported OOD records to the clean/corrupted split files used by evaluate.py."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from arbora_ml.utils import read_jsonl, write_jsonl


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--in", dest="input", default="ml/data/ood.jsonl")
    parser.add_argument("--out-dir", default="ml/data")
    args = parser.parse_args()
    grouped: dict[str, dict[str, Any]] = {}
    corruptions: list[dict[str, Any]] = []
    for row in read_jsonl(args.input):
        program_id = str(row["program_id"])
        grouped.setdefault(program_id, {
            "id": program_id,
            "program_id": program_id,
            "code": row["original"],
            "ast_bracketed": row["ast_bracketed"],
            "size_class": row.get("dataset", "ood"),
        })
        corruptions.append({
            "id": f"{program_id}_corrupt_{row['error_type']}",
            "original": row["original"],
            "corrupted": row["corrupted"],
            "error_type": row["error_type"],
            "token_index": row["token_index"],
        })
    output = Path(args.out_dir)
    output.mkdir(parents=True, exist_ok=True)
    write_jsonl(output / "ood.jsonl", grouped.values())
    write_jsonl(output / "ood-corrupted.jsonl", corruptions)
    for task in ("repair", "ast"):
        from arbora_ml.data import make_task_rows

        rows, counts = make_task_rows(
            task,
            list(grouped.values()),
            corruptions if task == "repair" else None,
            max_tokens=384,
        )
        write_jsonl(output / f"ood-{task}.jsonl", rows)
        if task == "repair":
            kept_ids = {str(row["id"]) for row in rows}
            write_jsonl(
                output / "ood-corrupted-filtered.jsonl",
                [row for row in corruptions if str(row["id"]) in kept_ids],
            )
        print(f"OOD {task}: {counts}")


if __name__ == "__main__":
    main()
