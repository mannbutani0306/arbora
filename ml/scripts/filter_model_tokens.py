"""Keep only complete task examples whose HF source and target lengths fit 384 tokens."""

from __future__ import annotations

import argparse
from pathlib import Path

from arbora_ml.data import load_records
from arbora_ml.tokenization import add_minic_special_tokens, tokenizer_round_trip
from arbora_ml.utils import read_jsonl, write_jsonl


def filter_split(data_dir: Path, split: str, model_name: str, maximum: int) -> None:
    from transformers import AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    add_minic_special_tokens(tokenizer)
    raw_path = data_dir / "raw.jsonl"
    roundtrip_rows = list(read_jsonl(raw_path))[:1000] if raw_path.exists() else []
    if not roundtrip_rows:
        roundtrip_rows = load_records(data_dir / f"{split}-ast.jsonl")[:1000]
    failures = [
        str(row.get("id"))
        for row in roundtrip_rows
        if not tokenizer_round_trip(tokenizer, str(row["code"]))
    ]
    if failures:
        raise RuntimeError(
            "Tokenizer formatting round-trip failed for "
            f"{len(failures)} of {len(roundtrip_rows)} checked programs; sample IDs: {failures[:5]}"
        )
    print(f"Lossless tokenizer round-trip passed for {len(roundtrip_rows)} source programs.")
    for task in ("repair", "ast"):
        rows = load_records(data_dir / f"{split}-{task}.jsonl")
        selected = []
        for row in rows:
            source_length = len(tokenizer(str(row["input_text"]), truncation=False)["input_ids"])
            target_length = len(tokenizer(str(row["target_text"]), truncation=False)["input_ids"])
            if source_length <= maximum and target_length <= maximum:
                selected.append(row)
        output = data_dir / f"{split}-{task}-model-filtered.jsonl"
        write_jsonl(output, selected)
        print(
            f"{split} {task}: {len(rows) - len(selected)} over-{maximum}-token "
            f"examples filtered; {len(selected)} retained."
        )
        if task == "repair":
            ids = {str(row["id"]) for row in selected}
            corrupted_path = data_dir / f"{split}-corrupted-filtered.jsonl"
            if corrupted_path.exists():
                damaged = [
                    row for row in load_records(corrupted_path)
                    if str(row.get("id")) in ids
                ]
                write_jsonl(data_dir / f"{split}-corrupted-model-filtered.jsonl", damaged)
                print(
                    f"{split} repair corruptions: {len(damaged)} complete <= {maximum}-token pairs retained."
                )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", default="ml/data")
    parser.add_argument("--split", choices=("train", "val", "test", "ood"), default="test")
    parser.add_argument("--model", default="Salesforce/codet5-small")
    parser.add_argument("--max-tokens", type=int, default=384)
    args = parser.parse_args()
    filter_split(Path(args.data_dir), args.split, args.model, args.max_tokens)


if __name__ == "__main__":
    main()
