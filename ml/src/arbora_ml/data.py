"""Dataset preparation and leakage guards for TypeScript-generated MiniC corpora."""

from __future__ import annotations

import re
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

from .tokenization import wrap_source
from .utils import normalized_code, read_jsonl, write_jsonl

MAX_TOKENS = 384


def load_records(path: str | Path) -> list[dict[str, Any]]:
    """Load a JSONL file as records."""
    return list(read_jsonl(path))


def token_count(record: dict[str, Any]) -> int:
    """Use Phase 3's token list when available; otherwise use a conservative lexer-like count."""
    tokens = record.get("tokens")
    if isinstance(tokens, list):
        return len(tokens)
    return len(re.findall(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|[A-Za-z_]\w*|\d+(?:\.\d+)?|[^\s]', str(record.get("code", ""))))


def make_task_rows(
    task: str,
    clean_records: Iterable[dict[str, Any]],
    corrupted_records: Iterable[dict[str, Any]] | None = None,
    max_tokens: int = MAX_TOKENS,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Build repair or AST seq2seq examples and return explicit filter counts."""
    clean = list(clean_records)
    clean_by_id = {str(row["id"]): row for row in clean if "id" in row}
    counters: Counter[str] = Counter()
    output: list[dict[str, Any]] = []
    if task == "repair":
        if corrupted_records is None:
            raise ValueError("Repair rows require syntax-corrupted inputs.")
        for damaged in corrupted_records:
            original = str(damaged.get("original", ""))
            code = str(damaged.get("corrupted", ""))
            clean_id = str(damaged.get("id", "")).split("_corrupt_", 1)[0]
            if clean_id not in clean_by_id:
                counters["missing_reference"] += 1
                continue
            if max(token_count({"code": original}), token_count({"code": code})) > max_tokens:
                counters["filtered_over_384"] += 1
                continue
            output.append({
                "id": str(damaged["id"]),
                "program_id": clean_id,
                "error_type": damaged.get("error_type", "unknown"),
                "code": code,
                "target": original,
                "input_text": wrap_source("repair", code),
                "target_text": wrap_source("repair", original)[len("repair: "):],
                "size_class": clean_by_id[clean_id].get("size_class", "unknown"),
                "token_index": damaged.get("token_index"),
            })
            counters["kept"] += 1
    elif task == "ast":
        for row in clean:
            code = row.get("code")
            target = row.get("ast_bracketed")
            if not isinstance(code, str) or not isinstance(target, str):
                counters["missing_reference"] += 1
                continue
            if token_count(row) > max_tokens:
                counters["filtered_over_384"] += 1
                continue
            output.append({
                "id": str(row["id"]),
                "program_id": str(row.get("program_id", row["id"])),
                "code": code,
                "target": target,
                "input_text": wrap_source("ast", code),
                "target_text": target,
                "size_class": row.get("size_class", "unknown"),
            })
            counters["kept"] += 1
    else:
        raise ValueError(f"Unknown task: {task}")
    return output, dict(counters)


def prepare_split_files(
    split: str,
    task: str,
    clean_path: str | Path,
    output_path: str | Path,
    corrupted_path: str | Path | None = None,
    max_tokens: int = MAX_TOKENS,
) -> dict[str, int]:
    """Prepare and persist a task-specific JSONL split."""
    clean = load_records(clean_path)
    corrupted = load_records(corrupted_path) if corrupted_path else None
    rows, counts = make_task_rows(task, clean, corrupted, max_tokens)
    write_jsonl(output_path, rows)
    return {**counts, "split_programs": len(clean), "split": split}


def check_splits(splits: dict[str, Iterable[dict[str, Any]]]) -> None:
    """Reject program-ID leakage and duplicate normalized clean programs across splits."""
    owners: dict[str, str] = {}
    programs: dict[str, str] = {}
    for split, rows in splits.items():
        for row in rows:
            program_id = str(row.get("program_id", row.get("id", ""))).split("_corrupt_", 1)[0]
            previous_split = owners.setdefault(program_id, split)
            if previous_split != split:
                raise ValueError(f"Program id {program_id} occurs in {previous_split} and {split}.")
            code = row.get("original", row.get("code", row.get("target")))
            if isinstance(code, str):
                normalized = normalized_code(code)
                prior_id = programs.setdefault(normalized, program_id)
                if prior_id != program_id:
                    raise ValueError(f"Normalized code is duplicated across splits: {prior_id}, {program_id}.")


def assert_no_test_train_leakage(
    training_programs: Iterable[str], corrupted_test_programs: Iterable[str]
) -> None:
    """Ensure test inputs are not exact normalized copies of any training code."""
    training = {normalized_code(code) for code in training_programs}
    leaked = [code for code in corrupted_test_programs if normalized_code(code) in training]
    if leaked:
        raise ValueError(f"Found {len(leaked)} exact normalized test/train leakage records.")
